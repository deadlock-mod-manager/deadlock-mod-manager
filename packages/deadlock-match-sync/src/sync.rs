mod friend_phase;

use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use super::api_client::{BackfillSource, SaltsSink};
use super::auth::SteamAuthProvider;
use super::error::{GcRefusal, MatchSyncError};
use super::game_check::GameRunningCheck;
use super::gc_client::GcMatchClient;
use super::model::{
  ACCOUNT_LIST_INTERVAL_SECS, Attempt, AttemptResult, AuthContext, BACKFILL_QUOTA_RESERVE,
  FetchScope, MatchHistoryPage, MatchSyncConfig, QuotaKind, SaltPayload, SaltsCheck, SyncProgress,
};
use super::quota::QuotaWindow;
use super::throttle::Throttle;

pub trait SyncPersistence: Send + Sync {
  fn now(&self) -> i64;
  fn load_quota(&self, kind: QuotaKind) -> Result<QuotaWindow, MatchSyncError>;
  fn save_quota(&self, kind: QuotaKind, quota: &QuotaWindow) -> Result<(), MatchSyncError>;
  fn friend_cooldowns(&self) -> HashMap<u32, i64>;
  fn set_friend_cooldowns(&self, cooldowns: &[(u32, i64)]);
  fn load_fetched(&self) -> Vec<u64>;
  fn persist_fetched(&self, ids: &[u64]);
  fn set_full_sync_complete(&self, complete: bool);
  fn account_list_drained_at(&self) -> Option<i64>;
  fn set_account_list_drained_at(&self, at: Option<i64>);
  fn emit_progress(&self, progress: &SyncProgress);
  fn record_gc_error(&self, _err: &MatchSyncError) {}
}

enum FetchStep {
  Done,
  QuotaReached,
  RateLimited,
  RetryLater,
}

enum LoopControl {
  Continue,
  Stop,
}

enum Outcome {
  Untried,
  Done,
  Asked(AttemptResult),
}

struct RunState {
  fetched_set: HashSet<u64>,
  fetched_order: Vec<u64>,
  outcomes: HashMap<u64, Outcome>,
  quota: QuotaWindow,
  progress: SyncProgress,
}

impl RunState {
  fn newest_first_fresh(&self, ids: Vec<u64>) -> Vec<u64> {
    let mut ids: Vec<u64> = ids
      .into_iter()
      .filter(|id| !self.outcomes.contains_key(id))
      .collect();
    ids.sort_unstable_by(|a, b| b.cmp(a));
    ids.dedup();
    ids
  }

  fn settled(&self, id: u64) -> bool {
    self.fetched_set.contains(&id)
      || matches!(
        self.outcomes.get(&id),
        Some(Outcome::Done | Outcome::Asked(AttemptResult::InFlight | AttemptResult::NoPermission))
      )
  }

  fn release_report(&self, ids: &[u64]) -> Vec<Attempt> {
    ids
      .iter()
      .filter_map(|&match_id| {
        let result = match self.outcomes.get(&match_id)? {
          Outcome::Untried => return None,
          Outcome::Done => AttemptResult::Fetched,
          Outcome::Asked(result) => *result,
        };
        Some(Attempt { match_id, result })
      })
      .collect()
  }
}

