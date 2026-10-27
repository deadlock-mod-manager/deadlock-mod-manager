//! The Steam Game Coordinator boundary: recover per-match salts and history
//! client-side through the user's own account (`steam-vent` + `CMsgClientToGc*`),
//! plus the account's friends and their Steam persona state. The subsystem never uses
//! deadlock-api's own server-side endpoints.

use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::{Arc, PoisonError};
use std::time::{Duration, Instant};

use futures::future::BoxFuture;
use futures::{FutureExt as _, StreamExt as _};
use prost::Message as _;
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::proto::MsgKind;
use steam_vent::proto::enums_clientserver::{EClientPersonaStateFlag, EMsg};
use steam_vent::proto::steammessages_clientserver::CMsgClientGamesPlayed;
use steam_vent::proto::steammessages_clientserver_friends::{
  CMsgClientFriendsList, CMsgClientPersonaState, CMsgClientRequestFriendData,
};
use steam_vent::{
  Connection, ConnectionError, ConnectionTrait, GameCoordinator, NetworkError, RawNetMessage,
  ReadonlyConnection as _, ServerList, UntypedMessage,
};
use tokio::sync::{Mutex, watch};
use valveprotos::deadlock::{
  CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse,
  CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse, EgcCitadelClientMessages,
  c_msg_client_to_gc_get_match_history_response, c_msg_client_to_gc_get_match_meta_data_response,
};

use super::error::{GcRefusal, MatchSyncError};
use super::friends::Persona;
use super::model::{AuthContext, DEADLOCK_APP_ID, LocalMatch, MatchHistoryPage, MatchSalts};
use crate::steam_user::{account_id_of, is_individual};

// A stalled discover/login/job call must not block cancel/disable indefinitely.
const GC_CALL_TIMEOUT: Duration = Duration::from_secs(30);
const STOP_PLAYING_TIMEOUT: Duration = Duration::from_secs(2);
// Covers the gap until the game process appears and the game-running checks take over.
const LAUNCH_HOLD: Duration = Duration::from_secs(3 * 60);

static LAUNCH_REQUESTED_AT: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);

pub fn hold_for_launch() {
  set_launch_requested_at(Some(Instant::now()));
}

pub fn end_launch_hold() {
  set_launch_requested_at(None);
}

fn set_launch_requested_at(at: Option<Instant>) {
  *LAUNCH_REQUESTED_AT
    .lock()
    .unwrap_or_else(PoisonError::into_inner) = at;
}

fn launch_hold_active() -> bool {
  LAUNCH_REQUESTED_AT
    .lock()
    .unwrap_or_else(PoisonError::into_inner)
    .is_some_and(|at| at.elapsed() < LAUNCH_HOLD)
}

// Steam pushes the friends list right after logon, so it has normally arrived by the
// time it's needed; this only bounds the wait when it never comes. Persona states
// arrive as a burst.
const FRIENDS_WAIT: Duration = Duration::from_secs(5);
const FRIEND_RELATIONSHIP_FRIEND: u32 = 3;

async fn with_timeout<T, E: std::fmt::Display>(
  timeout: Duration,
  label: &str,
  fut: impl Future<Output = Result<T, E>>,
) -> Result<T, MatchSyncError> {
  match tokio::time::timeout(timeout, fut).await {
    Ok(result) => result.map_err(|e| MatchSyncError::GcUnavailable(format!("{label}: {e}"))),
    Err(_) => Err(MatchSyncError::GcUnavailable(format!(
      "{label}: timed out after {timeout:?}"
    ))),
  }
}

async fn until_launch<T>(
  cancel: &mut watch::Receiver<()>,
  fut: impl Future<Output = Result<T, MatchSyncError>>,
) -> Result<T, MatchSyncError> {
  tokio::select! {
    biased;
    _ = cancel.changed() => Err(MatchSyncError::GameRunning),
    result = fut => result,
  }
}

