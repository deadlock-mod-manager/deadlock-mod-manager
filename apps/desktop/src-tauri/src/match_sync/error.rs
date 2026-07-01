use thiserror::Error;

// Messages never include the refresh token / GC session (secrets — see user-auth.md).
#[derive(Error, Debug)]
pub enum MatchSyncError {
  #[error("Match sync is disabled")]
  Disabled,

  #[error("Consent has not been accepted")]
  ConsentRequired,

  // retry_after_secs: until the oldest in-window fetch ages out.
  #[error("Fetch quota reached ({limit} per 24h); retry in {retry_after_secs}s")]
  QuotaReached { limit: usize, retry_after_secs: i64 },

  #[error("A sync is already in progress")]
  AlreadyRunning,

  #[error("Steam session unavailable: {0}")]
  AuthUnavailable(String),

  #[error("Steam GC unavailable: {0}")]
  GcUnavailable(String),

  // Steam GC answered but is throttling this account; back off, don't burn quota.
  #[error("Steam GC rate-limited the request")]
  GcRateLimited,

  #[error("Deadlock is currently running; close it to fetch matches")]
  GameRunning,

  #[error("deadlock-api request failed: {0}")]
  Api(String),

  #[error("match-sync store error: {0}")]
  Store(String),
}

impl From<MatchSyncError> for crate::errors::Error {
  fn from(err: MatchSyncError) -> Self {
    crate::errors::Error::MatchSync(err.to_string())
  }
}
