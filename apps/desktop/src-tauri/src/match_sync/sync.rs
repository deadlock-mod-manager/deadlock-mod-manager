//! Sync orchestration. Generic over its dependencies so the whole pipeline is
//! unit-testable with spies. All GC fetches funnel through `fetch_one`, the single
//! choke point that enforces: already-fetched skip → persisted quota → throttle →
//! counter. `*_if_enabled` are the off-by-default gate.

use std::collections::HashSet;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use super::api_client::{BackfillSource, SaltsSink};
use super::auth::SteamAuthProvider;
use super::error::MatchSyncError;
use super::game_check::GameRunningCheck;
use super::gc_client::GcMatchClient;
use super::model::{
  AuthContext, BACKFILL_QUOTA_RESERVE, FetchScope, MatchHistoryPage, MatchSyncConfig, SaltPayload,
  SyncProgress,
};
use super::quota::QuotaWindow;
use super::throttle::Throttle;

pub trait SyncPersistence: Send + Sync {
  fn now(&self) -> i64;
  fn load_quota(&self) -> Result<QuotaWindow, MatchSyncError>;
  fn save_quota(&self, quota: &QuotaWindow) -> Result<(), MatchSyncError>;
  fn load_fetched(&self) -> Vec<u64>;
  fn persist_fetched(&self, ids: &[u64]);
  fn set_full_sync_complete(&self, complete: bool);
  fn emit_progress(&self, progress: &SyncProgress);
  // Observability hook for GC failures that the engine deliberately swallows as
  // best-effort resilience (so one dead source doesn't block the other). Lets the
  // orchestrator back off an account whose GC connection is broken, even though the
  // run itself still returns Ok. Default no-op: most callers don't care.
  fn record_gc_error(&self, _err: &MatchSyncError) {}
}

enum FetchStep {
  Done,
  QuotaReached,
  RateLimited,
  // A non-rate-limit GC failure: this match was NOT fetched, so it must not be
  // treated as caught-up (a sticky to-fetch list could otherwise "complete" a
  // sync that never actually posted this match's salts).
  RetryLater,
}

enum LoopControl {
  Continue,
  Stop,
}

struct RunState {
  // Persisted, successfully-ingested ids (idempotency across runs + quota protection).
  fetched_set: HashSet<u64>,
  // Every id acted on this run (incl. failures/skips) so a sticky to-fetch list or a
  // failing GC can't re-offer the same id and spin/burn quota.
  processed: HashSet<u64>,
  fetched_order: Vec<u64>,
  quota: QuotaWindow,
  progress: SyncProgress,
}

fn newest_first_fresh(ids: Vec<u64>, processed: &HashSet<u64>) -> Vec<u64> {
  let mut ids: Vec<u64> = ids.into_iter().filter(|id| !processed.contains(id)).collect();
  ids.sort_unstable_by(|a, b| b.cmp(a));
  ids.dedup();
  ids
}

pub struct SyncEngine<A, G, S, B, P, R> {
  auth: A,
  gc: G,
  sink: S,
  backfill: B,
  persistence: P,
  game_check: R,
  throttle: Arc<Throttle>,
  counter: Arc<AtomicU64>,
}

