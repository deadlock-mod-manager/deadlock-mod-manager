//! The Steam Game Coordinator boundary: recover per-match salts and history
//! client-side through the user's own account (`steam-vent` + `CMsgClientToGc*` per
//! user-auth.md). The subsystem never uses deadlock-api's own server-side endpoints.

use std::future::Future;

use prost::Message as _;
use steam_vent::proto::MsgKind;
use steam_vent::{Connection, ConnectionTrait, GameCoordinator, ServerList, UntypedMessage};
use tokio::sync::Mutex;
use valveprotos::deadlock::{
  CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse,
  CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse, EgcCitadelClientMessages,
  c_msg_client_to_gc_get_match_history_response, c_msg_client_to_gc_get_match_meta_data_response,
};

use super::error::MatchSyncError;
use super::model::{AuthContext, DEADLOCK_APP_ID, MatchHistoryPage, MatchSalts};

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
  // Held only to keep the CM connection alive for the GC session.
  _conn: Connection,
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
    let servers = ServerList::discover()
      .await
      .map_err(|e| MatchSyncError::GcUnavailable(format!("server discovery failed: {e}")))?;
    let conn = Connection::access(&servers, &ctx.account_name, &ctx.refresh_token)
      .await
      .map_err(|e| MatchSyncError::GcUnavailable(format!("CM login failed: {e}")))?;
    let gc = GameCoordinator::new(&conn, DEADLOCK_APP_ID)
      .await
      .map_err(|e| MatchSyncError::GcUnavailable(format!("GC handshake failed: {e}")))?;
    Ok(GcSession {
      steam_id64: ctx.steam_id64,
      gc,
      _conn: conn,
    })
  }

  async fn ensure_connected(
    &self,
    guard: &mut Option<GcSession>,
    ctx: &AuthContext,
  ) -> Result<(), MatchSyncError> {
    let stale = guard.as_ref().is_none_or(|s| s.steam_id64 != ctx.steam_id64);
    if stale {
      *guard = Some(Self::connect(ctx).await?);
    }
    Ok(())
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
    let sent = guard
      .as_ref()
      .expect("connected above")
      .gc
      .job_untyped(UntypedMessage(req.encode_to_vec()), kind, true)
      .await;

    let raw = match sent {
      Ok(raw) => raw,
      Err(e) => {
        *guard = None;
        return Err(MatchSyncError::GcUnavailable(format!("history request failed: {e}")));
      }
    };

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
      match_ids: resp.matches.iter().filter_map(|m| m.match_id).collect(),
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
    let sent = guard
      .as_ref()
      .expect("connected above")
      .gc
      .job_untyped(UntypedMessage(req.encode_to_vec()), kind, true)
      .await;

    let raw = match sent {
      Ok(raw) => raw,
      Err(e) => {
        *guard = None;
        return Err(MatchSyncError::GcUnavailable(format!("salts request failed: {e}")));
      }
    };

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
