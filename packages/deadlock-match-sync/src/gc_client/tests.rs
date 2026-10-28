use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use futures::{channel::mpsc, sink};
use steam_vent::proto::steammessages_clientserver_friends::cmsg_client_friends_list::Friend;
use steam_vent::proto::steammessages_clientserver_login::CMsgClientLogonResponse;
use steam_vent::{NetMessage, NetMessageHeader};
use tokio::sync::{Notify, Semaphore};

use super::*;

static TEST_LOCK: Mutex<()> = Mutex::const_new(());

struct LaunchHold;

impl LaunchHold {
  fn start() -> Self {
    hold_for_launch();
    Self
  }
}

impl Drop for LaunchHold {
  fn drop(&mut self) {
    end_launch_hold();
  }
}

#[derive(prost::Message)]
struct GcEnvelope {
  #[prost(uint32, optional, tag = "1")]
  appid: Option<u32>,
  #[prost(uint32, optional, tag = "2")]
  msgtype: Option<u32>,
  #[prost(bytes = "vec", optional, tag = "3")]
  payload: Option<Vec<u8>>,
}

struct SteamState {
  playing: AtomicBool,
  logged_off: AtomicBool,
  jobs: AtomicUsize,
  job_started: Notify,
  handshake_started: Notify,
  cleanup_started: Notify,
  allow_cleanup: Semaphore,
}

#[derive(Clone, Copy, PartialEq)]
enum SteamAccount {
  Free,
  PlayingElsewhere,
  // Another session starts a game during the GC handshake.
  LoggedOffAtHandshake,
}

#[derive(Clone, Copy)]
enum GcReplies {
  All,
  HandshakeOnly,
  None,
}

const FRIEND_ID64: u64 = 76561197960265728 + 7;
// More than the 32 messages steam-vent keeps for nobody.
const LOGON_BURST: usize = 40;

// The friends list Steam pushes right after logon: one friend, a pending invite and a
// group.
fn logon_friends_list() -> CMsgClientFriendsList {
  let entry = |id: u64, relationship: u32| Friend {
    ulfriendid: Some(id),
    efriendrelationship: Some(relationship),
    ..Default::default()
  };
  CMsgClientFriendsList {
    bincremental: Some(false),
    friends: vec![
      entry(FRIEND_ID64, FRIEND_RELATIONSHIP_FRIEND),
      entry(FRIEND_ID64 + 1, 2),
      entry(103582791429521408, FRIEND_RELATIONSHIP_FRIEND),
    ],
    ..Default::default()
  }
}