fn best_effort<T>(
  result: Result<T, MatchSyncError>,
  what: &str,
) -> Result<Option<T>, MatchSyncError> {
  match result {
    Ok(value) => Ok(Some(value)),
    Err(e) if e.ends_pass() => Err(e),
    Err(e) => {
      log::warn!("match-sync: {what} unavailable: {e}");
      Ok(None)
    }
  }
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
    let quota = self.persistence.load_quota(QuotaKind::Salts)?;
    let remaining = quota.remaining(self.persistence.now()) as u32;
    Ok(RunState {
      fetched_set,
      fetched_order,
      outcomes: HashMap::new(),
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
    if st.fetched_set.contains(&match_id) {
      st.outcomes.insert(match_id, Outcome::Done);
      st.progress.skipped += 1;
      return Ok(FetchStep::Done);
    }
    st.outcomes.insert(match_id, Outcome::Untried);

    let now = self.persistence.now();
    if st.quota.remaining(now) == 0 {
      st.progress.quota_reached = true;
      st.progress.quota_remaining = 0;
      return Ok(FetchStep::QuotaReached);
    }
    self.throttle.acquire().await;
    let fetched = self.gc_call(async {
      self.counter.fetch_add(1, Ordering::Relaxed);
      self.gc.fetch_match_salts(ctx, match_id).await
    });

    let salts = match fetched.await {
      Ok(salts) => salts,
      Err(e) if e.ends_pass() => return Err(e),
      Err(MatchSyncError::GcRateLimited) => {
        log::warn!("match-sync: Steam GC rate-limited; treating quota as exhausted for 24h");
        st.outcomes
          .insert(match_id, Outcome::Asked(AttemptResult::Failed));
        st.quota.exhaust(now);
        self.persistence.save_quota(QuotaKind::Salts, &st.quota)?;
        st.progress.rate_limited = true;
        st.progress.quota_reached = true;
        st.progress.quota_remaining = st.quota.remaining(now) as u32;
        return Ok(FetchStep::RateLimited);
      }
      Err(e @ MatchSyncError::GcRefused(GcRefusal::InvalidMatch)) => {
        log::debug!("match-sync: skipping {match_id}: {e}");
        st.outcomes
          .insert(match_id, Outcome::Asked(AttemptResult::Invalid));
        self.skip_answered(now, st)?;
        self.remember_fetched(match_id, st);
        return Ok(FetchStep::Done);
      }
      Err(MatchSyncError::GcRefused(refusal @ (GcRefusal::InFlight | GcRefusal::NoPermission)))
        if is_backfill || refusal == GcRefusal::InFlight =>
      {
        log::debug!("match-sync: skipping {match_id}: {refusal}");
        let result = match refusal {
          GcRefusal::InFlight => AttemptResult::InFlight,
          _ => AttemptResult::NoPermission,
        };
        st.outcomes.insert(match_id, Outcome::Asked(result));
        self.skip_answered(now, st)?;
        return Ok(FetchStep::Done);
      }
      Err(e) => {
        st.outcomes
          .insert(match_id, Outcome::Asked(AttemptResult::Failed));
        let e = e.refusal_as_outage();
        log::warn!("match-sync: GC fetch failed for {match_id}: {e}");
        self.persistence.record_gc_error(&e);
        return Ok(FetchStep::RetryLater);
      }
    };
    self.count_salts_request(now, st)?;

    let posted = self.sink.post_salts(&[SaltPayload::from(&salts)]).await;
    let result = match posted {
      Ok(()) => AttemptResult::Fetched,
      Err(_) => AttemptResult::Failed,
    };
    st.outcomes.insert(match_id, Outcome::Asked(result));
    posted?;
    self.remember_fetched(match_id, st);

    if is_backfill {
      st.progress.backfilled += 1;
    } else {
      st.progress.fetched += 1;
    }
    self.persistence.emit_progress(&st.progress);
    Ok(FetchStep::Done)
  }

  fn count_salts_request(&self, now: i64, st: &mut RunState) -> Result<(), MatchSyncError> {
    let _ = st.quota.try_consume(now);
    self.persistence.save_quota(QuotaKind::Salts, &st.quota)?;
    st.progress.quota_remaining = st.quota.remaining(now) as u32;
    Ok(())
  }

  fn skip_answered(&self, now: i64, st: &mut RunState) -> Result<(), MatchSyncError> {
    self.count_salts_request(now, st)?;
    st.progress.skipped += 1;
    self.persistence.emit_progress(&st.progress);
    Ok(())
  }

  async fn own_history_page(
    &self,
    ctx: &AuthContext,
    cursor: Option<u64>,
  ) -> Result<Option<MatchHistoryPage>, MatchSyncError> {
    let e = match self.gc_history_page(ctx, ctx.account_id(), cursor).await {
      Ok(page) => return Ok(Some(page)),
      Err(e) if e.ends_pass() => return Err(e),
      Err(e) => e.refusal_as_outage(),
    };
    log::warn!("match-sync: GC match history unavailable: {e}");
    self.persistence.record_gc_error(&e);
    if let MatchSyncError::GcRateLimited = e {
      let loaded = self.persistence.load_quota(QuotaKind::FriendHistory);
      if let Ok(Some(mut quota)) = best_effort(loaded, "friend history quota") {
        self.exhaust_history_quota(&mut quota);
      }
    }
    Ok(None)
  }

  fn remember_fetched(&self, match_id: u64, st: &mut RunState) {
    st.fetched_set.insert(match_id);
    st.fetched_order.push(match_id);
    self.persistence.persist_fetched(&st.fetched_order);
  }

  fn remember_stored(&self, ids: &[u64], st: &mut RunState) {
    if ids.is_empty() {
      return;
    }
    st.fetched_set.extend(ids);
    st.outcomes
      .extend(ids.iter().map(|&id| (id, Outcome::Done)));
    st.fetched_order.extend(ids);
    st.progress.skipped += ids.len() as u32;
    self.persistence.persist_fetched(&st.fetched_order);
    self.persistence.emit_progress(&st.progress);
  }

  async fn unstored_own_matches(
    &self,
    ids: Vec<u64>,
    cancel: &AtomicBool,
    st: &mut RunState,
  ) -> (Vec<u64>, bool) {
    let candidates: Vec<u64> = st
      .newest_first_fresh(ids)
      .into_iter()
      .filter(|id| !st.fetched_set.contains(id))
      .collect();
    let limit = st.quota.remaining(self.persistence.now());
    if candidates.is_empty() || limit == 0 {
      return (candidates, true);
    }
    let SaltsCheck { missing, stored } = self
      .backfill
      .missing_salts(&candidates, limit, cancel)
      .await;
    let checked_all = missing.len() + stored.len() == candidates.len();
    self.remember_stored(&stored, st);
    (missing, checked_all)
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

  async fn gc_call<T>(
    &self,
    request: impl Future<Output = Result<T, MatchSyncError>>,
  ) -> Result<T, MatchSyncError> {
    if self.game_check.is_game_running() {
      return Err(MatchSyncError::GameRunning);
    }
    request.await
  }

  async fn gc_history_page(
    &self,
    ctx: &AuthContext,
    account_id: u32,
    cursor: Option<u64>,
  ) -> Result<MatchHistoryPage, MatchSyncError> {
    self.throttle.acquire().await;
    self
      .gc_call(self.gc.fetch_match_history(ctx, account_id, cursor))
      .await
  }

  fn backfill_budget(
    &self,
    control: LoopControl,
    cancel: &AtomicBool,
    st: &RunState,
  ) -> Option<usize> {
    if matches!(control, LoopControl::Stop) || cancel.load(Ordering::Relaxed) {
      return None;
    }
    let budget = st
      .quota
      .remaining(self.persistence.now())
      .saturating_sub(BACKFILL_QUOTA_RESERVE);
    (budget > 0).then_some(budget)
  }

  fn account_list_due(&self) -> bool {
    let now = self.persistence.now();
    self
      .persistence
      .account_list_drained_at()
      .is_none_or(|at| now.saturating_sub(at) >= ACCOUNT_LIST_INTERVAL_SECS)
  }

  fn note_account_list(&self, ids: &[u64], st: &RunState) {
    let drained = ids.iter().all(|id| st.fetched_set.contains(id));
    self
      .persistence
      .set_account_list_drained_at(drained.then(|| self.persistence.now()));
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
    self.persistence.emit_progress(&st.progress);
    let result = self.full_sync_inner(cancel, &mut st).await;
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

    let mut cursor: Option<u64> = None;
    let mut history_complete = false;
    loop {
      if cancel.load(Ordering::Relaxed) {
        return Ok(());
      }
      let Some(page) = self.own_history_page(&ctx, cursor).await? else {
        break;
      };
      let (fresh, checked_all) = self
        .unstored_own_matches(page.match_ids(), cancel, st)
        .await;
      if let LoopControl::Stop = self
        .process_ids(&ctx, fresh, false, Some(cancel), st)
        .await?
      {
        return Ok(());
      }
      let quota_spent = st.quota.remaining(self.persistence.now()) == 0;
      if quota_spent && (!checked_all || page.next_cursor.is_some()) {
        st.progress.quota_reached = true;
        st.progress.quota_remaining = 0;
        return Ok(());
      }
      if !checked_all {
        break;
      }
      match page.next_cursor {
        Some(next) => cursor = Some(next),
        None => {
          history_complete = true;
          break;
        }
      }
    }

    loop {
      if cancel.load(Ordering::Relaxed) {
        return Ok(());
      }
      let ids = self
        .backfill
        .to_fetch(FetchScope::Account(account_id))
        .await?;
      self.note_account_list(&ids, st);
      let fresh = st.newest_first_fresh(ids);
      if fresh.is_empty() {
        if history_complete {
          self.persistence.set_full_sync_complete(true);
        }
        return Ok(());
      }
      if let LoopControl::Stop = self
        .process_ids(&ctx, fresh, false, Some(cancel), st)
        .await?
      {
        return Ok(());
      }
    }
  }

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
    self.persistence.emit_progress(&st.progress);
    let result = self.run_background_inner(cancel, &mut st).await;
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

    let history = self
      .own_history_page(&ctx, None)
      .await?
      .map(|page| page.match_ids())
      .unwrap_or_default();
    let (mut own_ids, _) = self.unstored_own_matches(history, cancel, st).await;
    if self.account_list_due() {
      let account_list = self
        .backfill
        .to_fetch(FetchScope::Account(account_id))
        .await;
      if let Some(ids) = best_effort(account_list, "account to-fetch")? {
        self.note_account_list(&ids, st);
        own_ids.extend(ids);
      }
    }
    let own = st.newest_first_fresh(own_ids);
    let control = self.process_ids(&ctx, own, false, Some(cancel), st).await?;

    let Some(budget) = self.backfill_budget(control, cancel, st) else {
      return Ok(());
    };
    let control = self.backfill_friends(&ctx, budget, cancel, st).await?;

    let Some(budget) = self.backfill_budget(control, cancel, st) else {
      return Ok(());
    };
    self.backfill_global(&ctx, budget, cancel, st).await
  }

  async fn backfill_global(
    &self,
    ctx: &AuthContext,
    budget: usize,
    cancel: &AtomicBool,
    st: &mut RunState,
  ) -> Result<(), MatchSyncError> {
    let global = match self.backfill.to_fetch(FetchScope::Global(budget)).await {
      Ok(global) => global,
      Err(e) => {
        log::warn!("match-sync: global to-fetch unavailable: {e}");
        Vec::new()
      }
    };
    let mut picks = st.newest_first_fresh(global.clone());
    picks.truncate(budget);
    let result = self.process_ids(ctx, picks, true, Some(cancel), st).await;
    self
      .backfill
      .release_claim(&st.release_report(&global))
      .await;
    result.map(|_| ())
  }
}

#[cfg(test)]
mod tests;
