use super::*;
use crate::match_sync::friends::Persona;
use crate::match_sync::model::{FRIEND_HISTORY_QUOTA_LIMIT, LocalMatch, MatchSalts};
use crate::match_sync::quota::QuotaWindow;
use std::sync::Mutex;
use std::time::Duration;

const LIMIT: usize = 40;
const WINDOW: i64 = 24 * 60 * 60;

#[derive(Default)]
struct SpyAuth {
  calls: AtomicU64,
}
impl SteamAuthProvider for SpyAuth {
  fn recover(&self) -> Result<AuthContext, MatchSyncError> {
    self.calls.fetch_add(1, Ordering::Relaxed);
    Ok(AuthContext {
      account_name: "spy".into(),
      steam_id64: 76561197960265728 + 42,
      refresh_token: "secret".into(),
    })
  }
}

#[derive(Default)]
struct SpyGc {
  calls: AtomicU64,
  fail: bool,
  fail_history: bool,
  own_history_rate_limited: bool,
  rate_limited: bool,
  // Matches the GC refuses for good, and ones it says are still in progress.
  refused: HashSet<u64>,
  in_flight: HashSet<u64>,
  // Matches the GC won't show this account.
  forbidden: HashSet<u64>,
  persona_calls: AtomicU64,
  history: Vec<u64>,
  friends: HashMap<u32, Persona>,
  friend_history: Vec<u64>,
  // What the GC answers instead of `friend_history` (`MatchSyncError` isn't `Clone`).
  friend_history_error: Option<fn() -> MatchSyncError>,
  // What the GC answers instead of the friends list.
  friend_ids_error: Option<fn() -> MatchSyncError>,
}
impl GcMatchClient for SpyGc {
  async fn fetch_match_history(
    &self,
    ctx: &AuthContext,
    account_id: u32,
    _cursor: Option<u64>,
  ) -> Result<MatchHistoryPage, MatchSyncError> {
    self.calls.fetch_add(1, Ordering::Relaxed);
    if self.fail_history {
      return Err(MatchSyncError::GcUnavailable("spy history".into()));
    }
    if self.own_history_rate_limited && account_id == ctx.account_id() {
      return Err(MatchSyncError::GcRateLimited);
    }
    let history = if account_id == ctx.account_id() {
      &self.history
    } else if let Some(error) = self.friend_history_error {
      return Err(error());
    } else {
      &self.friend_history
    };
    Ok(MatchHistoryPage {
      matches: history
        .iter()
        .map(|&match_id| LocalMatch {
          match_id,
          ..Default::default()
        })
        .collect(),
      next_cursor: None,
    })
  }
  async fn fetch_match_salts(
    &self,
    _ctx: &AuthContext,
    match_id: u64,
  ) -> Result<MatchSalts, MatchSyncError> {
    self.calls.fetch_add(1, Ordering::Relaxed);
    if self.rate_limited {
      return Err(MatchSyncError::GcRateLimited);
    }
    if self.fail {
      return Err(MatchSyncError::GcUnavailable("spy".into()));
    }
    if self.refused.contains(&match_id) {
      return Err(MatchSyncError::GcRefused(GcRefusal::InvalidMatch));
    }
    if self.in_flight.contains(&match_id) {
      return Err(MatchSyncError::GcRefused(GcRefusal::InFlight));
    }
    if self.forbidden.contains(&match_id) {
      return Err(MatchSyncError::GcRefused(GcRefusal::NoPermission));
    }
    Ok(MatchSalts {
      match_id,
      cluster_id: Some(1),
      metadata_salt: Some(2),
      replay_salt: Some(3),
    })
  }
  async fn friend_ids(&self, _ctx: &AuthContext) -> Result<Vec<u32>, MatchSyncError> {
    if let Some(error) = self.friend_ids_error {
      return Err(error());
    }
    Ok(self.friends.keys().copied().collect())
  }
  async fn personas(&self, _ctx: &AuthContext, account_ids: &[u32]) -> HashMap<u32, Persona> {
    self.persona_calls.fetch_add(1, Ordering::Relaxed);
    self
      .friends
      .iter()
      .filter(|(id, _)| account_ids.contains(id))
      .map(|(&id, &persona)| (id, persona))
      .collect()
  }
}

#[derive(Default)]
struct SpySink {
  posted: Mutex<Vec<u64>>,
}
impl SaltsSink for SpySink {
  async fn post_salts(&self, salts: &[SaltPayload]) -> Result<(), MatchSyncError> {
    let mut p = self.posted.lock().unwrap();
    p.extend(salts.iter().map(|s| s.match_id));
    Ok(())
  }
}