// What a history response's non-success `result` says. Whose history it was decides what
// that means, which is up to the sync engine.
fn history_error(result: Option<i32>) -> Option<MatchSyncError> {
  use c_msg_client_to_gc_get_match_history_response::EResult;
  let r = result.filter(|&r| r != EResult::KEResultSuccess as i32)?;
  Some(match EResult::try_from(r) {
    Ok(EResult::KEResultRateLimited) => MatchSyncError::GcRateLimited,
    Ok(EResult::KEResultInvalidPermission) => MatchSyncError::GcRefused(GcRefusal::NoPermission),
    _ => MatchSyncError::GcRefused(GcRefusal::Other(r)),
  })
}

// What a salts response's non-success `result` says. Whose match it was decides what that
// means, which is up to the sync engine.
fn salts_error(result: Option<i32>) -> Option<MatchSyncError> {
  use c_msg_client_to_gc_get_match_meta_data_response::EResult;
  let r = result.filter(|&r| r != EResult::KEResultSuccess as i32)?;
  Some(match EResult::try_from(r) {
    Ok(EResult::KEResultRateLimited) => MatchSyncError::GcRateLimited,
    Ok(EResult::KEResultMatchInFlight) => MatchSyncError::GcRefused(GcRefusal::InFlight),
    Ok(EResult::KEResultInvalidMatch) => MatchSyncError::GcRefused(GcRefusal::InvalidMatch),
    Ok(EResult::KEResultInvalidPermission) => MatchSyncError::GcRefused(GcRefusal::NoPermission),
    _ => MatchSyncError::GcRefused(GcRefusal::Other(r)),
  })
}

// SteamID64s of the confirmed individual friends (not groups or pending invites).
fn individual_friends(list: CMsgClientFriendsList) -> Vec<u64> {
  list
    .friends
    .into_iter()
    .filter(|f| f.efriendrelationship == Some(FRIEND_RELATIONSHIP_FRIEND))
    .filter_map(|f| f.ulfriendid)
    .filter(|&id| is_individual(id))
    .collect()
}

// `impl Future + Send` keeps impls spawnable. No internal retries: a failed salt
// fetch must cost at most one quota unit (caller rate-limits + quota-gates).
pub trait GcMatchClient: Send + Sync {
  // `account_id` is whose history to read: the session's own, or one of its friends'.
  fn fetch_match_history(
    &self,
    ctx: &AuthContext,
    account_id: u32,
    cursor: Option<u64>,
  ) -> impl Future<Output = Result<MatchHistoryPage, MatchSyncError>> + Send;

  fn fetch_match_salts(
    &self,
    ctx: &AuthContext,
    match_id: u64,
  ) -> impl Future<Output = Result<MatchSalts, MatchSyncError>> + Send;

  // Account ids of the account's Steam friends, as Steam sent them at logon.
  fn friend_ids(
    &self,
    ctx: &AuthContext,
  ) -> impl Future<Output = Result<Vec<u32>, MatchSyncError>> + Send;

  // The persona state of each of `account_ids` (who must be friends) that Steam answers
  // for in time.
  fn personas(
    &self,
    ctx: &AuthContext,
    account_ids: &[u32],
  ) -> impl Future<Output = HashMap<u32, Persona>> + Send;
}

// The first friends list Steam sends after logon, which is the full one.
type FriendsList = BoxFuture<'static, Result<CMsgClientFriendsList, NetworkError>>;

// Listens for the friends list before logging in: Steam pushes it right after logon, and
// steam-vent keeps only the last 32 messages nobody listens for, which the logon burst
// can overflow.
fn listen_for_friends_list(conn: &UnAuthenticatedConnection) -> FriendsList {
  conn.one::<CMsgClientFriendsList>().boxed()
}

struct GcSession {
  steam_id64: u64,
  gc: GameCoordinator,
  conn: Connection,
  // Read into `friends` the first time they are needed.
  friends_list: Option<FriendsList>,
  // SteamID64s of confirmed individual friends, once `friends_list` is read; empty if
  // Steam sent no usable list.
  friends: Vec<u64>,
}

