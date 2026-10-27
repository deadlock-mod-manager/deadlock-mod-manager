//! The background pass's friend step: the newest history page of the Steam friends who
//! most likely played since deadlock-api last saw them, then the salts of their new
//! matches. Best-effort throughout: a failure means fewer (or no) friends looked up, never
//! a failed pass, and never a backoff for the account.

use std::sync::atomic::{AtomicBool, Ordering};

use super::{LoopControl, RunState, SyncEngine, best_effort, newest_first_fresh};
use crate::match_sync::api_client::{BackfillSource, SaltsSink};
use crate::match_sync::auth::SteamAuthProvider;
use crate::match_sync::error::{GcRefusal, MatchSyncError};
use crate::match_sync::friends;
use crate::match_sync::game_check::GameRunningCheck;
use crate::match_sync::gc_client::GcMatchClient;
use crate::match_sync::model::{
  ActiveFriend, AuthContext, FRIEND_COOLDOWN_SECS, MAX_FRIEND_HISTORIES_PER_PASS,
  PRIVATE_FRIEND_COOLDOWN_SECS, QuotaKind, SaltsCheck, UNFINISHED_FRIEND_COOLDOWN_SECS,
};
use crate::match_sync::quota::QuotaWindow;
use crate::match_sync::sync::SyncPersistence;

// One friend's history lookup: the matches it turned up, and how long the friend is left
// alone once those are dealt with.
struct FriendLookup {
  account_id: u32,
  cooldown_secs: i64,
  match_ids: Vec<u64>,
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
  // Friends' likely-new matches, within `budget` salt fetches.
  pub(super) async fn backfill_friends(
    &self,
    ctx: &AuthContext,
    budget: usize,
    cancel: &AtomicBool,
    st: &mut RunState,
  ) -> Result<LoopControl, MatchSyncError> {
    let lookups = self.look_up_friends(ctx, budget, cancel).await?;
    self
      .backfill_friend_matches(ctx, &lookups, budget, cancel, st)
      .await
  }

  // Steam rate-limited this account's match history requests: no friend lookups until the
  // 24h window frees up.
  pub(super) fn exhaust_history_quota(&self, quota: &mut QuotaWindow) {
    quota.exhaust(self.persistence.now());
    if let Err(e) = self.persistence.save_quota(QuotaKind::FriendHistory, quota) {
      log::warn!("match-sync: {e}");
    }
  }

  async fn look_up_friends(
    &self,
    ctx: &AuthContext,
    salt_budget: usize,
    cancel: &AtomicBool,
  ) -> Result<Vec<FriendLookup>, MatchSyncError> {
    let now = self.persistence.now();
    let loaded = self.persistence.load_quota(QuotaKind::FriendHistory);
    let Some(mut history_quota) = best_effort(loaded, "friend history quota")? else {
      return Ok(Vec::new());
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
          Err(MatchSyncError::GcRefused(GcRefusal::NoPermission)) => {
            (PRIVATE_FRIEND_COOLDOWN_SECS, Vec::new())
          }
          Err(e @ MatchSyncError::GcRefused(_)) => {
            log::warn!("match-sync: a friend's match history is unavailable: {e}");
            (FRIEND_COOLDOWN_SECS, Vec::new())
          }
          Err(MatchSyncError::GameRunning) => return Err(MatchSyncError::GameRunning),
          Err(MatchSyncError::GcRateLimited) => {
            log::warn!("match-sync: Steam GC rate-limited friend history lookups");
            self.exhaust_history_quota(&mut history_quota);
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
      if let Err(e) = self
        .persistence
        .save_quota(QuotaKind::FriendHistory, &history_quota)
      {
        log::warn!("match-sync: {e}");
        break;
      }
    }
    Ok(lookups)
  }

  // Up to `budget` friends, most likely first, who played since deadlock-api last saw
  // them.
  async fn friends_to_look_up(
    &self,
    ctx: &AuthContext,
    now: i64,
    budget: usize,
  ) -> Result<Vec<ActiveFriend>, MatchSyncError> {
    let listed = self.gc_call(self.gc.friend_ids(ctx)).await;
    let Some(friend_ids) = best_effort(listed, "friends list")? else {
      return Ok(Vec::new());
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
    let active = best_effort(self.backfill.active_friends(&due).await, "friend activity")?;
    let Some(active) = active.filter(|active| !active.is_empty()) else {
      return Ok(Vec::new());
    };
    // Only the few active friends are worth Steam's persona round-trip.
    let ids: Vec<u32> = active.iter().map(|f| f.account_id).collect();
    let personas = self
      .gc_call(async { Ok(self.gc.personas(ctx, &ids).await) })
      .await?;
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
}
