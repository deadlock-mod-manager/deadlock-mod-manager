use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use futures::{channel::mpsc, sink};
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::proto::steammessages_clientserver_login::CMsgClientLogonResponse;
use steam_vent::{NetMessage, NetMessageHeader, NetworkError};
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

#[derive(Clone, Copy)]
enum GcReplies {
  All,
  HandshakeOnly,
  None,
}

// Exercise steam-vent's real login and GC encoding over an in-memory CM transport.
async fn fake_connection(replies: GcReplies, block_cleanup: bool) -> (Connection, Arc<SteamState>) {
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
      } else if raw.kind == EMsg::k_EMsgClientGamesPlayedWithDataBlob {
        let mut raw = raw;
        raw.kind = CMsgClientGamesPlayed::KIND.into();
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
  let conn = UnAuthenticatedConnection::from_sender_receiver(sender, rx)
    .await
    .unwrap()
    .anonymous()
    .await
    .unwrap();
  (conn, state)
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
) -> (Arc<SteamGcClient>, Arc<SteamState>) {
  let (conn, state) = fake_connection(replies, block_cleanup).await;
  let gc = GameCoordinator::new(&conn, DEADLOCK_APP_ID).await.unwrap();
  let client = Arc::new(SteamGcClient::new());
  *client.session.lock().await = Some(GcSession {
    steam_id64: 42,
    gc,
    conn,
  });
  (client, state)
}

#[tokio::test]
async fn launch_cancels_in_flight_history_and_waits_for_cleanup() {
  let _serial = TEST_LOCK.lock().await;
  let (client, state) = seeded_client(GcReplies::HandshakeOnly, true).await;
  let request_client = Arc::clone(&client);
  let request =
    tokio::spawn(async move { request_client.fetch_match_history(&context(), None).await });
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
  let result = client.fetch_match_history(&context(), None).await;
  assert!(matches!(result, Err(MatchSyncError::GameRunning)));
  assert_eq!(state.jobs.load(Ordering::SeqCst), 0);
  drop(hold);

  client.fetch_match_history(&context(), None).await.unwrap();
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
  let (conn, state) = fake_connection(GcReplies::None, true).await;
  let client = Arc::new(SteamGcClient::new());
  let connecting_client = Arc::clone(&client);
  let handshake = tokio::spawn(async move {
    let _guard = connecting_client.session.lock().await;
    let mut cancel = connecting_client.launch_cancel.subscribe();
    SteamGcClient::connect_gc(&context(), conn, &mut cancel).await
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

#[tokio::test]
async fn launch_hold_lasts_until_ended() {
  let _serial = TEST_LOCK.lock().await;
  let hold = LaunchHold::start();
  assert!(launch_hold_active());
  drop(hold);
  assert!(!launch_hold_active());
}