impl GcSession {
  // Waits for the friends list on first use only, so a session that never looks at
  // friends never waits for it.
  async fn friends(&mut self, cancel: &mut watch::Receiver<()>) -> Result<&[u64], MatchSyncError> {
    if let Some(list) = &mut self.friends_list {
      let list = until_launch(cancel, with_timeout(FRIENDS_WAIT, "friends list", list)).await;
      self.friends = match list {
        Ok(list) if !list.bincremental() => individual_friends(list),
        // An incremental list only carries the friends that changed.
        Ok(_) => {
          log::warn!("match-sync: Steam sent an incremental friends list first");
          Vec::new()
        }
        // A launch only cancels the wait: the list stays pending.
        Err(MatchSyncError::GameRunning) => return Err(MatchSyncError::GameRunning),
        Err(e) => {
          log::warn!("match-sync: {e}");
          Vec::new()
        }
      };
      self.friends_list = None;
    }
    Ok(&self.friends)
  }

  // The GC handshake reports this account as playing Deadlock, so launching the game
  // prompts to disconnect this session. Clear that instead of logging off: the session
  // shares the Steam client's login, and logging off signs the client out too.
  async fn stop_playing(self) {
    Self::clear_playing(&self.conn).await;
  }

  async fn clear_playing(conn: &Connection) {
    if let Err(e) = with_timeout(
      STOP_PLAYING_TIMEOUT,
      "clear games played",
      conn.send_with_kind(
        CMsgClientGamesPlayed::default(),
        EMsg::k_EMsgClientGamesPlayedWithDataBlob,
      ),
    )
    .await
    {
      log::debug!("match-sync: {e}");
    }
  }
}

pub struct SteamGcClient {
  session: Mutex<Option<GcSession>>,
  launch_cancel: watch::Sender<()>,
}

impl SteamGcClient {
  pub fn new() -> Self {
    Self {
      session: Mutex::new(None),
      launch_cancel: watch::channel(()).0,
    }
  }

  // steam-vent's login needs a lot of stack in debug builds, and a sync pass calls this
  // already deep in a worker's stack, so it runs as its own task from a fresh stack.
  async fn connect(
    ctx: &AuthContext,
    cancel: &mut watch::Receiver<()>,
  ) -> Result<GcSession, MatchSyncError> {
    let ctx = ctx.clone();
    let mut cancel = cancel.clone();
    tokio::spawn(async move { Self::connect_on_fresh_stack(&ctx, &mut cancel).await })
      .await
      .map_err(|e| MatchSyncError::GcUnavailable(format!("connect task failed: {e}")))?
  }

  async fn connect_on_fresh_stack(
    ctx: &AuthContext,
    cancel: &mut watch::Receiver<()>,
  ) -> Result<GcSession, MatchSyncError> {
    let (conn, friends_list) = until_launch(cancel, async {
      let servers =
        with_timeout(GC_CALL_TIMEOUT, "server discovery", ServerList::discover()).await?;
      with_timeout(GC_CALL_TIMEOUT, "CM login", async {
        let unauthenticated = UnAuthenticatedConnection::connect(&servers).await?;
        let friends_list = listen_for_friends_list(&unauthenticated);
        let conn = unauthenticated
          .access(&ctx.account_name, &ctx.refresh_token)
          .await?;
        Ok::<_, ConnectionError>((conn, friends_list))
      })
      .await
    })
    .await?;
    Self::connect_gc(ctx, conn, friends_list, cancel).await
  }

