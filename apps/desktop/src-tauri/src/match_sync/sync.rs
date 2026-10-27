//! Sync orchestration. Generic over its dependencies so the whole pipeline is
//! unit-testable with spies. All GC fetches funnel through `fetch_one`, the single
//! choke point that enforces: already-fetched skip → persisted quota → throttle →
//! counter. `*_if_enabled` are the enabled/consent gate.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use super::api_client::{BackfillSource, SaltsSink};
use super::auth::SteamAuthProvider;
use super::error::MatchSyncError;
use super::friends;
use super::game_check::GameRunningCheck;
use super::gc_client::GcMatchClient;
use super::model::{
  ActiveFriend, AuthContext, BACKFILL_QUOTA_RESERVE, FRIEND_COOLDOWN_SECS, FetchScope,
  MAX_FRIEND_HISTORIES_PER_PASS, MatchHistoryPage, MatchSyncConfig, PRIVATE_FRIEND_COOLDOWN_SECS,
  SaltPayload, SaltsCheck, SyncProgress, UNFINISHED_FRIEND_COOLDOWN_SECS,
};
use super::quota::QuotaWindow;
use super::throttle::Throttle;

pub trait SyncPersistence: Send + Sync {
  fn now(&self) -> i64;
  fn load_quota(&self) -> Result<QuotaWindow, MatchSyncError>;
  fn save_quota(&self, quota: &QuotaWindow) -> Result<(), MatchSyncError>;
  fn load_history_quota(&self) -> Result<QuotaWindow, MatchSyncError>;
  fn save_history_quota(&self, quota: &QuotaWindow) -> Result<(), MatchSyncError>;
  fn friend_cooldowns(&self) -> HashMap<u32, i64>;
  // (friend account id, unix time before which they aren't looked up again)
  fn set_friend_cooldowns(&self, cooldowns: &[(u32, i64)]);
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

// One friend's history lookup: the matches it turned up, and how long the friend is left
// alone once those are dealt with.
struct FriendLookup {
  account_id: u32,
  cooldown_secs: i64,
  match_ids: Vec<u64>,
}

struct RunState {
  // Persisted ids that need no more fetching: ingested, or refused by the GC for good
  // (idempotency across runs + quota protection).
  fetched_set: HashSet<u64>,
  // Every id acted on this run (incl. failures/skips) so a sticky to-fetch list or a
  // failing GC can't re-offer the same id and spin/burn quota.
  processed: HashSet<u64>,
  fetched_order: Vec<u64>,
  // Ids no salts fetch can get this run: deadlock-api already stores their salts, or they
  // are still in progress.
  settled: HashSet<u64>,
  quota: QuotaWindow,
  progress: SyncProgress,
}

fn newest_first_fresh(ids: Vec<u64>, processed: &HashSet<u64>) -> Vec<u64> {
  let mut ids: Vec<u64> = ids
    .into_iter()
    .filter(|id| !processed.contains(id))
    .collect();
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
      settled: HashSet::new(),
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
    // The 24h cap counts every salts request the GC answers; check headroom before asking.
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
      // The account can always see its own matches, so refusing one means the GC won't
      // serve the account at all: an outage, not an answer about the match.
      Err(MatchSyncError::MatchForbidden) if !is_backfill => {
        let e = MatchSyncError::GcUnavailable(format!("own match {match_id} refused"));
        log::warn!("match-sync: {e}");
        self.persistence.record_gc_error(&e);
        return Ok(FetchStep::RetryLater);
      }
      // Refused for good: remembered like a fetched match, so no later pass pays to ask
      // again. Carry on with the next match.
      Err(e @ MatchSyncError::MatchRefused(_)) => {
        log::debug!("match-sync: skipping {match_id}: {e}");
        self.skip_answered(now, st)?;
        self.remember_fetched(match_id, st);
        return Ok(FetchStep::Done);
      }
      // Still in progress, or someone else's match this account may not see: settled for
      // this run only. A later pass that lists it again (the user's history, a to-fetch
      // list, the friend's next lookup) asks again.
      Err(e @ (MatchSyncError::MatchInFlight | MatchSyncError::MatchForbidden)) => {
        log::debug!("match-sync: skipping {match_id}: {e}");
        self.skip_answered(now, st)?;
        st.settled.insert(match_id);
        return Ok(FetchStep::Done);
      }
      // Any other failure fetched nothing, so it must not count against the cap.
      Err(e) => {
        log::warn!("match-sync: GC fetch failed for {match_id}: {e}");
        self.persistence.record_gc_error(&e);
        return Ok(FetchStep::RetryLater);
      }
    };
    self.count_salts_request(now, st)?;