#[derive(Debug, PartialEq)]
enum BackfillCall {
  Account,
  Global,
  Release,
}

// Sticky, like the real endpoint: it keeps listing the same ids until they are
// ingested, so run termination must come from the run-local `processed` set.
#[derive(Default)]
struct SpyBackfill {
  account: Vec<u64>,
  global: Vec<u64>,
  active: Vec<ActiveFriend>,
  // Matches deadlock-api already has salts for.
  stored_salts: HashSet<u64>,
  calls: AtomicU64,
  log: Mutex<Vec<BackfillCall>>,
}
impl BackfillSource for SpyBackfill {
  async fn to_fetch(&self, scope: FetchScope) -> Result<Vec<u64>, MatchSyncError> {
    self.calls.fetch_add(1, Ordering::Relaxed);
    match scope {
      FetchScope::Account(_) => {
        self.log.lock().unwrap().push(BackfillCall::Account);
        Ok(self.account.clone())
      }
      FetchScope::Global => {
        self.log.lock().unwrap().push(BackfillCall::Global);
        Ok(self.global.clone())
      }
    }
  }
  async fn release_claim(&self) {
    self.log.lock().unwrap().push(BackfillCall::Release);
  }
  async fn active_friends(
    &self,
    account_ids: &[u32],
  ) -> Result<Vec<ActiveFriend>, MatchSyncError> {
    Ok(
      self
        .active
        .iter()
        .filter(|f| account_ids.contains(&f.account_id))
        .cloned()
        .collect(),
    )
  }
  async fn missing_salts(
    &self,
    match_ids: &[u64],
    limit: usize,
    _cancel: &AtomicBool,
  ) -> SaltsCheck {
    let mut check = SaltsCheck::default();
    for &id in match_ids {
      if check.missing.len() == limit {
        break;
      }
      if self.stored_salts.contains(&id) {
        check.stored.push(id);
      } else {
        check.missing.push(id);
      }
    }
    check
  }
}

#[derive(Default)]
struct MemPersistence {
  now: i64,
  quota_hits: Mutex<Vec<i64>>,
  history_hits: Mutex<Vec<i64>>,
  cooldowns: Mutex<HashMap<u32, i64>>,
  fetched: Mutex<Vec<u64>>,
  complete: Mutex<bool>,
  progress_events: AtomicU64,
  gc_errors: AtomicU64,
  fail_load_quota: bool,
  fail_save_quota: bool,
  last_progress_running: Mutex<Option<bool>>,
}
impl SyncPersistence for MemPersistence {
  fn now(&self) -> i64 {
    self.now
  }
  fn load_quota(&self) -> Result<QuotaWindow, MatchSyncError> {
    if self.fail_load_quota {
      return Err(MatchSyncError::Store("spy load failure".into()));
    }
    Ok(QuotaWindow::new(
      self.quota_hits.lock().unwrap().clone(),
      LIMIT,
      WINDOW,
    ))
  }
  fn save_quota(&self, quota: &QuotaWindow) -> Result<(), MatchSyncError> {
    if self.fail_save_quota {
      return Err(MatchSyncError::Store("spy save failure".into()));
    }
    *self.quota_hits.lock().unwrap() = quota.snapshot();
    Ok(())
  }
  fn load_history_quota(&self) -> Result<QuotaWindow, MatchSyncError> {
    Ok(QuotaWindow::new(
      self.history_hits.lock().unwrap().clone(),
      FRIEND_HISTORY_QUOTA_LIMIT,
      WINDOW,
    ))
  }
  fn save_history_quota(&self, quota: &QuotaWindow) -> Result<(), MatchSyncError> {
    *self.history_hits.lock().unwrap() = quota.snapshot();
    Ok(())
  }
  fn friend_cooldowns(&self) -> HashMap<u32, i64> {
    self.cooldowns.lock().unwrap().clone()
  }
  fn set_friend_cooldowns(&self, cooldowns: &[(u32, i64)]) {
    self
      .cooldowns
      .lock()
      .unwrap()
      .extend(cooldowns.iter().copied());
  }
  fn load_fetched(&self) -> Vec<u64> {
    self.fetched.lock().unwrap().clone()
  }
  fn persist_fetched(&self, ids: &[u64]) {
    *self.fetched.lock().unwrap() = ids.to_vec();
  }
  fn set_full_sync_complete(&self, complete: bool) {
    *self.complete.lock().unwrap() = complete;
  }
  fn emit_progress(&self, progress: &SyncProgress) {
    self.progress_events.fetch_add(1, Ordering::Relaxed);
    *self.last_progress_running.lock().unwrap() = Some(progress.running);
  }
  // Counts every report: what backs the account off is decided in production code.
  fn record_gc_error(&self, _err: &MatchSyncError) {
    self.gc_errors.fetch_add(1, Ordering::Relaxed);
  }
}