// Exercise steam-vent's real login and GC encoding over an in-memory CM transport.
async fn fake_connection(
  account: SteamAccount,
  replies: GcReplies,
  block_cleanup: bool,
) -> (Connection, LogonListeners, Arc<SteamState>) {
  let state = Arc::new(SteamState {
    playing: AtomicBool::new(false),
    logged_off: AtomicBool::new(false),
    jobs: AtomicUsize::new(0),
    job_started: Notify::new(),
    handshake_started: Notify::new(),
    cleanup_started: Notify::new(),
    allow_cleanup: Semaphore::new(usize::from(!block_cleanup)),
  });
  let recorded = Arc::clone(&state);
  let (tx, rx) = mpsc::unbounded();
  let sender = sink::unfold(tx, move |tx, bytes| {
    let state = Arc::clone(&recorded);
    async move {
      let raw = RawNetMessage::read(bytes)?;
      if raw.kind == EMsg::k_EMsgClientLogon {
        let reply = RawNetMessage::from_message(
          NetMessageHeader::default(),
          CMsgClientLogonResponse {
            eresult: Some(1),
            heartbeat_seconds: Some(60),
            ..Default::default()
          },
        )?;
        tx.unbounded_send(Ok(reply.into_bytes())).unwrap();
        let playing = RawNetMessage::from_message(
          NetMessageHeader::default(),
          CMsgClientPlayingSessionState {
            playing_blocked: Some(account == SteamAccount::PlayingElsewhere),
            ..Default::default()
          },
        )?;
        tx.unbounded_send(Ok(playing.into_bytes())).unwrap();
        let list = RawNetMessage::from_message(NetMessageHeader::default(), logon_friends_list())?;
        tx.unbounded_send(Ok(list.into_bytes())).unwrap();
        for _ in 0..LOGON_BURST {
          let unheard = RawNetMessage::from_message(
            NetMessageHeader::default(),
            CMsgClientPersonaState::default(),
          )?;
          tx.unbounded_send(Ok(unheard.into_bytes())).unwrap();
        }
      } else if raw.kind == EMsg::k_EMsgClientGamesPlayedWithDataBlob {
        let mut raw = raw;
        raw.kind = <CMsgClientGamesPlayed as NetMessage>::KIND.into();
        let message = raw.into_message::<CMsgClientGamesPlayed>()?;
        if message.games_played.is_empty() {
          state.cleanup_started.notify_one();
          state.allow_cleanup.acquire().await.unwrap().forget();
        }
        state
          .playing
          .store(!message.games_played.is_empty(), Ordering::SeqCst);
      } else if raw.kind == EMsg::k_EMsgClientLogOff {
        state.logged_off.store(true, Ordering::SeqCst);
      } else if raw.kind == EMsg::k_EMsgClientToGC {
        let envelope = GcEnvelope::decode(raw.data.as_ref()).unwrap();
        let job = RawNetMessage::read(envelope.payload.unwrap())?;
        if job.kind == MsgKind(4006) {
          state.handshake_started.notify_one();
          if account == SteamAccount::LoggedOffAtHandshake {
            let logged_off = RawNetMessage::from_message(
              NetMessageHeader::default(),
              CMsgClientLoggedOff {
                eresult: Some(EResult::LoggedInElsewhere as i32),
                ..Default::default()
              },
            )?;
            tx.unbounded_send(Ok(logged_off.into_bytes())).unwrap();
            return Ok(tx);
          }
          if matches!(replies, GcReplies::None) {
            return Ok(tx);
          }
        } else {
          state.jobs.fetch_add(1, Ordering::SeqCst);
          state.job_started.notify_one();
          if !matches!(replies, GcReplies::All) {
            return Ok(tx);
          }
        }
        let reply = RawNetMessage::from_message_with_kind(
          NetMessageHeader {
            target_job_id: job.header.source_job_id,
            ..Default::default()
          },
          UntypedMessage(Vec::new()),
          if job.kind == MsgKind(4006) {
            MsgKind(4004)
          } else {
            job.kind
          },
          true,
        )?;
        let envelope = GcEnvelope {
          appid: Some(DEADLOCK_APP_ID),
          msgtype: Some(reply.kind.0 as u32 | 0x8000_0000),
          payload: Some(reply.into_bytes().to_vec()),
        };
        let reply = RawNetMessage::from_message_with_kind(
          NetMessageHeader::default(),
          UntypedMessage(envelope.encode_to_vec()),
          EMsg::k_EMsgClientFromGC.into(),
          true,
        )?;
        tx.unbounded_send(Ok(reply.into_bytes())).unwrap();
      }
      Ok::<_, NetworkError>(tx)
    }
  });
  let unauthenticated = UnAuthenticatedConnection::from_sender_receiver(sender, rx)
    .await
    .unwrap();
  let listeners = LogonListeners::new(&unauthenticated);
  let conn = unauthenticated.anonymous().await.unwrap();
  (conn, listeners, state)
}

fn context() -> AuthContext {
  AuthContext {
    account_name: String::new(),
    steam_id64: 42,
    refresh_token: String::new(),
  }
}

async fn seeded_client(
  replies: GcReplies,
  block_cleanup: bool,
) -> (SteamGcClient, Arc<SteamState>) {
  let (conn, listeners, state) = fake_connection(SteamAccount::Free, replies, block_cleanup).await;
  let gc = GameCoordinator::new(&conn, DEADLOCK_APP_ID).await.unwrap();
  let client = SteamGcClient::new();
  *client.shared.session.lock().await = Some(GcSession {
    steam_id64: 42,
    gc,
    conn,
    friends_list: Some(listeners.friends_list),
    friends: Vec::new(),
    logged_off: listeners.logged_off,
  });
  (client, state)
}

#[tokio::test]
async fn launch_cancels_in_flight_history_and_waits_for_cleanup() {
  let _serial = TEST_LOCK.lock().await;
  let (client, state) = seeded_client(GcReplies::HandshakeOnly, true).await;
  let request_client = client.clone();
  let request = tokio::spawn(async move {
    request_client
      .fetch_match_history(&context(), context().account_id(), None)
      .await
  });
  tokio::time::timeout(Duration::from_secs(1), state.job_started.notified())
    .await
    .unwrap();

  let _hold = LaunchHold::start();
  let release = client.release();
  tokio::pin!(release);
  tokio::select! {
    _ = &mut release => panic!("Launch returned while the sync session was still playing Deadlock"),
    _ = state.cleanup_started.notified() => {}
    _ = tokio::time::sleep(Duration::from_secs(1)) => panic!("Launch did not cancel the stalled GC request"),
  }
  assert!(state.playing.load(Ordering::SeqCst));
  assert!(futures::poll!(&mut release).is_pending());
  state.allow_cleanup.add_permits(1);
  tokio::time::timeout(Duration::from_secs(1), release)
    .await
    .unwrap();
  assert!(matches!(
    request.await.unwrap(),
    Err(MatchSyncError::GameRunning)
  ));
  assert!(!state.playing.load(Ordering::SeqCst));
  assert!(!state.logged_off.load(Ordering::SeqCst));
}