    self.sink.post_salts(&[SaltPayload::from(&salts)]).await?;
    self.remember_fetched(match_id, st);

    if is_backfill {
      st.progress.backfilled += 1;
    } else {
      st.progress.fetched += 1;
    }
    self.persistence.emit_progress(&st.progress);
    Ok(FetchStep::Done)
  }

  // The GC answered, so the request counts against the cap.
  fn count_salts_request(&self, now: i64, st: &mut RunState) -> Result<(), MatchSyncError> {
    let _ = st.quota.try_consume(now);
    self.persistence.save_quota(&st.quota)?;
    st.progress.quota_remaining = st.quota.remaining(now) as u32;
    Ok(())
  }

  // A GC answer that leaves nothing to fetch still counts against the cap.
  fn skip_answered(&self, now: i64, st: &mut RunState) -> Result<(), MatchSyncError> {
    self.count_salts_request(now, st)?;
    st.progress.skipped += 1;
    self.persistence.emit_progress(&st.progress);
    Ok(())
  }

  // A swallowed failure of the user's own history page. Steam limits match history
  // requests per account, so a rate limit here rules out friend lookups until the
  // window frees up as well.
  fn own_history_failed(&self, e: &MatchSyncError) {
    log::warn!("match-sync: GC match history unavailable: {e}");
    self.persistence.record_gc_error(e);
    if let MatchSyncError::GcRateLimited = e {
      match self.persistence.load_history_quota() {
        Ok(mut quota) => {
          quota.exhaust(self.persistence.now());
          if let Err(e) = self.persistence.save_history_quota(&quota) {
            log::warn!("match-sync: {e}");
          }
        }
        Err(e) => log::warn!("match-sync: friend history quota unavailable: {e}"),
      }
    }
  }

  fn remember_fetched(&self, match_id: u64, st: &mut RunState) {
    st.fetched_set.insert(match_id);
    st.fetched_order.push(match_id);
    self.persistence.persist_fetched(&st.fetched_order);
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
    account_id: u32,
    cursor: Option<u64>,
  ) -> Result<MatchHistoryPage, MatchSyncError> {
    self.throttle.acquire().await;
    // Checked after the throttle wait, not before: the game may launch during the sleep.
    if self.game_check.is_game_running() {
      return Err(MatchSyncError::GameRunning);
    }
    self.gc.fetch_match_history(ctx, account_id, cursor).await
  }

  // What's left for backfill, or `None` once the pass should stop. Keeps a reserve
  // untouched so the user's own matches — always fetched first, and not subject to this
  // cap — retain headroom against a bottomless backfill.
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

  // The newest history page of the friends who most likely played since deadlock-api
  // last saw them. Best-effort: any failure just yields fewer (or no) lookups; only
  // `GameRunning` is an error. Never backs off the account: friend lookups are extra,
  // and a broken connection fails the GC calls that follow them anyway.
  async fn look_up_friends(
    &self,
    ctx: &AuthContext,
    salt_budget: usize,
    cancel: &AtomicBool,
  ) -> Result<Vec<FriendLookup>, MatchSyncError> {
    // Reading the friends list may (re)connect to the GC, which must never race the game.
    if self.game_check.is_game_running() {
      return Err(MatchSyncError::GameRunning);
    }
    let now = self.persistence.now();
    let mut history_quota = match self.persistence.load_history_quota() {
      Ok(quota) => quota,
      Err(e) => {
        log::warn!("match-sync: friend history quota unavailable: {e}");
        return Ok(Vec::new());
      }
    };
    let budget = history_quota
      .remaining(now)
      .min(MAX_FRIEND_HISTORIES_PER_PASS)
      .min(salt_budget);
    if budget == 0 {
      return Ok(Vec::new());
    }

    let mut lookups = Vec::new();
    for friend in self.friends_to_look_up(ctx, now, budget).await? {
      if cancel.load(Ordering::Relaxed) {
        break;
      }
      let (cooldown_secs, match_ids) =
        match self.gc_history_page(ctx, friend.account_id, None).await {
          Ok(page) => (FRIEND_COOLDOWN_SECS, page.match_ids()),
          Err(MatchSyncError::HistoryPrivate) => (PRIVATE_FRIEND_COOLDOWN_SECS, Vec::new()),
          Err(e @ MatchSyncError::HistoryRefused(_)) => {
            log::warn!("match-sync: a friend's match history is unavailable: {e}");
            (FRIEND_COOLDOWN_SECS, Vec::new())
          }
          Err(MatchSyncError::GameRunning) => return Err(MatchSyncError::GameRunning),
          Err(MatchSyncError::GcRateLimited) => {
            log::warn!("match-sync: Steam GC rate-limited friend history lookups");
            history_quota.exhaust(self.persistence.now());
            if let Err(e) = self.persistence.save_history_quota(&history_quota) {
              log::warn!("match-sync: {e}");
            }
            break;
          }
          // No answer (connection lost, timed out): stop instead of reconnecting for every
          // remaining friend. Not charged, since the quota stays far below Steam's limit.
          Err(e) => {
            log::warn!("match-sync: friend history lookups stopped: {e}");
            break;
          }
        };
      // The GC answered, so Steam counted the request.
      let _ = history_quota.try_consume(self.persistence.now());
      lookups.push(FriendLookup {
        account_id: friend.account_id,
        cooldown_secs,
        match_ids,
      });
      if let Err(e) = self.persistence.save_history_quota(&history_quota) {
        log::warn!("match-sync: {e}");
        break;
      }
    }
    Ok(lookups)
  }

  // Fetches the friends' matches deadlock-api has no salts for, then cools the friends
  // down. One whose matches the budget, a quota or an error cut off only gets a short
  // cooldown, so the rest turn up again soon.
  async fn backfill_friend_matches(
    &self,
    ctx: &AuthContext,
    lookups: &[FriendLookup],
    budget: usize,
    cancel: &AtomicBool,
    st: &mut RunState,
  ) -> Result<LoopControl, MatchSyncError> {
    let found = lookups
      .iter()
      .flat_map(|lookup| &lookup.match_ids)
      .copied()
      .filter(|id| !st.fetched_set.contains(id))
      .collect();
    let candidates = newest_first_fresh(found, &st.processed);
    let SaltsCheck { missing, stored } = self
      .backfill
      .missing_salts(&candidates, budget, cancel)
      .await;
    st.settled.extend(stored);
    let result = self.process_ids(ctx, missing, true, Some(cancel), st).await;

    // Dealt with means fetched or settled; a fetch that failed or never ran is not.
    let now = self.persistence.now();
    let cooldowns: Vec<(u32, i64)> = lookups
      .iter()
      .map(|lookup| {
        let dealt_with = lookup
          .match_ids
          .iter()
          .all(|id| st.fetched_set.contains(id) || st.settled.contains(id));
        let cooldown = if dealt_with {
          lookup.cooldown_secs
        } else {
          UNFINISHED_FRIEND_COOLDOWN_SECS
        };
        (lookup.account_id, now + cooldown)
      })
      .collect();
    if !cooldowns.is_empty() {
      self.persistence.set_friend_cooldowns(&cooldowns);
    }
    result
  }

  // Up to `budget` friends, most likely first, who played since deadlock-api last saw
  // them. Best-effort: any failure just yields fewer (or none); only `GameRunning` is an
  // error.
  async fn friends_to_look_up(
    &self,
    ctx: &AuthContext,
    now: i64,
    budget: usize,
  ) -> Result<Vec<ActiveFriend>, MatchSyncError> {
    let friend_ids = match self.gc.friend_ids(ctx).await {
      Ok(ids) => ids,
      Err(MatchSyncError::GameRunning) => return Err(MatchSyncError::GameRunning),
      Err(e) => {
        log::warn!("match-sync: friends list unavailable: {e}");
        return Ok(Vec::new());
      }
    };
    let cooldowns = self.persistence.friend_cooldowns();
    let due: Vec<u32> = friend_ids
      .iter()
      .copied()
      .filter(|id| cooldowns.get(id).is_none_or(|&until| until <= now))
      .collect();
    if due.is_empty() {
      return Ok(Vec::new());
    }
    let active = match self.backfill.active_friends(&due).await {
      Ok(active) => active,
      Err(e) => {
        log::warn!("match-sync: friend activity unavailable: {e}");
        return Ok(Vec::new());
      }
    };
    if active.is_empty() {
      return Ok(Vec::new());
    }
    // Reading their activity took a while, and the persona request may (re)connect to the
    // GC, which must never race the game.
    if self.game_check.is_game_running() {
      return Err(MatchSyncError::GameRunning);
    }
    // Only the few active friends are worth Steam's persona round-trip.
    let ids: Vec<u32> = active.iter().map(|f| f.account_id).collect();
    let personas = self.gc.personas(ctx, &ids).await;
    let active_count = active.len();
    let scored = active
      .into_iter()
      .filter_map(|f| {
        let persona = personas.get(&f.account_id).copied();
        friends::estimate(now, f.last_end, &f.starts, persona).map(|score| (f, score))
      })
      .collect();
    let picks = friends::pick(scored, budget);
    log::info!(
      "match-sync: {} friend(s), {active_count} recently active, {} likely with new matches",
      friend_ids.len(),
      picks.len()
    );
    Ok(picks)
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
      let page = match self.gc_history_page(&ctx, account_id, cursor).await {
        Ok(page) => page,
        Err(MatchSyncError::GameRunning) => return Err(MatchSyncError::GameRunning),
        Err(e) => {
          self.own_history_failed(&e);
          break;
        }
      };
      let fresh = newest_first_fresh(page.match_ids(), &st.processed);
      if let LoopControl::Stop = self
        .process_ids(&ctx, fresh, false, Some(cancel), st)
        .await?
      {
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
      let ids = self
        .backfill
        .to_fetch(FetchScope::Account(account_id))
        .await?;
      let fresh = newest_first_fresh(ids, &st.processed);
      if fresh.is_empty() {
        // Only the account's own matches were walked here; the Steam history walk
        // must have finished too, or this isn't really "caught up" yet.
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

  // One background pass: the user's own new matches, then friends' likely-new matches,
  // then global backfill, all bounded by the shared 24h quota. A no-op unless the user
  // has opted in, or while Deadlock is running (Steam routes GC traffic to the game's
  // own pipe).
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
    let mut own_ids = match self.gc_history_page(&ctx, account_id, None).await {
      Ok(page) => page.match_ids(),
      Err(MatchSyncError::GameRunning) => return Err(MatchSyncError::GameRunning),
      Err(e) => {
        self.own_history_failed(&e);
        Vec::new()
      }
    };
    match self
      .backfill
      .to_fetch(FetchScope::Account(account_id))
      .await
    {
      Ok(ids) => own_ids.extend(ids),
      Err(e) => log::warn!("match-sync: account to-fetch unavailable: {e}"),
    }
    let own = newest_first_fresh(own_ids, &st.processed);
    let control = self.process_ids(&ctx, own, false, Some(cancel), st).await?;

    // Backfill missing matches with whatever of the 24h quota is left over, fully in
    // the background. The user's own matches always go first, then friends' likely-new
    // matches, then deadlock-api's global list.
    let Some(budget) = self.backfill_budget(control, cancel, st) else {
      return Ok(());
    };
    let lookups = self.look_up_friends(&ctx, budget, cancel).await?;
    let control = self
      .backfill_friend_matches(&ctx, &lookups, budget, cancel, st)
      .await?;

    let Some(budget) = self.backfill_budget(control, cancel, st) else {
      return Ok(());
    };
    let result = match self.backfill.to_fetch(FetchScope::Global).await {
      Ok(global) => {
        let mut picks = newest_first_fresh(global, &st.processed);
        picks.truncate(budget);
        self
          .process_ids(&ctx, picks, true, Some(cancel), st)
          .await
          .map(|_| ())
      }
      Err(e) => {
        log::warn!("match-sync: global to-fetch unavailable: {e}");
        Ok(())
      }
    };
    // The global list claims every id it hands out, but the budget, a quota or GC
    // stop, cancellation or an error usually leaves most of it unfetched. However the
    // backfill ended, hand the rest back to other workers now rather than when the
    // claims expire.
    self.backfill.release_claim().await;
    result
  }
}

#[cfg(test)]
mod tests;