#[derive(Default)]
struct SpyGameCheck {
  running: bool,
  // Simulates the game launching mid-pass: is_game_running() starts returning
  // true starting from this call number (1-indexed) across the whole engine.
  // 0 (the default) means never trips this way.
  trip_after_calls: usize,
  calls: std::sync::atomic::AtomicUsize,
}
impl GameRunningCheck for SpyGameCheck {
  fn is_game_running(&self) -> bool {
    if self.running {
      return true;
    }
    if self.trip_after_calls == 0 {
      return false;
    }
    self.calls.fetch_add(1, Ordering::Relaxed) + 1 >= self.trip_after_calls
  }
}

fn engine(
  gc: SpyGc,
  backfill: SpyBackfill,
) -> SyncEngine<SpyAuth, SpyGc, SpySink, SpyBackfill, MemPersistence, SpyGameCheck> {
  engine_with_game_check(gc, backfill, SpyGameCheck::default())
}

fn engine_with_game_check(
  gc: SpyGc,
  backfill: SpyBackfill,
  game_check: SpyGameCheck,
) -> SyncEngine<SpyAuth, SpyGc, SpySink, SpyBackfill, MemPersistence, SpyGameCheck> {
  engine_with_persistence(
    gc,
    backfill,
    game_check,
    MemPersistence {
      now: 1_000_000,
      ..Default::default()
    },
  )
}

fn engine_with_persistence(
  gc: SpyGc,
  backfill: SpyBackfill,
  game_check: SpyGameCheck,
  persistence: MemPersistence,
) -> SyncEngine<SpyAuth, SpyGc, SpySink, SpyBackfill, MemPersistence, SpyGameCheck> {
  SyncEngine::new(
    SpyAuth::default(),
    gc,
    SpySink::default(),
    backfill,
    persistence,
    game_check,
    Arc::new(Throttle::new(Duration::ZERO)),
    Arc::new(AtomicU64::new(0)),
  )
}

fn active_config() -> MatchSyncConfig {
  MatchSyncConfig {
    enabled: true,
    consent_accepted: true,
  }
}

#[tokio::test]
async fn disabled_does_nothing() {
  let eng = engine(
    SpyGc::default(),
    SpyBackfill {
      account: vec![1, 2, 3],
      global: vec![9, 8, 7],
      ..Default::default()
    },
  );
  let config = MatchSyncConfig {
    enabled: false,
    consent_accepted: false,
  };

  let out = eng
    .run_background_pass(&config, &AtomicBool::new(false))
    .await
    .unwrap();
  assert!(out.is_none());
  assert!(
    eng
      .run_full_sync_if_enabled(&config, &AtomicBool::new(false))
      .await
      .is_err()
  );

  assert_eq!(eng.auth.calls.load(Ordering::Relaxed), 0);
  assert_eq!(eng.gc.calls.load(Ordering::Relaxed), 0);
  assert_eq!(eng.backfill.calls.load(Ordering::Relaxed), 0);
  assert_eq!(eng.counter.load(Ordering::Relaxed), 0);
  assert!(eng.sink.posted.lock().unwrap().is_empty());
}

#[tokio::test]
async fn full_sync_fetches_posts_and_is_idempotent() {
  let backfill = SpyBackfill {
    account: vec![10, 11, 12],
    global: vec![],
    ..Default::default()
  };
  let eng = engine(SpyGc::default(), backfill);
  let cancel = AtomicBool::new(false);

  let p = eng
    .run_full_sync_if_enabled(&active_config(), &cancel)
    .await
    .unwrap();
  assert_eq!(p.fetched, 3);
  assert_eq!(eng.counter.load(Ordering::Relaxed), 3);
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![12, 11, 10]);

  // Re-run: the same ids are already fetched -> nothing new is fetched/posted.
  let p2 = eng
    .run_full_sync_if_enabled(&active_config(), &cancel)
    .await
    .unwrap();
  assert_eq!(p2.fetched, 0);
  assert_eq!(eng.counter.load(Ordering::Relaxed), 3);
  assert_eq!(eng.sink.posted.lock().unwrap().len(), 3);
}