  async fn connect_gc(
    ctx: &AuthContext,
    conn: Connection,
    friends_list: FriendsList,
    cancel: &mut watch::Receiver<()>,
  ) -> Result<GcSession, MatchSyncError> {
    let handshake = with_timeout(
      GC_CALL_TIMEOUT,
      "GC handshake",
      GameCoordinator::new(&conn, DEADLOCK_APP_ID),
    );
    let gc = match until_launch(cancel, handshake).await {
      Ok(gc) => gc,
      Err(error) => {
        GcSession::clear_playing(&conn).await;
        return Err(error);
      }
    };
    Ok(GcSession {
      steam_id64: ctx.steam_id64,
      gc,
      conn,
      friends_list: Some(friends_list),
      friends: Vec::new(),
    })
  }

  pub async fn disconnect(&self) {
    let mut guard = self.session.lock().await;
    Self::poison(&mut guard).await;
  }

  /// Waits for the cancelled request to clear its playing status before launch.
  pub async fn release(&self) {
    self.launch_cancel.send_replace(());
    self.disconnect().await;
  }

  async fn poison(guard: &mut Option<GcSession>) {
    if let Some(session) = guard.take() {
      session.stop_playing().await;
    }
  }

  async fn ensure_connected(
    &self,
    guard: &mut Option<GcSession>,
    ctx: &AuthContext,
    cancel: &mut watch::Receiver<()>,
  ) -> Result<(), MatchSyncError> {
    if launch_hold_active() {
      return Err(MatchSyncError::GameRunning);
    }
    let stale = guard
      .as_ref()
      .is_none_or(|s| s.steam_id64 != ctx.steam_id64);
    if stale {
      *guard = Some(Self::connect(ctx, cancel).await?);
    }
    Ok(())
  }

  // The connected session's friends, connecting first if needed.
  async fn connected_friends<'g>(
    &self,
    guard: &'g mut Option<GcSession>,
    ctx: &AuthContext,
    cancel: &mut watch::Receiver<()>,
  ) -> Result<&'g [u64], MatchSyncError> {
    self.ensure_connected(guard, ctx, cancel).await?;
    guard
      .as_mut()
      .expect("connected above")
      .friends(cancel)
      .await
  }

  // One request on the connected session. A failed or cancelled request may have left
  // the connection broken, so it drops the session, still under the session lock so a
  // launch cannot overtake the cleanup.
  async fn request<T, E: std::fmt::Display>(
    guard: &mut Option<GcSession>,
    cancel: &mut watch::Receiver<()>,
    label: &str,
    send: impl AsyncFnOnce(&GameCoordinator, &Connection) -> Result<T, E>,
  ) -> Result<T, MatchSyncError> {
    let session = guard.as_ref().expect("connected above");
    let sent = send(&session.gc, &session.conn);
    let result = until_launch(cancel, with_timeout(GC_CALL_TIMEOUT, label, sent)).await;
    if result.is_err() {
      Self::poison(guard).await;
    }
    result
  }

  async fn send_job(
    guard: &mut Option<GcSession>,
    cancel: &mut watch::Receiver<()>,
    req_bytes: Vec<u8>,
    kind: MsgKind,
    label: &str,
  ) -> Result<RawNetMessage, MatchSyncError> {
    Self::request(guard, cancel, label, async |gc, _| {
      gc.job_untyped(UntypedMessage(req_bytes), kind, true).await
    })
    .await
  }
}

