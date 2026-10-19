//! The Steam Game Coordinator boundary: recover per-match salts and history
//! client-side through the user's own account (`steam-vent` + `CMsgClientToGc*`).
//! The subsystem never uses deadlock-api's own server-side endpoints.

use std::future::Future;
use std::sync::{Arc, PoisonError};
use std::time::{Duration, Instant};

use prost::Message as _;
use steam_vent::proto::MsgKind;
use steam_vent::proto::steammessages_clientserver_login::CMsgClientLogOff;
use steam_vent::{
  Connection, ConnectionTrait, GameCoordinator, RawNetMessage, ServerList, UntypedMessage,
};
use tokio::sync::Mutex;
use valveprotos::deadlock::{
  CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse,
  CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse, EgcCitadelClientMessages,
  c_msg_client_to_gc_get_match_history_response, c_msg_client_to_gc_get_match_meta_data_response,
};

use super::error::MatchSyncError;
use super::model::{AuthContext, DEADLOCK_APP_ID, LocalMatch, MatchHistoryPage, MatchSalts};

// A stalled discover/login/job call must not block cancel/disable indefinitely.
const GC_CALL_TIMEOUT: Duration = Duration::from_secs(30);
// Logging off runs right before a game launch, so it must not hold that up.
const LOG_OFF_TIMEOUT: Duration = Duration::from_secs(2);
// Steam takes a while to start the game after a launch request, and a session opened
// in that gap brings Steam's "logged in on another computer" prompt back. Once the
// game is up, the engine's game-running checks keep sessions closed.
const LAUNCH_HOLD: Duration = Duration::from_secs(3 * 60);

static LAUNCH_REQUESTED_AT: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);

/// Keeps every client from opening a session for [`LAUNCH_HOLD`] from now.
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

// `impl Future + Send` keeps impls spawnable. No internal retries: a failed salt
// fetch must cost at most one quota unit (caller rate-limits + quota-gates).
pub trait GcMatchClient: Send + Sync {
  fn fetch_match_history(
    &self,
    ctx: &AuthContext,
    cursor: Option<u64>,
  ) -> impl Future<Output = Result<MatchHistoryPage, MatchSyncError>> + Send;

  fn fetch_match_salts(
    &self,
    ctx: &AuthContext,
    match_id: u64,
  ) -> impl Future<Output = Result<MatchSalts, MatchSyncError>> + Send;
}

struct GcSession {
  steam_id64: u64,
  gc: GameCoordinator,
  conn: Connection,
}

impl GcSession {
  // The GC handshake tells Steam this account is playing Deadlock. Until that session
  // ends, launching the game on this PC shows Steam's "logged in on another computer"
  // prompt. Dropping the connection alone leaves the session up until Steam times it
  // out, so log off explicitly.
  async fn log_off(self) {
    if let Err(e) = with_timeout(
      LOG_OFF_TIMEOUT,
      "log-off",
      self.conn.send(CMsgClientLogOff::new()),
    )
    .await
    {
      log::debug!("match-sync: {e}");
    }
  }
}

pub struct SteamGcClient {
  session: Mutex<Option<GcSession>>,
}

impl SteamGcClient {
  pub fn new() -> Self {
    Self {
      session: Mutex::new(None),
    }
  }

  async fn connect(ctx: &AuthContext) -> Result<GcSession, MatchSyncError> {
    let servers = with_timeout(GC_CALL_TIMEOUT, "server discovery", ServerList::discover()).await?;
    let conn = with_timeout(
      GC_CALL_TIMEOUT,
      "CM login",
      Connection::access(&servers, &ctx.account_name, &ctx.refresh_token),
    )
    .await?;
    let gc = with_timeout(
      GC_CALL_TIMEOUT,
      "GC handshake",
      GameCoordinator::new(&conn, DEADLOCK_APP_ID),
    )
    .await?;
    Ok(GcSession {
      steam_id64: ctx.steam_id64,
      gc,
      conn,
    })
  }

  /// Ends the Steam session, if one is open. The next request reconnects.
  pub async fn disconnect(&self) {
    let session = self.session.lock().await.take();
    if let Some(session) = session {
      session.log_off().await;
    }
  }

  /// Like [`Self::disconnect`], but never waits on a request in flight: a busy
  /// session logs off as soon as that request finishes.
  pub async fn release(self: &Arc<Self>) {
    let Ok(session) = self.session.try_lock().map(|mut guard| guard.take()) else {
      let client = Arc::clone(self);
      tokio::spawn(async move { client.disconnect().await });
      return;
    };
    if let Some(session) = session {
      session.log_off().await;
    }
  }

  fn poison(guard: &mut Option<GcSession>) {
    if let Some(session) = guard.take() {
      tokio::spawn(session.log_off());
    }
  }