#[tokio::test]
async fn hard_quota_caps_total_fetches_at_limit() {
  // 200 distinct ids available, but the 24h cap must stop us at LIMIT.
  let ids: Vec<u64> = (1..=200).collect();
  let backfill = SpyBackfill {
    account: ids,
    global: vec![],
    ..Default::default()
  };
  let eng = engine(SpyGc::default(), backfill);

  let p = eng
    .run_full_sync_if_enabled(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(p.fetched, LIMIT as u32);
  assert!(p.quota_reached);
  assert_eq!(eng.counter.load(Ordering::Relaxed), LIMIT as u64);
  // Persisted quota is full, proving it survives to the next process.
  assert_eq!(eng.persistence.quota_hits.lock().unwrap().len(), LIMIT);
}

#[tokio::test]
async fn monitoring_unions_history_and_to_fetch_then_backfills_within_quota() {
  let backfill = SpyBackfill {
    account: vec![100, 101],
    global: vec![200, 201, 202, 203, 204, 205, 206],
    ..Default::default()
  };
  // GC history contributes 102 and a duplicate of 100.
  let eng = engine(
    SpyGc {
      history: vec![102, 100],
      ..Default::default()
    },
    backfill,
  );

  let p = eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap()
    .unwrap();
  // own = {102, 101, 100} after union + dedup, fetched newest first.
  assert_eq!(p.fetched, 3);
  // Backfill takes the rest of the global list (quota has plenty left).
  assert_eq!(p.backfilled, 7);
  let posted = eng.sink.posted.lock().unwrap();
  assert_eq!(
    &posted[..3],
    &[102, 101, 100],
    "own matches, newest first, deduped"
  );
  assert_eq!(posted.len(), 10);
}

#[tokio::test]
async fn background_backfill_leaves_reserve_for_own_matches() {
  // No own matches, a bottomless global list: backfill must stop at LIMIT - reserve
  // rather than drain the whole bucket, so a later-played match keeps headroom.
  let backfill = SpyBackfill {
    account: vec![],
    global: (1..=200).collect(),
    ..Default::default()
  };
  let eng = engine(SpyGc::default(), backfill);

  let p = eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap()
    .unwrap();
  assert_eq!(p.fetched, 0);
  assert_eq!(p.backfilled as usize, LIMIT - BACKFILL_QUOTA_RESERVE);
  assert_eq!(p.quota_remaining as usize, BACKFILL_QUOTA_RESERVE);
  // The ids past the budget stay claimed unless released.
  assert_eq!(
    *eng.backfill.log.lock().unwrap(),
    [
      BackfillCall::Account,
      BackfillCall::Global,
      BackfillCall::Release
    ]
  );
}

#[tokio::test]
async fn background_pass_releases_the_global_claim_once_backfill_is_done() {
  let backfill = SpyBackfill {
    account: vec![100],
    global: vec![200, 201],
    ..Default::default()
  };
  let eng = engine(SpyGc::default(), backfill);

  let p = eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap()
    .unwrap();
  assert_eq!(p.backfilled, 2);
  // Released exactly once, after the global list, as the last deadlock-api call.
  assert_eq!(
    *eng.backfill.log.lock().unwrap(),
    [
      BackfillCall::Account,
      BackfillCall::Global,
      BackfillCall::Release
    ]
  );
}

#[tokio::test]
async fn background_pass_releases_the_global_claim_when_backfill_aborts() {
  let backfill = SpyBackfill {
    global: vec![200, 201, 202],
    ..Default::default()
  };
  // Not running for the pass-start check, the history page or the friends lookup,
  // but flips true on the first backfill salt fetch, aborting the pass with an error.
  let eng = engine_with_game_check(
    SpyGc::default(),
    backfill,
    SpyGameCheck {
      trip_after_calls: 4,
      ..Default::default()
    },
  );

  let p = eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await;
  assert!(matches!(p, Err(MatchSyncError::GameRunning)));
  assert!(eng.sink.posted.lock().unwrap().is_empty());
  assert_eq!(
    eng.backfill.log.lock().unwrap().last(),
    Some(&BackfillCall::Release)
  );
}

#[tokio::test]
async fn background_pass_without_backfill_claims_nothing_to_release() {
  // Rate-limited on the own matches: the global list is never requested.
  let backfill = SpyBackfill {
    account: vec![1],
    global: vec![9],
    ..Default::default()
  };
  let eng = engine(
    SpyGc {
      rate_limited: true,
      ..Default::default()
    },
    backfill,
  );

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(*eng.backfill.log.lock().unwrap(), [BackfillCall::Account]);
}

#[tokio::test]
async fn gc_failure_posts_nothing_and_spares_quota() {
  let backfill = SpyBackfill {
    account: vec![1, 2, 3],
    global: vec![],
    ..Default::default()
  };
  let eng = engine(
    SpyGc {
      fail: true,
      ..Default::default()
    },
    backfill,
  );

  let p = eng
    .run_full_sync_if_enabled(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(p.fetched, 0);
  assert!(eng.sink.posted.lock().unwrap().is_empty());
  // A failed fetch got no data, so it must not spend quota.
  assert!(eng.persistence.quota_hits.lock().unwrap().is_empty());
}

#[tokio::test]
async fn sticky_to_fetch_failure_does_not_falsely_complete_the_sync() {
  // deadlock-api's to-fetch list is sticky: it keeps listing an id until it's
  // actually ingested. A transient GC failure must not make that look "caught up".
  let backfill = SpyBackfill {
    account: vec![1],
    global: vec![],
    ..Default::default()
  };
  let eng = engine(
    SpyGc {
      fail: true,
      ..Default::default()
    },
    backfill,
  );

  let p = eng
    .run_full_sync_if_enabled(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(p.fetched, 0);
  assert!(!*eng.persistence.complete.lock().unwrap());
}

#[tokio::test]
async fn rate_limit_stops_the_pass_and_exhausts_quota_for_24h() {
  let backfill = SpyBackfill {
    account: vec![1, 2, 3],
    global: vec![9],
    ..Default::default()
  };
  let eng = engine(
    SpyGc {
      rate_limited: true,
      ..Default::default()
    },
    backfill,
  );

  let p = eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap()
    .unwrap();
  assert_eq!(p.fetched, 0);
  assert_eq!(p.backfilled, 0, "backed off before backfill");
  assert!(p.rate_limited);
  assert!(p.quota_reached);
  assert_eq!(p.quota_remaining, 0);
  // One history call + exactly one salts attempt, then stop.
  assert_eq!(eng.gc.calls.load(Ordering::Relaxed), 2);
  // The very first rate-limit hit burns the whole 24h bucket, not just this attempt.
  assert_eq!(eng.persistence.quota_hits.lock().unwrap().len(), LIMIT);
}

#[tokio::test]
async fn cancel_stops_full_sync() {
  let ids: Vec<u64> = (1..=50).collect();
  let backfill = SpyBackfill {
    account: ids,
    global: vec![],
    ..Default::default()
  };
  let eng = engine(SpyGc::default(), backfill);
  let cancel = Arc::new(AtomicBool::new(true));

  let p = eng
    .run_full_sync_if_enabled(&active_config(), &cancel)
    .await
    .unwrap();
  assert_eq!(p.fetched, 0);
  assert_eq!(eng.gc.calls.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn cancel_stops_background_pass() {
  let backfill = SpyBackfill {
    account: (1..=50).collect(),
    global: vec![],
    ..Default::default()
  };
  let eng = engine(SpyGc::default(), backfill);
  let cancel = AtomicBool::new(true);

  let p = eng
    .run_background_pass(&active_config(), &cancel)
    .await
    .unwrap()
    .unwrap();
  assert_eq!(p.fetched, 0);
  assert_eq!(eng.gc.calls.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn refuses_while_game_is_running() {
  let backfill = SpyBackfill {
    account: vec![1, 2, 3],
    global: vec![9],
    ..Default::default()
  };
  let eng = engine_with_game_check(
    SpyGc::default(),
    backfill,
    SpyGameCheck {
      running: true,
      ..Default::default()
    },
  );

  assert!(matches!(
    eng
      .run_full_sync_if_enabled(&active_config(), &AtomicBool::new(false))
      .await,
    Err(MatchSyncError::GameRunning)
  ));
  assert_eq!(eng.auth.calls.load(Ordering::Relaxed), 0);
  assert_eq!(eng.gc.calls.load(Ordering::Relaxed), 0);

  // Background pass treats it as a quiet no-op, not an error.
  assert!(
    eng
      .run_background_pass(&active_config(), &AtomicBool::new(false))
      .await
      .unwrap()
      .is_none()
  );
  assert_eq!(eng.auth.calls.load(Ordering::Relaxed), 0);
  assert_eq!(eng.gc.calls.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn fails_closed_when_quota_cannot_be_loaded() {
  let backfill = SpyBackfill {
    account: vec![1, 2, 3],
    global: vec![],
    ..Default::default()
  };
  let eng = engine_with_persistence(
    SpyGc::default(),
    backfill,
    SpyGameCheck::default(),
    MemPersistence {
      now: 1_000_000,
      fail_load_quota: true,
      ..Default::default()
    },
  );

  assert!(matches!(
    eng
      .run_full_sync_if_enabled(&active_config(), &AtomicBool::new(false))
      .await,
    Err(MatchSyncError::Store(_))
  ));
  // A quota we couldn't read must not be treated as empty (full headroom).
  assert_eq!(eng.gc.calls.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn stops_fetching_when_quota_cannot_be_saved() {
  let backfill = SpyBackfill {
    account: vec![1, 2, 3],
    global: vec![],
    ..Default::default()
  };
  let eng = engine_with_persistence(
    SpyGc::default(),
    backfill,
    SpyGameCheck::default(),
    MemPersistence {
      now: 1_000_000,
      fail_save_quota: true,
      ..Default::default()
    },
  );

  assert!(matches!(
    eng
      .run_full_sync_if_enabled(&active_config(), &AtomicBool::new(false))
      .await,
    Err(MatchSyncError::Store(_))
  ));
  // The fetch that couldn't be persisted must not be reported as posted.
  assert!(eng.sink.posted.lock().unwrap().is_empty());
}

#[tokio::test]
async fn background_pass_finalizes_progress_as_not_running_on_mid_pass_failure() {
  let backfill = SpyBackfill {
    account: vec![1, 2, 3],
    global: vec![],
    ..Default::default()
  };
  let eng = engine_with_persistence(
    SpyGc::default(),
    backfill,
    SpyGameCheck::default(),
    MemPersistence {
      now: 1_000_000,
      fail_save_quota: true,
      ..Default::default()
    },
  );

  assert!(
    eng
      .run_background_pass(&active_config(), &AtomicBool::new(false))
      .await
      .is_err()
  );
  // Even though the pass aborted mid-fetch, the last emitted progress must
  // reflect "not running" so the UI never sticks on a stale "running" state.
  assert_eq!(
    *eng.persistence.last_progress_running.lock().unwrap(),
    Some(false)
  );
}

#[tokio::test]
async fn game_launching_mid_pass_aborts_the_run() {
  let backfill = SpyBackfill {
    account: vec![1, 2, 3, 4, 5],
    global: vec![],
    ..Default::default()
  };
  // Not running for the pass-start check or the history page, but flips true on
  // the first salt fetch (the actual GC choke point, not just pass-start).
  let eng = engine_with_game_check(
    SpyGc::default(),
    backfill,
    SpyGameCheck {
      trip_after_calls: 3,
      ..Default::default()
    },
  );

  let p = eng
    .run_full_sync_if_enabled(&active_config(), &AtomicBool::new(false))
    .await;
  assert!(matches!(p, Err(MatchSyncError::GameRunning)));
  // Aborted at the first match, not after walking the whole list.
  assert!(eng.sink.posted.lock().unwrap().is_empty());
}

#[tokio::test]
async fn swallowed_salt_gc_error_is_still_reported_via_hook() {
  // A salt-fetch GcUnavailable is swallowed to Ok (best-effort), but the orchestrator
  // needs to see it to back the account off — the hook is that channel.
  let backfill = SpyBackfill {
    account: vec![1, 2, 3],
    global: vec![],
    ..Default::default()
  };
  let eng = engine(
    SpyGc {
      fail: true,
      ..Default::default()
    },
    backfill,
  );

  let p = eng
    .run_full_sync_if_enabled(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(p.fetched, 0);
  assert!(eng.persistence.gc_errors.load(Ordering::Relaxed) > 0);
}

#[tokio::test]
async fn swallowed_history_gc_error_is_still_reported_via_hook() {
  // A history-page GcUnavailable is likewise swallowed (Vec::new / break) but must
  // reach the hook so a broken-handshake account (e.g. no game ownership) backs off.
  let backfill = SpyBackfill {
    account: vec![],
    global: vec![],
    ..Default::default()
  };
  let eng = engine(
    SpyGc {
      fail_history: true,
      ..Default::default()
    },
    backfill,
  );

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert!(eng.persistence.gc_errors.load(Ordering::Relaxed) > 0);
}

const NOW: i64 = 1_000_000;
const FRIEND: u32 = 7;

// A friend in Deadlock right now whose newest stored match ended two hours ago, with
// salts stored for their two older matches.
fn friend_scenario(global: Vec<u64>) -> (SpyGc, SpyBackfill) {
  let gc = SpyGc {
    friends: HashMap::from([(
      FRIEND,
      Persona {
        in_deadlock: true,
        online: true,
        last_seen: None,
      },
    )]),
    friend_history: vec![502, 501, 500, 499],
    ..Default::default()
  };
  let backfill = SpyBackfill {
    global,
    active: vec![ActiveFriend {
      account_id: FRIEND,
      last_end: NOW - 2 * 60 * 60,
      starts: Vec::new(),
    }],
    stored_salts: HashSet::from([500, 499]),
    ..Default::default()
  };
  (gc, backfill)
}

#[tokio::test]
async fn friends_new_matches_are_backfilled_before_the_global_list() {
  let (gc, backfill) = friend_scenario(vec![600]);
  let eng = engine(gc, backfill);

  let p = eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap()
    .unwrap();
  assert_eq!(p.backfilled, 3);
  // Only the matches deadlock-api has no salts for, ahead of the global list.
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![502, 501, 600]);
  assert_eq!(eng.persistence.history_hits.lock().unwrap().len(), 1);
  assert_eq!(
    eng.persistence.cooldowns.lock().unwrap().get(&FRIEND),
    Some(&(NOW + FRIEND_COOLDOWN_SECS))
  );
}

#[tokio::test]
async fn friend_comes_back_soon_while_the_budget_leaves_matches_unfetched() {
  let (gc, backfill) = friend_scenario(Vec::new());
  // 9 fetches left: 1 above the reserve kept for the user's own matches.
  let eng = engine_with_persistence(
    gc,
    backfill,
    SpyGameCheck::default(),
    MemPersistence {
      now: NOW,
      quota_hits: Mutex::new(vec![NOW; LIMIT - BACKFILL_QUOTA_RESERVE - 1]),
      ..Default::default()
    },
  );

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![502]);
  assert_eq!(
    eng.persistence.cooldowns.lock().unwrap().get(&FRIEND),
    Some(&(NOW + UNFINISHED_FRIEND_COOLDOWN_SECS))
  );
}

#[tokio::test]
async fn friend_comes_back_soon_when_fetching_their_match_fails() {
  let (mut gc, backfill) = friend_scenario(Vec::new());
  gc.fail = true;
  let eng = engine(gc, backfill);

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert!(eng.sink.posted.lock().unwrap().is_empty());
  assert_eq!(
    eng.persistence.cooldowns.lock().unwrap().get(&FRIEND),
    Some(&(NOW + UNFINISHED_FRIEND_COOLDOWN_SECS))
  );
}

#[tokio::test]
async fn refused_friend_match_is_skipped_without_backing_off() {
  let (mut gc, backfill) = friend_scenario(vec![600]);
  gc.refused = HashSet::from([502]);
  let eng = engine(gc, backfill);

  let p = eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap()
    .unwrap();
  assert_eq!(p.skipped, 1);
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![501, 600]);
  assert_eq!(
    eng.persistence.cooldowns.lock().unwrap().get(&FRIEND),
    Some(&(NOW + FRIEND_COOLDOWN_SECS))
  );
  assert_eq!(eng.persistence.gc_errors.load(Ordering::Relaxed), 0);
  // The refusal is a GC answer too, so it counts like the two fetches.
  assert_eq!(eng.persistence.quota_hits.lock().unwrap().len(), 3);
  // ...and is remembered, so no later pass asks for it again.
  assert!(eng.persistence.fetched.lock().unwrap().contains(&502));
}

#[tokio::test]
async fn in_flight_friend_match_is_skipped_without_stopping_the_pass() {
  let (mut gc, backfill) = friend_scenario(vec![600]);
  gc.in_flight = HashSet::from([502]);
  let eng = engine(gc, backfill);

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![501, 600]);
  assert_eq!(
    eng.persistence.cooldowns.lock().unwrap().get(&FRIEND),
    Some(&(NOW + FRIEND_COOLDOWN_SECS))
  );
  assert_eq!(eng.persistence.gc_errors.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn game_launching_while_friends_are_ranked_skips_the_persona_request() {
  let (gc, backfill) = friend_scenario(Vec::new());
  // Running from the check right before the persona request: after the pass-start
  // check, the user's own history page and the friend lookup's own check.
  let eng = engine_with_game_check(
    gc,
    backfill,
    SpyGameCheck {
      trip_after_calls: 4,
      ..Default::default()
    },
  );

  let result = eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await;
  assert!(matches!(result, Err(MatchSyncError::GameRunning)));
  assert_eq!(eng.gc.persona_calls.load(Ordering::Relaxed), 0);
  assert!(eng.persistence.history_hits.lock().unwrap().is_empty());
}

#[tokio::test]
async fn launch_while_reading_the_friends_list_stops_the_pass() {
  let (mut gc, backfill) = friend_scenario(vec![600]);
  gc.friend_ids_error = Some(|| MatchSyncError::GameRunning);
  let eng = engine(gc, backfill);

  let result = eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await;
  assert!(matches!(result, Err(MatchSyncError::GameRunning)));
  assert!(eng.sink.posted.lock().unwrap().is_empty());
}

#[tokio::test]
async fn rate_limited_own_history_rules_out_friend_lookups() {
  let (mut gc, backfill) = friend_scenario(vec![600]);
  gc.own_history_rate_limited = true;
  let eng = engine(gc, backfill);

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(
    eng.persistence.history_hits.lock().unwrap().len(),
    FRIEND_HISTORY_QUOTA_LIMIT
  );
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![600]);
}

#[tokio::test]
async fn forbidden_friend_match_is_skipped_without_backing_off() {
  let (mut gc, backfill) = friend_scenario(vec![600]);
  gc.forbidden = HashSet::from([502]);
  let eng = engine(gc, backfill);

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![501, 600]);
  assert_eq!(eng.persistence.gc_errors.load(Ordering::Relaxed), 0);
  // Not written off: a later lookup may ask again.
  assert!(!eng.persistence.fetched.lock().unwrap().contains(&502));
}

#[tokio::test]
async fn forbidden_own_match_backs_the_account_off() {
  let gc = SpyGc {
    history: vec![10, 11],
    forbidden: HashSet::from([11]),
    ..Default::default()
  };
  let eng = engine(gc, SpyBackfill::default());

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert!(eng.sink.posted.lock().unwrap().is_empty());
  assert_eq!(eng.persistence.gc_errors.load(Ordering::Relaxed), 1);
}

#[tokio::test]
async fn friends_on_cooldown_are_not_looked_up() {
  let (gc, backfill) = friend_scenario(vec![600]);
  let eng = engine(gc, backfill);
  eng
    .persistence
    .cooldowns
    .lock()
    .unwrap()
    .insert(FRIEND, NOW + 60);

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert!(eng.persistence.history_hits.lock().unwrap().is_empty());
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![600]);
}

#[tokio::test]
async fn private_friend_history_cools_down_longer_without_backing_off_the_account() {
  let (mut gc, backfill) = friend_scenario(vec![600]);
  gc.friend_history_error = Some(|| MatchSyncError::GcRefused(GcRefusal::NoPermission));
  let eng = engine(gc, backfill);

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(eng.persistence.history_hits.lock().unwrap().len(), 1);
  assert_eq!(
    eng.persistence.cooldowns.lock().unwrap().get(&FRIEND),
    Some(&(NOW + PRIVATE_FRIEND_COOLDOWN_SECS))
  );
  assert_eq!(eng.persistence.gc_errors.load(Ordering::Relaxed), 0);
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![600]);
}

#[tokio::test]
async fn unanswered_friend_history_stops_lookups_without_charging_or_backing_off() {
  let (mut gc, backfill) = friend_scenario(vec![600]);
  gc.friend_history_error = Some(|| MatchSyncError::GcUnavailable("spy".into()));
  let eng = engine(gc, backfill);

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert!(eng.persistence.cooldowns.lock().unwrap().is_empty());
  assert!(eng.persistence.history_hits.lock().unwrap().is_empty());
  assert_eq!(eng.persistence.gc_errors.load(Ordering::Relaxed), 0);
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![600]);
}

#[tokio::test]
async fn refused_friend_history_cools_down_without_backing_off_the_account() {
  let (mut gc, backfill) = friend_scenario(vec![600]);
  gc.friend_history_error = Some(|| MatchSyncError::GcRefused(GcRefusal::Other(2)));
  let eng = engine(gc, backfill);

  eng
    .run_background_pass(&active_config(), &AtomicBool::new(false))
    .await
    .unwrap();
  assert_eq!(
    eng.persistence.cooldowns.lock().unwrap().get(&FRIEND),
    Some(&(NOW + FRIEND_COOLDOWN_SECS))
  );
  assert_eq!(eng.persistence.gc_errors.load(Ordering::Relaxed), 0);
  assert_eq!(*eng.sink.posted.lock().unwrap(), vec![600]);
}
