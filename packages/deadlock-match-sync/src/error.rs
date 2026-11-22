use thiserror::Error;

#[derive(Error, Debug)]
pub enum MatchSyncError {
  #[error("Match sync is disabled")]
  Disabled,

  #[error("Consent has not been accepted")]
  ConsentRequired,

  #[error("Fetch quota reached ({limit} per 24h); retry in {retry_after_secs}s")]
  QuotaReached { limit: usize, retry_after_secs: i64 },

  #[error("A sync is already in progress")]
  AlreadyRunning,

  #[error("Steam session unavailable: {0}")]
  AuthUnavailable(String),

  #[error("Steam GC unavailable: {0}")]
  GcUnavailable(String),

  #[error("Steam GC rate-limited the request")]
  GcRateLimited,

  #[error("Steam GC refused the request: {0}")]
  GcRefused(GcRefusal),

  #[error("Deadlock is currently running; close it to fetch matches")]
  GameRunning,

  #[error("Steam is playing another game on this account; close it to fetch matches")]
  AccountInUse,

  #[error("deadlock-api request failed: {0}")]
  Api(String),

  #[error("match-sync store error: {0}")]
  Store(String),
}

impl MatchSyncError {
  pub fn backs_off_gc(&self) -> bool {
    matches!(self, MatchSyncError::GcUnavailable(_))
  }

  pub fn ends_pass(&self) -> bool {
    matches!(
      self,
      MatchSyncError::GameRunning | MatchSyncError::AccountInUse
    )
  }

  pub fn refusal_as_outage(self) -> Self {
    match self {
      MatchSyncError::GcRefused(refusal) => {
        MatchSyncError::GcUnavailable(format!("request refused: {refusal}"))
      }
      e => e,
    }
  }

  pub fn subcode(&self) -> &'static str {
    match self {
      MatchSyncError::Disabled => "disabled",
      MatchSyncError::ConsentRequired => "consentRequired",
      MatchSyncError::QuotaReached { .. } => "quotaReached",
      MatchSyncError::AlreadyRunning => "alreadyRunning",
      MatchSyncError::AuthUnavailable(_) => "authUnavailable",
      MatchSyncError::GcUnavailable(_) => "gcUnavailable",
      MatchSyncError::GcRateLimited => "gcRateLimited",
      MatchSyncError::GcRefused(_) => "gcRefused",
      MatchSyncError::GameRunning => "gameRunning",
      MatchSyncError::AccountInUse => "accountInUse",
      MatchSyncError::Api(_) => "apiError",
      MatchSyncError::Store(_) => "storeError",
    }
  }
}

#[derive(Error, Debug, Clone, Copy, PartialEq, Eq)]
pub enum GcRefusal {
  #[error("no permission")]
  NoPermission,
  #[error("match still in progress")]
  InFlight,
  #[error("unknown match")]
  InvalidMatch,
  #[error("result {0}")]
  Other(i32),
}

impl From<reqwest::Error> for MatchSyncError {
  fn from(e: reqwest::Error) -> Self {
    MatchSyncError::Api(e.without_url().to_string())
  }
}