impl<A, G, S, B, P, R> SyncEngine<A, G, S, B, P, R>
where
  A: SteamAuthProvider,
  G: GcMatchClient,
  S: SaltsSink,
  B: BackfillSource,
  P: SyncPersistence,
  R: GameRunningCheck,
{
  pub fn new(
    auth: A,
    gc: G,
    sink: S,
    backfill: B,
    persistence: P,
    game_check: R,
    throttle: Arc<Throttle>,
    counter: Arc<AtomicU64>,
  ) -> Self {
    Self {
      auth,
      gc,
      sink,
      backfill,
      persistence,
      game_check,
      throttle,
      counter,
    }
  }

  fn new_run_state(&self) -> Result<RunState, MatchSyncError> {
    let fetched_order = self.persistence.load_fetched();
    let fetched_set: HashSet<u64> = fetched_order.iter().copied().collect();
    let quota = self.persistence.load_quota()?;
    let remaining = quota.remaining(self.persistence.now()) as u32;
    Ok(RunState {
      fetched_set,
      processed: HashSet::new(),
      fetched_order,
      quota,
      progress: SyncProgress {
        fetched: 0,
        skipped: 0,
        backfilled: 0,
        running: true,
        quota_reached: false,
        rate_limited: false,
        quota_remaining: remaining,
      },
    })
  }

  async fn fetch_one(
    &self,
    ctx: &AuthContext,
    match_id: u64,
    is_backfill: bool,
    st: &mut RunState,
  ) -> Result<FetchStep, MatchSyncError> {
    st.processed.insert(match_id);

    if st.fetched_set.contains(&match_id) {
      st.progress.skipped += 1;
      return Ok(FetchStep::Done);
    }

    let now = self.persistence.now();
    // The 24h cap counts successful salt fetches; check headroom before requesting.
    if st.quota.remaining(now) == 0 {
      st.progress.quota_reached = true;
      st.progress.quota_remaining = 0;
      return Ok(FetchStep::QuotaReached);
    }
    self.throttle.acquire().await;
    // Re-checked here, not just at pass-start, and after the throttle wait (up to
    // GC_MIN_INTERVAL), not before it: the game can launch during that sleep, and this
    // is the actual GC choke point that must never race the game's own session.
    if self.game_check.is_game_running() {
      return Err(MatchSyncError::GameRunning);
    }
    self.counter.fetch_add(1, Ordering::Relaxed);

    let salts = match self.gc.fetch_match_salts(ctx, match_id).await {
      Ok(salts) => salts,
      // Steam itself is rate-limiting this account: treat the 24h bucket as fully
      // spent so we stop hammering it and only try again once it naturally frees up.
      Err(MatchSyncError::GcRateLimited) => {
        log::warn!("match-sync: Steam GC rate-limited; treating quota as exhausted for 24h");
        st.quota.exhaust(now);
        self.persistence.save_quota(&st.quota)?;
        st.progress.rate_limited = true;
        st.progress.quota_reached = true;
        st.progress.quota_remaining = st.quota.remaining(now) as u32;
        return Ok(FetchStep::RateLimited);
      }
      // Any other failure fetched nothing, so it must not count against the cap.
      Err(e) => {
        log::warn!("match-sync: GC fetch failed for {match_id}: {e}");
        self.persistence.record_gc_error(&e);
        return Ok(FetchStep::RetryLater);
      }
    };

    let _ = st.quota.try_consume(now);
    self.persistence.save_quota(&st.quota)?;

    self.sink.post_salts(&[SaltPayload::from(&salts)]).await?;

    st.fetched_set.insert(match_id);
    st.fetched_order.push(match_id);
    self.persistence.persist_fetched(&st.fetched_order);

    if is_backfill {
      st.progress.backfilled += 1;
    } else {
      st.progress.fetched += 1;
    }
    st.progress.quota_remaining = st.quota.remaining(now) as u32;
    self.persistence.emit_progress(&st.progress);
    Ok(FetchStep::Done)
  }

  async fn process_ids(
    &self,
    ctx: &AuthContext,
    ids: Vec<u64>,
    is_backfill: bool,
    cancel: Option<&AtomicBool>,
    st: &mut RunState,
  ) -> Result<LoopControl, MatchSyncError> {
    for id in ids {
      if cancel.is_some_and(|flag| flag.load(Ordering::Relaxed)) {
        return Ok(LoopControl::Stop);
      }
      match self.fetch_one(ctx, id, is_backfill, st).await? {
        FetchStep::Done => {}
        FetchStep::QuotaReached | FetchStep::RateLimited | FetchStep::RetryLater => {
          return Ok(LoopControl::Stop);
        }
      }
    }
    Ok(LoopControl::Continue)
  }

  // Throttled, not quota-counted: a history query is not a salt fetch.
  async fn gc_history_page(
    &self,
    ctx: &AuthContext,
    cursor: Option<u64>,
  ) -> Result<MatchHistoryPage, MatchSyncError> {
    self.throttle.acquire().await;
    // Checked after the throttle wait, not before: the game may launch during the sleep.
    if self.game_check.is_game_running() {
      return Err(MatchSyncError::GameRunning);
    }
    self.gc.fetch_match_history(ctx, cursor).await
  }

  fn finish(&self, mut st: RunState) -> SyncProgress {
    st.progress.running = false;
    self.persistence.emit_progress(&st.progress);
    st.progress
  }

  pub async fn run_full_sync_if_enabled(
    &self,
    config: &MatchSyncConfig,
    cancel: &AtomicBool,
  ) -> Result<SyncProgress, MatchSyncError> {
    if !config.consent_accepted {
      return Err(MatchSyncError::ConsentRequired);
    }
    if !config.enabled {
      return Err(MatchSyncError::Disabled);
    }
    self.run_full_sync(cancel).await
  }

  async fn run_full_sync(&self, cancel: &AtomicBool) -> Result<SyncProgress, MatchSyncError> {
    let mut st = self.new_run_state()?;
    // Emit immediately so the UI reflects "running" even if auth fails below.
    self.persistence.emit_progress(&st.progress);
    let result = self.full_sync_inner(cancel, &mut st).await;
    // Always clear the running state, even on error, so the UI never sticks.
    st.progress.running = false;
    self.persistence.emit_progress(&st.progress);
    result.map(|()| st.progress)
  }

  async fn full_sync_inner(
    &self,
    cancel: &AtomicBool,
    st: &mut RunState,
  ) -> Result<(), MatchSyncError> {
    if self.game_check.is_game_running() {
      return Err(MatchSyncError::GameRunning);
    }
    let ctx = self.auth.recover()?;
    let account_id = ctx.account_id();

    // 1. Paginate the GC match history newest-first, interleaving salt fetches so we
    //    stop paging the moment the 24h quota runs out.
    let mut cursor: Option<u64> = None;
    let mut history_complete = false;
    loop {
      if cancel.load(Ordering::Relaxed) {
        return Ok(());
      }
      let page = match self.gc_history_page(&ctx, cursor).await {
        Ok(page) => page,
        Err(MatchSyncError::GameRunning) => return Err(MatchSyncError::GameRunning),
        Err(e) => {
          log::warn!("match-sync: GC match history unavailable: {e}");
          self.persistence.record_gc_error(&e);
          break;
        }
      };
      let fresh = newest_first_fresh(page.match_ids, &st.processed);
      if let LoopControl::Stop = self.process_ids(&ctx, fresh, false, Some(cancel), st).await? {
        return Ok(());
      }
      match page.next_cursor {
        Some(next) => cursor = Some(next),
        None => {
          history_complete = true;
          break;
        }
      }
    }

    // 2. Drain deadlock-api's "missing for this account" list until empty or quota.
    loop {
      if cancel.load(Ordering::Relaxed) {
        return Ok(());
      }
      let ids = self.backfill.to_fetch(FetchScope::Account(account_id)).await?;
      let fresh = newest_first_fresh(ids, &st.processed);
      if fresh.is_empty() {
        // Only the account's own matches were walked here; the Steam history walk
        // must have finished too, or this isn't really "caught up" yet.
        if history_complete {
          self.persistence.set_full_sync_complete(true);
        }
        return Ok(());
      }
      if let LoopControl::Stop = self.process_ids(&ctx, fresh, false, Some(cancel), st).await? {
        return Ok(());
      }
    }
  }

  // One background pass: the user's own new matches, then global backfill, all
  // bounded by the shared 24h quota. A no-op unless the user has opted in, or
  // while Deadlock is running (Steam routes GC traffic to the game's own pipe).
  pub async fn run_background_pass(
    &self,
    config: &MatchSyncConfig,
    cancel: &AtomicBool,
  ) -> Result<Option<SyncProgress>, MatchSyncError> {
    if !config.is_active() || self.game_check.is_game_running() {
      return Ok(None);
    }
    Some(self.run_background(cancel).await).transpose()
  }

  async fn run_background(&self, cancel: &AtomicBool) -> Result<SyncProgress, MatchSyncError> {
    let mut st = self.new_run_state()?;
    if cancel.load(Ordering::Relaxed) {
      return Ok(self.finish(st));
    }
    // Emit immediately so the UI reflects "running" even if auth fails below.
    self.persistence.emit_progress(&st.progress);
    let result = self.run_background_inner(cancel, &mut st).await;
    // Always clear the running state, even on error (e.g. a save_quota or
    // post_salts failure mid-pass), so the UI never sticks on "running".
    st.progress.running = false;
    self.persistence.emit_progress(&st.progress);
    result.map(|()| st.progress)
  }

  async fn run_background_inner(
    &self,
    cancel: &AtomicBool,
    st: &mut RunState,
  ) -> Result<(), MatchSyncError> {
    let ctx = self.auth.recover()?;
    let account_id = ctx.account_id();

    // Own matches = the newest GC history page ∪ deadlock-api's missing-for-account
    // list, newest first. Both best-effort so one being down still syncs the other.
    let mut own_ids = match self.gc_history_page(&ctx, None).await {
      Ok(page) => page.match_ids,
      Err(MatchSyncError::GameRunning) => return Err(MatchSyncError::GameRunning),
      Err(e) => {
        log::warn!("match-sync: GC match history unavailable: {e}");
        self.persistence.record_gc_error(&e);
        Vec::new()
      }
    };
    match self.backfill.to_fetch(FetchScope::Account(account_id)).await {
      Ok(ids) => own_ids.extend(ids),
      Err(e) => log::warn!("match-sync: account to-fetch unavailable: {e}"),
    }
    let own = newest_first_fresh(own_ids, &st.processed);
    let control = self.process_ids(&ctx, own, false, Some(cancel), st).await?;

    // Backfill globally-missing matches with whatever of the 24h quota is left over,
    // fully in the background. The user's own matches always go first.
    if let LoopControl::Continue = control
      && !cancel.load(Ordering::Relaxed)
    {
      // Keep a reserve untouched so the user's own matches — always fetched first, and
      // not subject to this cap — retain headroom against a bottomless global list.
      let budget = st
        .quota
        .remaining(self.persistence.now())
        .saturating_sub(BACKFILL_QUOTA_RESERVE);
      if budget > 0 {
        match self.backfill.to_fetch(FetchScope::Global).await {
          Ok(global) => {
            let picks: Vec<u64> = newest_first_fresh(global, &st.processed)
              .into_iter()
              .take(budget)
              .collect();
            self.process_ids(&ctx, picks, true, Some(cancel), st).await?;
          }
          Err(e) => log::warn!("match-sync: global to-fetch unavailable: {e}"),
        }
      }
    }

    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::match_sync::model::{AuthContext, MatchHistoryPage, MatchSalts};
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
    rate_limited: bool,
    history: Vec<u64>,
  }
  impl GcMatchClient for SpyGc {
    async fn fetch_match_history(
      &self,
      _ctx: &AuthContext,
      _cursor: Option<u64>,
    ) -> Result<MatchHistoryPage, MatchSyncError> {
      self.calls.fetch_add(1, Ordering::Relaxed);
      if self.fail_history {
        return Err(MatchSyncError::GcUnavailable("spy history".into()));
      }
      Ok(MatchHistoryPage {
        match_ids: self.history.clone(),
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
      Ok(MatchSalts {
        match_id,
        cluster_id: Some(1),
        metadata_salt: Some(2),
        replay_salt: Some(3),
      })
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

  // Sticky, like the real endpoint: it keeps listing the same ids until they are
  // ingested, so run termination must come from the run-local `processed` set.
  struct SpyBackfill {
    account: Vec<u64>,
    global: Vec<u64>,
    calls: AtomicU64,
  }
  impl BackfillSource for SpyBackfill {
    async fn to_fetch(&self, scope: FetchScope) -> Result<Vec<u64>, MatchSyncError> {
      self.calls.fetch_add(1, Ordering::Relaxed);
      match scope {
        FetchScope::Account(_) => Ok(self.account.clone()),
        FetchScope::Global => Ok(self.global.clone()),
      }
    }
  }

  #[derive(Default)]
  struct MemPersistence {
    now: i64,
    quota_hits: Mutex<Vec<i64>>,
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
      Ok(QuotaWindow::new(self.quota_hits.lock().unwrap().clone(), LIMIT, WINDOW))
    }
    fn save_quota(&self, quota: &QuotaWindow) -> Result<(), MatchSyncError> {
      if self.fail_save_quota {
        return Err(MatchSyncError::Store("spy save failure".into()));
      }
      *self.quota_hits.lock().unwrap() = quota.snapshot();
      Ok(())
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
  async fn off_by_default_does_nothing() {
    let eng = engine(
      SpyGc::default(),
      SpyBackfill {
        account: vec![1, 2, 3],
        global: vec![9, 8, 7],
        calls: AtomicU64::new(0),
      },
    );
    let config = MatchSyncConfig::default();

    let out = eng.run_background_pass(&config, &AtomicBool::new(false)).await.unwrap();
    assert!(out.is_none());
    assert!(eng.run_full_sync_if_enabled(&config, &AtomicBool::new(false)).await.is_err());

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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
    assert_eq!(&posted[..3], &[102, 101, 100], "own matches, newest first, deduped");
    assert_eq!(posted.len(), 10);
  }

  #[tokio::test]
  async fn background_backfill_leaves_reserve_for_own_matches() {
    // No own matches, a bottomless global list: backfill must stop at LIMIT - reserve
    // rather than drain the whole bucket, so a later-played match keeps headroom.
    let backfill = SpyBackfill {
      account: vec![],
      global: (1..=200).collect(),
      calls: AtomicU64::new(0),
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
  }

  #[tokio::test]
  async fn gc_failure_posts_nothing_and_spares_quota() {
    let backfill = SpyBackfill {
      account: vec![1, 2, 3],
      global: vec![],
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
      eng.run_full_sync_if_enabled(&active_config(), &AtomicBool::new(false))
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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
      calls: AtomicU64::new(0),
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
}
