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

  // Steam GC answered but is throttling this account; the matching quota is treated as
  // spent.
  #[error("Steam GC rate-limited the request")]
  GcRateLimited,

  // The GC answered the request with an error. What that means depends on whose history
  // or match it was, which only the sync engine knows.
  #[error("Steam GC refused the request: {0}")]
  GcRefused(GcRefusal),

  #[error("Deadlock is currently running; close it to fetch matches")]
  GameRunning,

  // Steam is already playing a game on this account, on this PC or another, and logs the
  // session off once it starts Deadlock.
  #[error("Steam is playing another game on this account; close it to fetch matches")]
  AccountInUse,

  #[error("deadlock-api request failed: {0}")]
  Api(String),

  #[error("match-sync store error: {0}")]
  Store(String),
}

impl MatchSyncError {
  // Only a broken GC connection backs an account's sync off for a day. A refusal about a
  // friend or someone else's match says nothing about the connection, and a rate limit
  // exhausts the quota of what was limited instead.
  pub fn backs_off_gc(&self) -> bool {
    matches!(self, MatchSyncError::GcUnavailable(_))
  }

  // Every later GC request of the pass would fail the same way.
  pub fn ends_pass(&self) -> bool {
    matches!(
      self,
      MatchSyncError::GameRunning | MatchSyncError::AccountInUse
    )
  }

  // The account can always see its own history and matches, so the GC refusing one means
  // it won't serve the account at all: an outage, not an answer.
  pub fn refusal_as_outage(self) -> Self {
    match self {
      MatchSyncError::GcRefused(refusal) => {
        MatchSyncError::GcUnavailable(format!("request refused: {refusal}"))
      }
      e => e,
    }
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
  // A private friend history, or a match this account may not see.
  #[error("no permission")]
  NoPermission,
  // The match is still being played or processed; its salts come later.
  #[error("match still in progress")]
  InFlight,
  // The GC doesn't know this match; asking again won't change that.
  #[error("unknown match")]
  InvalidMatch,
  #[error("result {0}")]
  Other(i32),
}

// reqwest errors print the request URL, which can carry friends' account ids; converting
// through here keeps those out of the logs.
impl From<reqwest::Error> for MatchSyncError {
  fn from(e: reqwest::Error) -> Self {
    MatchSyncError::Api(e.without_url().to_string())
  }
}
