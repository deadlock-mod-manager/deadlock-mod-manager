use thiserror::Error;

// Messages never include the refresh token / GC session (secrets).
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

  // The GC refused a friend's match history (their profile is private).
  #[error("match history is private")]
  HistoryPrivate,

  // The GC answered a friend's match history request with an error; the connection
  // itself is fine.
  #[error("Steam GC refused the match history request (result {0})")]
  HistoryRefused(i32),

  // The GC won't hand out this match's salts (unknown match, or not visible to this
  // account); asking again won't change that.
  #[error("Steam GC refused the match (result {0})")]
  MatchRefused(i32),

  // The match is still being played or processed; its salts come later.
  #[error("match is still in progress")]
  MatchInFlight,

  #[error("Deadlock is currently running; close it to fetch matches")]
  GameRunning,

  #[error("deadlock-api request failed: {0}")]
  Api(String),

  #[error("match-sync store error: {0}")]
  Store(String),
}

impl MatchSyncError {
  // Only a broken or throttled GC connection backs an account's sync off; an answer about
  // one match or match history (refused, private, in flight) says nothing about the
  // connection.
  pub fn backs_off_gc(&self) -> bool {
    matches!(
      self,
      MatchSyncError::GcUnavailable(_) | MatchSyncError::GcRateLimited
    )
  }

  // A stable, machine-readable tag so the frontend can branch/localize on the
  // specific case without parsing the English message.
  pub fn subcode(&self) -> &'static str {
    match self {
      MatchSyncError::Disabled => "disabled",
      MatchSyncError::ConsentRequired => "consentRequired",
      MatchSyncError::QuotaReached { .. } => "quotaReached",
      MatchSyncError::AlreadyRunning => "alreadyRunning",
      MatchSyncError::AuthUnavailable(_) => "authUnavailable",
      MatchSyncError::GcUnavailable(_) => "gcUnavailable",
      MatchSyncError::GcRateLimited => "gcRateLimited",
      MatchSyncError::HistoryPrivate => "historyPrivate",
      MatchSyncError::HistoryRefused(_) => "historyRefused",
      MatchSyncError::MatchRefused(_) => "matchRefused",
      MatchSyncError::MatchInFlight => "matchInFlight",
      MatchSyncError::GameRunning => "gameRunning",
      MatchSyncError::Api(_) => "apiError",
      MatchSyncError::Store(_) => "storeError",
    }
  }
}

// reqwest errors print the request URL, which can carry friends' account ids; converting
// through here keeps those out of the logs.
impl From<reqwest::Error> for MatchSyncError {
  fn from(e: reqwest::Error) -> Self {
    MatchSyncError::Api(e.without_url().to_string())
  }
}

impl From<MatchSyncError> for crate::errors::Error {
  fn from(err: MatchSyncError) -> Self {
    crate::errors::Error::MatchSync {
      subcode: err.subcode(),
      message: err.to_string(),
    }
  }
}