impl GcMatchClient for SteamGcClient {
  async fn fetch_match_history(
    &self,
    ctx: &AuthContext,
    account_id: u32,
    cursor: Option<u64>,
  ) -> Result<MatchHistoryPage, MatchSyncError> {
    let mut guard = self.session.lock().await;
    let mut cancel = self.launch_cancel.subscribe();
    self.ensure_connected(&mut guard, ctx, &mut cancel).await?;

    let req = CMsgClientToGcGetMatchHistory {
      account_id: Some(account_id),
      continue_cursor: cursor,
      ..Default::default()
    };
    let kind = MsgKind(EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory as i32);
    let raw = Self::send_job(
      &mut guard,
      &mut cancel,
      req.encode_to_vec(),
      kind,
      "history",
    )
    .await?;

    let resp = CMsgClientToGcGetMatchHistoryResponse::decode(raw.data.as_ref())
      .map_err(|e| MatchSyncError::GcUnavailable(format!("bad history response: {e}")))?;

    if let Some(e) = history_error(resp.result) {
      return Err(e);
    }

    Ok(MatchHistoryPage {
      // An entry without a match id is not addressable at all, so it is dropped
      // rather than defaulted to 0.
      matches: resp
        .matches
        .iter()
        .filter_map(|m| {
          Some(LocalMatch {
            match_id: m.match_id?,
            hero_id: m.hero_id.unwrap_or_default(),
            hero_level: m.hero_level.unwrap_or_default(),
            start_time: m.start_time.unwrap_or_default(),
            game_mode: m.game_mode.unwrap_or_default(),
            match_mode: m.match_mode.unwrap_or_default(),
            player_team: m.player_team.unwrap_or_default(),
            player_kills: m.player_kills.unwrap_or_default(),
            player_deaths: m.player_deaths.unwrap_or_default(),
            player_assists: m.player_assists.unwrap_or_default(),
            denies: m.denies.unwrap_or_default(),
            net_worth: m.net_worth.unwrap_or_default(),
            last_hits: m.last_hits.unwrap_or_default(),
            match_duration_s: m.match_duration_s.unwrap_or_default(),
            match_result: m.match_result.unwrap_or_default(),
            team_abandoned: m.team_abandoned,
            abandoned_time_s: m.abandoned_time_s,
            objectives_mask_team0: m.objectives_mask_team0.unwrap_or_default(),
            objectives_mask_team1: m.objectives_mask_team1.unwrap_or_default(),
          })
        })
        .collect(),
      next_cursor: resp.continue_cursor.filter(|&c| c != 0),
    })
  }

  async fn fetch_match_salts(
    &self,
    ctx: &AuthContext,
    match_id: u64,
  ) -> Result<MatchSalts, MatchSyncError> {
    let mut guard = self.session.lock().await;
    let mut cancel = self.launch_cancel.subscribe();
    self.ensure_connected(&mut guard, ctx, &mut cancel).await?;

    let req = CMsgClientToGcGetMatchMetaData {
      match_id: Some(match_id),
      ..Default::default()
    };
    let kind = MsgKind(EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData as i32);
    let raw = Self::send_job(&mut guard, &mut cancel, req.encode_to_vec(), kind, "salts").await?;

    let resp = CMsgClientToGcGetMatchMetaDataResponse::decode(raw.data.as_ref())
      .map_err(|e| MatchSyncError::GcUnavailable(format!("bad salts response: {e}")))?;

    if let Some(e) = salts_error(resp.result) {
      return Err(e);
    }

    Ok(MatchSalts {
      match_id,
      cluster_id: resp.replay_group_id,
      metadata_salt: resp.metadata_salt,
      replay_salt: resp.replay_salt,
    })
  }

  async fn friend_ids(&self, ctx: &AuthContext) -> Result<Vec<u32>, MatchSyncError> {
    let mut guard = self.session.lock().await;
    let mut cancel = self.launch_cancel.subscribe();
    let friends = self.connected_friends(&mut guard, ctx, &mut cancel).await?;
    Ok(friends.iter().copied().map(account_id_of).collect())
  }