#[tokio::test]
async fn launch_hold_blocks_cached_sessions_and_allows_requests_afterward() {
  let _serial = TEST_LOCK.lock().await;
  let (client, state) = seeded_client(GcReplies::All, false).await;
  let hold = LaunchHold::start();
  let result = client
    .fetch_match_history(&context(), context().account_id(), None)
    .await;
  assert!(matches!(result, Err(MatchSyncError::GameRunning)));
  assert_eq!(state.jobs.load(Ordering::SeqCst), 0);
  drop(hold);

  client
    .fetch_match_history(&context(), context().account_id(), None)
    .await
    .unwrap();
  assert_eq!(state.jobs.load(Ordering::SeqCst), 1);
  client.disconnect().await;
  assert!(!state.playing.load(Ordering::SeqCst));
  assert!(!state.logged_off.load(Ordering::SeqCst));
}

#[tokio::test]
async fn idle_cleanup_preserves_the_desktop_login() {
  let _serial = TEST_LOCK.lock().await;
  let (client, state) = seeded_client(GcReplies::All, false).await;
  assert!(state.playing.load(Ordering::SeqCst));
  client.release().await;
  assert!(!state.playing.load(Ordering::SeqCst));
  assert!(!state.logged_off.load(Ordering::SeqCst));
}

#[tokio::test]
async fn launch_waits_for_cleanup_already_started_by_disconnect() {
  let _serial = TEST_LOCK.lock().await;
  let (client, state) = seeded_client(GcReplies::All, true).await;
  let disconnect = client.disconnect();
  tokio::pin!(disconnect);
  tokio::select! {
    _ = &mut disconnect => panic!("Disconnect returned before cleanup finished"),
    _ = state.cleanup_started.notified() => {}
  }

  let _hold = LaunchHold::start();
  let release = client.release();
  tokio::pin!(release);
  assert!(futures::poll!(&mut release).is_pending());
  state.allow_cleanup.add_permits(1);
  tokio::time::timeout(Duration::from_secs(1), async {
    tokio::join!(disconnect, release);
  })
  .await
  .unwrap();
  assert!(!state.playing.load(Ordering::SeqCst));
  assert!(!state.logged_off.load(Ordering::SeqCst));
}

#[tokio::test]
async fn launch_cancels_a_stalled_handshake_and_waits_for_cleanup() {
  let _serial = TEST_LOCK.lock().await;
  let (conn, listeners, state) = fake_connection(SteamAccount::Free, GcReplies::None, true).await;
  let client = SteamGcClient::new();
  let connecting_client = client.clone();
  let handshake = tokio::spawn(async move {
    let _guard = connecting_client.shared.session.lock().await;
    let mut cancel = connecting_client.shared.launch_cancel.subscribe();
    SteamGcClient::connect_gc(&context(), conn, listeners, &mut cancel).await
  });
  tokio::time::timeout(Duration::from_secs(1), state.handshake_started.notified())
    .await
    .unwrap();

  let _hold = LaunchHold::start();
  let release = client.release();
  tokio::pin!(release);
  tokio::select! {
    _ = &mut release => panic!("Launch returned before handshake cleanup finished"),
    _ = state.cleanup_started.notified() => {}
    _ = tokio::time::sleep(Duration::from_secs(1)) => panic!("Launch did not cancel the GC handshake"),
  }
  assert!(state.playing.load(Ordering::SeqCst));
  state.allow_cleanup.add_permits(1);
  tokio::time::timeout(Duration::from_secs(1), release)
    .await
    .unwrap();
  assert!(matches!(
    handshake.await.unwrap(),
    Err(MatchSyncError::GameRunning)
  ));
  assert!(!state.playing.load(Ordering::SeqCst));
  assert!(!state.logged_off.load(Ordering::SeqCst));
}

async fn connect_as(account: SteamAccount) -> (Result<GcSession, MatchSyncError>, Arc<SteamState>) {
  let (conn, listeners, state) = fake_connection(account, GcReplies::All, false).await;
  let client = SteamGcClient::new();
  let mut cancel = client.shared.launch_cancel.subscribe();
  let result = SteamGcClient::connect_gc(&context(), conn, listeners, &mut cancel).await;
  (result, state)
}

#[tokio::test]
async fn an_account_playing_another_game_never_announces_deadlock() {
  let _serial = TEST_LOCK.lock().await;
  let (result, state) = connect_as(SteamAccount::PlayingElsewhere).await;
  assert!(
    matches!(result, Err(MatchSyncError::AccountInUse)),
    "{:?}",
    result.as_ref().err()
  );
  assert!(!state.playing.load(Ordering::SeqCst));
}

