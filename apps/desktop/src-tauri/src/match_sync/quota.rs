//! Rolling-window fetch quota — the hard cap on Steam GC match-salt fetches.
//! Pure and clock-injected so it unit-tests without a store or real clock;
//! persistence lives in [`super::settings`].

#[derive(Debug, Clone)]
pub struct QuotaWindow {
  hits: Vec<i64>,
  limit: usize,
  window_secs: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct QuotaExhausted {
  pub limit: usize,
  pub retry_after_secs: i64,
}

impl QuotaWindow {
  pub fn new(hits: Vec<i64>, limit: usize, window_secs: i64) -> Self {
    Self {
      hits,
      limit,
      window_secs,
    }
  }

  fn prune(&mut self, now: i64) {
    let cutoff = now - self.window_secs;
    self.hits.retain(|&t| t > cutoff);
  }

  pub fn remaining(&self, now: i64) -> usize {
    let cutoff = now - self.window_secs;
    let used = self.hits.iter().filter(|&&t| t > cutoff).count();
    self.limit.saturating_sub(used)
  }

  pub fn reset_at(&self, now: i64) -> Option<i64> {
    if self.remaining(now) > 0 {
      return None;
    }
    let cutoff = now - self.window_secs;
    self
      .hits
      .iter()
      .filter(|&&t| t > cutoff)
      .min()
      .map(|&oldest| oldest + self.window_secs)
  }

  // On success records `now`; caller must persist snapshot(). Nothing mutates on failure.
  pub fn try_consume(&mut self, now: i64) -> Result<(), QuotaExhausted> {
    self.prune(now);
    if self.hits.len() >= self.limit {
      let oldest = self.hits.iter().min().copied().unwrap_or(now);
      let retry_after_secs = (oldest + self.window_secs - now).max(1);
      return Err(QuotaExhausted {
        limit: self.limit,
        retry_after_secs,
      });
    }
    self.hits.push(now);
    Ok(())
  }

  pub fn snapshot(&self) -> Vec<i64> {
    self.hits.clone()
  }

  // Marks the whole window as consumed as of `now` (e.g. Steam itself rate-limited
  // us): remaining(now) becomes 0 and capacity frees up 24h from `now`, same as if
  // all `limit` requests had genuinely succeeded right now.
  pub fn exhaust(&mut self, now: i64) {
    self.prune(now);
    let needed = self.limit.saturating_sub(self.hits.len());
    self.hits.extend(std::iter::repeat_n(now, needed));
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const LIMIT: usize = 40;
  const WINDOW: i64 = 24 * 60 * 60;

  fn window() -> QuotaWindow {
    QuotaWindow::new(Vec::new(), LIMIT, WINDOW)
  }

  #[test]
  fn allows_up_to_limit_then_blocks() {
    let mut q = window();
    let now = 1_000_000;
    for _ in 0..LIMIT {
      assert!(q.try_consume(now).is_ok());
    }
    assert_eq!(q.remaining(now), 0);
    let err = q.try_consume(now).unwrap_err();
    assert_eq!(err.limit, LIMIT);
    // The 71st fetch must wait a full window since all hits share `now`.
    assert_eq!(err.retry_after_secs, WINDOW);
  }

  #[test]
  fn frees_capacity_as_hits_age_out() {
    let mut q = window();
    let start = 1_000_000;
    for _ in 0..LIMIT {
      q.try_consume(start).unwrap();
    }
    // Still blocked one second before the window elapses.
    assert!(q.try_consume(start + WINDOW - 1).is_err());
    // Exactly one slot frees up the moment the oldest ages out.
    let later = start + WINDOW + 1;
    assert_eq!(q.remaining(later), LIMIT);
    assert!(q.try_consume(later).is_ok());
  }

  #[test]
  fn reset_at_reports_next_free_slot() {
    let mut q = window();
    let now = 500;
    for _ in 0..LIMIT {
      q.try_consume(now).unwrap();
    }
    assert_eq!(q.reset_at(now), Some(now + WINDOW));
    // Not full -> no reset time.
    let mut q2 = window();
    q2.try_consume(now).unwrap();
    assert_eq!(q2.reset_at(now), None);
  }

  #[test]
  fn snapshot_is_pruned_after_consume() {
    let mut q = QuotaWindow::new(vec![1, 2, 3], LIMIT, WINDOW);
    // A consume far in the future prunes the ancient entries.
    q.try_consume(WINDOW + 100).unwrap();
    assert_eq!(q.snapshot(), vec![WINDOW + 100]);
  }

  #[test]
  fn exhaust_blocks_for_a_full_window_from_now() {
    let mut q = window();
    let now = 1_000_000;
    q.try_consume(now).unwrap();
    q.exhaust(now);
    assert_eq!(q.remaining(now), 0);
    assert_eq!(q.snapshot().len(), LIMIT);
    assert_eq!(q.reset_at(now), Some(now + WINDOW));
    // Blocked right up until the window elapses from the moment of exhaustion.
    assert_eq!(q.remaining(now + WINDOW - 1), 0);
    assert_eq!(q.remaining(now + WINDOW + 1), LIMIT);
  }
}