  async fn personas(&self, ctx: &AuthContext, account_ids: &[u32]) -> HashMap<u32, Persona> {
    let mut personas = HashMap::new();
    let wanted: HashSet<u32> = account_ids.iter().copied().collect();
    if wanted.is_empty() {
      return personas;
    }
    let mut guard = self.session.lock().await;
    let mut cancel = self.launch_cancel.subscribe();
    // Only friends can be asked about, so only they are waited for.
    let (friends, requested): (Vec<u64>, HashSet<u32>) =
      match self.connected_friends(&mut guard, ctx, &mut cancel).await {
        Ok(friends) => friends
          .iter()
          .map(|&id| (id, account_id_of(id)))
          .filter(|(_, account_id)| wanted.contains(account_id))
          .unzip(),
        Err(e) => {
          log::warn!("match-sync: persona request skipped: {e}");
          return personas;
        }
      };
    if friends.is_empty() {
      return personas;
    }

    let session = guard.as_ref().expect("connected above");
    let mut updates = Box::pin(session.conn.on::<CMsgClientPersonaState>());
    let mut req = CMsgClientRequestFriendData::new();
    req.persona_state_requested = Some(
      [
        EClientPersonaStateFlag::k_EClientPersonaStateFlagStatus,
        EClientPersonaStateFlag::k_EClientPersonaStateFlagPresence,
        EClientPersonaStateFlag::k_EClientPersonaStateFlagLastSeen,
        // Carries the app a friend is playing, which marks them as in Deadlock.
        EClientPersonaStateFlag::k_EClientPersonaStateGameExtraInfo,
      ]
      .into_iter()
      .map(|flag| flag as u32)
      .sum(),
    );
    req.friends = friends;
    // Personas only sharpen the ranking; without them friends still rank by cadence.
    let sent = Self::request(
      &mut guard,
      &mut cancel,
      "persona request",
      async |_, conn| conn.send(req).await,
    )
    .await;
    if let Err(e) = sent {
      log::warn!("match-sync: {e}");
      return personas;
    }

    let deadline = tokio::time::Instant::now() + FRIENDS_WAIT;
    while personas.len() < requested.len() {
      // A launch must not wait out the deadline for the session lock.
      let next = tokio::select! {
        biased;
        _ = cancel.changed() => break,
        next = tokio::time::timeout_at(deadline, updates.next()) => next,
      };
      let Ok(Some(msg)) = next else {
        break;
      };
      let Ok(msg) = msg else { continue };
      for f in msg.friends {
        let Some(id) = f.friendid.map(account_id_of) else {
          continue;
        };
        // Steam also pushes updates nobody asked for (e.g. about ourselves).
        if !requested.contains(&id) {
          continue;
        }
        let last_seen = [f.last_seen_online, f.last_logoff]
          .into_iter()
          .flatten()
          .filter(|&t| t != 0)
          .max()
          .map(i64::from);
        // A later, partial update must not erase what an earlier one told us.
        let persona = personas.entry(id).or_default();
        persona.in_deadlock |= f.game_played_app_id == Some(DEADLOCK_APP_ID);
        persona.online |= f.persona_state.is_some_and(|s| s != 0);
        persona.last_seen = last_seen.or(persona.last_seen);
      }
    }
    personas
  }
}

// Lets the per-account resource registry in `mod.rs` hand out a shared
// `Arc<SteamGcClient>` while still satisfying `SyncEngine`'s `G: GcMatchClient` bound.
impl GcMatchClient for Arc<SteamGcClient> {
  fn fetch_match_history(
    &self,
    ctx: &AuthContext,
    account_id: u32,
    cursor: Option<u64>,
  ) -> impl Future<Output = Result<MatchHistoryPage, MatchSyncError>> + Send {
    (**self).fetch_match_history(ctx, account_id, cursor)
  }

  fn fetch_match_salts(
    &self,
    ctx: &AuthContext,
    match_id: u64,
  ) -> impl Future<Output = Result<MatchSalts, MatchSyncError>> + Send {
    (**self).fetch_match_salts(ctx, match_id)
  }

  fn friend_ids(
    &self,
    ctx: &AuthContext,
  ) -> impl Future<Output = Result<Vec<u32>, MatchSyncError>> + Send {
    (**self).friend_ids(ctx)
  }

  fn personas(
    &self,
    ctx: &AuthContext,
    account_ids: &[u32],
  ) -> impl Future<Output = HashMap<u32, Persona>> + Send {
    (**self).personas(ctx, account_ids)
  }
}

#[cfg(test)]
mod tests;