#[tokio::test(start_paused = true)]
async fn a_logoff_for_another_game_during_the_handshake_is_not_a_gc_outage() {
  let _serial = TEST_LOCK.lock().await;
  let (result, _state) = connect_as(SteamAccount::LoggedOffAtHandshake).await;
  assert!(
    matches!(result, Err(MatchSyncError::AccountInUse)),
    "{:?}",
    result.as_ref().err()
  );
}

#[tokio::test]
async fn friends_list_pushed_at_logon_survives_the_logon_burst() {
  let _serial = TEST_LOCK.lock().await;
  let (client, _state) = seeded_client(GcReplies::All, false).await;
  let friends = tokio::time::timeout(Duration::from_secs(1), client.friend_ids(&context()))
    .await
    .unwrap()
    .unwrap();
  assert_eq!(friends, vec![account_id_of(FRIEND_ID64)]);
}

#[tokio::test]
async fn launch_hold_lasts_until_ended() {
  let _serial = TEST_LOCK.lock().await;
  let hold = LaunchHold::start();
  assert!(launch_hold_active());
  drop(hold);
  assert!(!launch_hold_active());
}

fn refusal(error: Option<MatchSyncError>) -> Option<GcRefusal> {
  match error? {
    MatchSyncError::GcRefused(refusal) => Some(refusal),
    _ => None,
  }
}

#[test]
fn salts_results_are_classified_without_deciding_on_a_backoff() {
  use c_msg_client_to_gc_get_match_meta_data_response::EResult;
  assert!(salts_error(None).is_none());
  assert!(salts_error(Some(EResult::KEResultSuccess as i32)).is_none());
  assert!(matches!(
    salts_error(Some(EResult::KEResultRateLimited as i32)),
    Some(MatchSyncError::GcRateLimited)
  ));
  // Waited out through the quotas, not a day-long backoff.
  assert!(!MatchSyncError::GcRateLimited.backs_off_gc());
  for (result, expected) in [
    (EResult::KEResultMatchInFlight, GcRefusal::InFlight),
    (EResult::KEResultInvalidMatch, GcRefusal::InvalidMatch),
    (EResult::KEResultInvalidPermission, GcRefusal::NoPermission),
    (
      EResult::KEResultInternalError,
      GcRefusal::Other(EResult::KEResultInternalError as i32),
    ),
  ] {
    let error = salts_error(Some(result as i32));
    assert!(error.as_ref().is_some_and(|e| !e.backs_off_gc()));
    assert_eq!(refusal(error), Some(expected));
  }
}

#[test]
fn history_results_are_classified_without_deciding_on_a_backoff() {
  use c_msg_client_to_gc_get_match_history_response::EResult;
  assert!(history_error(None).is_none());
  assert!(history_error(Some(EResult::KEResultSuccess as i32)).is_none());
  assert!(matches!(
    history_error(Some(EResult::KEResultRateLimited as i32)),
    Some(MatchSyncError::GcRateLimited)
  ));
  assert_eq!(
    refusal(history_error(Some(
      EResult::KEResultInvalidPermission as i32
    ))),
    Some(GcRefusal::NoPermission)
  );
  assert_eq!(
    refusal(history_error(Some(i32::MAX))),
    Some(GcRefusal::Other(i32::MAX))
  );
}

#[test]
fn a_refusal_about_the_account_itself_backs_it_off() {
  let refused = MatchSyncError::GcRefused(GcRefusal::NoPermission);
  assert!(!refused.backs_off_gc());
  assert!(refused.refusal_as_outage().backs_off_gc());
  assert!(
    !MatchSyncError::GcRateLimited
      .refusal_as_outage()
      .backs_off_gc()
  );
}

#[test]
fn persona_updates_add_to_what_earlier_ones_said() {
  use steam_vent::proto::steammessages_clientserver_friends::cmsg_client_persona_state::Friend;
  const BASE: u64 = 76_561_197_960_265_728;
  let update = |account_id: u32, friend: Friend| CMsgClientPersonaState {
    friends: vec![Friend {
      friendid: Some(BASE + u64::from(account_id)),
      ..friend
    }],
    ..Default::default()
  };
  let requested = HashSet::from([7]);
  let mut personas = HashMap::new();

  merge_personas(
    &mut personas,
    update(
      7,
      Friend {
        game_played_app_id: Some(DEADLOCK_APP_ID),
        persona_state: Some(1),
        last_seen_online: Some(500),
        ..Default::default()
      },
    ),
    &requested,
  );
  // A later update that only carries some fields keeps what the first one said.
  merge_personas(&mut personas, update(7, Friend::default()), &requested);
  // Updates nobody asked for are dropped.
  merge_personas(&mut personas, update(8, Friend::default()), &requested);

  let persona = personas[&7];
  assert!(persona.in_deadlock && persona.online);
  assert_eq!(persona.last_seen, Some(500));
  assert_eq!(personas.len(), 1);
}