  async fn ensure_connected(
    &self,
    guard: &mut Option<GcSession>,
    ctx: &AuthContext,
  ) -> Result<(), MatchSyncError> {
    let stale = guard
      .as_ref()
      .is_none_or(|s| s.steam_id64 != ctx.steam_id64);
    if stale {
      if launch_hold_active() {
        return Err(MatchSyncError::GameRunning);
      }
      *guard = Some(Self::connect(ctx).await?);
    }
    Ok(())
  }

  // Poisons the session (logs it off) on any failure or timeout, so the next call
  // reconnects instead of retrying a broken GC connection.
  async fn send_job(
    guard: &mut Option<GcSession>,
    req_bytes: Vec<u8>,
    kind: MsgKind,
    label: &str,
  ) -> Result<RawNetMessage, MatchSyncError> {
    let sent = tokio::time::timeout(
      GC_CALL_TIMEOUT,
      guard.as_ref().expect("connected above").gc.job_untyped(
        UntypedMessage(req_bytes),
        kind,
        true,
      ),
    )
    .await;

    match sent {
      Ok(Ok(raw)) => Ok(raw),
      Ok(Err(e)) => {
        Self::poison(guard);
        Err(MatchSyncError::GcUnavailable(format!(
          "{label} request failed: {e}"
        )))
      }
      Err(_) => {
        Self::poison(guard);
        Err(MatchSyncError::GcUnavailable(format!(
          "{label} request timed out after {GC_CALL_TIMEOUT:?}"
        )))
      }
    }
  }
}

impl GcMatchClient for SteamGcClient {
  async fn fetch_match_history(
    &self,
    ctx: &AuthContext,
    cursor: Option<u64>,
  ) -> Result<MatchHistoryPage, MatchSyncError> {
    let mut guard = self.session.lock().await;
    self.ensure_connected(&mut guard, ctx).await?;

    let req = CMsgClientToGcGetMatchHistory {
      account_id: Some(ctx.account_id()),
      continue_cursor: cursor,
      ..Default::default()
    };
    let kind = MsgKind(EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory as i32);
    let raw = Self::send_job(&mut guard, req.encode_to_vec(), kind, "history").await?;

    let resp = CMsgClientToGcGetMatchHistoryResponse::decode(raw.data.as_ref())
      .map_err(|e| MatchSyncError::GcUnavailable(format!("bad history response: {e}")))?;

    let success = c_msg_client_to_gc_get_match_history_response::EResult::KEResultSuccess as i32;
    if resp.result.is_some_and(|r| r != success) {
      return Err(MatchSyncError::GcUnavailable(format!(
        "history result {:?}",
        resp.result
      )));
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
    self.ensure_connected(&mut guard, ctx).await?;

    let req = CMsgClientToGcGetMatchMetaData {
      match_id: Some(match_id),
      ..Default::default()
    };
    let kind = MsgKind(EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData as i32);
    let raw = Self::send_job(&mut guard, req.encode_to_vec(), kind, "salts").await?;

    let resp = CMsgClientToGcGetMatchMetaDataResponse::decode(raw.data.as_ref())
      .map_err(|e| MatchSyncError::GcUnavailable(format!("bad salts response: {e}")))?;

    use c_msg_client_to_gc_get_match_meta_data_response::EResult;
    match resp.result {
      Some(r) if r == EResult::KEResultRateLimited as i32 => {
        return Err(MatchSyncError::GcRateLimited);
      }
      Some(r) if r != EResult::KEResultSuccess as i32 => {
        return Err(MatchSyncError::GcUnavailable(format!("salts result {r}")));
      }
      _ => {}
    }

    Ok(MatchSalts {
      match_id,
      cluster_id: resp.replay_group_id,
      metadata_salt: resp.metadata_salt,
      replay_salt: resp.replay_salt,
    })
  }
}

// Lets the per-account resource registry in `mod.rs` hand out a shared
// `Arc<SteamGcClient>` while still satisfying `SyncEngine`'s `G: GcMatchClient` bound.
impl GcMatchClient for Arc<SteamGcClient> {
  fn fetch_match_history(
    &self,
    ctx: &AuthContext,
    cursor: Option<u64>,
  ) -> impl Future<Output = Result<MatchHistoryPage, MatchSyncError>> + Send {
    (**self).fetch_match_history(ctx, cursor)
  }

  fn fetch_match_salts(
    &self,
    ctx: &AuthContext,
    match_id: u64,
  ) -> impl Future<Output = Result<MatchSalts, MatchSyncError>> + Send {
    (**self).fetch_match_salts(ctx, match_id)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn launch_hold_lasts_until_ended() {
    hold_for_launch();
    assert!(launch_hold_active());
    end_launch_hold();
    assert!(!launch_hold_active());
  }
}
