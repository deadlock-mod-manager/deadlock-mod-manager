//! How many download requests the app has open at once. Segmented downloads
//! open four connections per file and the manager starts every file of a mod
//! together, so while they're on, every request the download engine sends
//! waits for room here. While they're off nothing waits: the counts are kept,
//! so the caps apply from the moment the setting is turned on.

use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex, MutexGuard, PoisonError};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

/// Requests open at once across the app.
pub const GLOBAL_LIMIT: usize = 8;
/// Requests open at once to one server, the four a segmented file uses.
pub const ORIGIN_LIMIT: usize = 4;

#[derive(Default)]
struct Counts {
  segmented_enabled: bool,
  /// Segmented downloads still running, which keep the caps on after the
  /// setting is turned off.
  opted_in: usize,
  global: usize,
  per_origin: HashMap<String, usize>,
}

impl Counts {
  fn enforced(&self) -> bool {
    self.segmented_enabled || self.opted_in > 0
  }

  fn has_room(&self, origin: &str) -> bool {
    self.global < GLOBAL_LIMIT && self.per_origin.get(origin).copied().unwrap_or(0) < ORIGIN_LIMIT
  }

  fn release_origin(&mut self, origin: &str) {
    if let Some(count) = self.per_origin.get_mut(origin) {
      *count -= 1;
      if *count == 0 {
        self.per_origin.remove(origin);
      }
    }
  }
}

#[derive(Default)]
pub struct TransferBudget {
  counts: Mutex<Counts>,
  released: Notify,
}

static APP_BUDGET: LazyLock<Arc<TransferBudget>> = LazyLock::new(Arc::default);

/// The budget every download in the app shares.
pub fn app_budget() -> Arc<TransferBudget> {
  Arc::clone(&APP_BUDGET)
}

/// The `scheme://host:port` a request is counted against.
pub fn origin_of(url: &str) -> String {
  reqwest::Url::parse(url)
    .map(|url| url.origin().ascii_serialization())
    .unwrap_or_default()
}

impl TransferBudget {
  fn counts(&self) -> MutexGuard<'_, Counts> {
    self.counts.lock().unwrap_or_else(PoisonError::into_inner)
  }

  pub fn set_segmented_enabled(&self, enabled: bool) {
    self.counts().segmented_enabled = enabled;
    self.released.notify_waiters();
  }

  pub fn segmented_enabled(&self) -> bool {
    self.counts().segmented_enabled
  }

  /// Held for the whole of a segmented download, fallback included.
  pub fn opt_in(self: &Arc<Self>) -> OptIn {
    self.counts().opted_in += 1;
    OptIn {
      budget: Arc::clone(self),
    }
  }

  /// Waits for room for one request to `origin`. `None` if `cancel_token`
  /// fires first.
  pub async fn admit(
    self: &Arc<Self>,
    origin: &str,
    cancel_token: &CancellationToken,
  ) -> Option<Admission> {
    loop {
      // Registered before the counts are read, so a release in between still wakes us.
      let released = self.released.notified();
      tokio::pin!(released);
      released.as_mut().enable();
      {
        let mut counts = self.counts();
        if !counts.enforced() || counts.has_room(origin) {
          counts.global += 1;
          *counts.per_origin.entry(origin.to_string()).or_default() += 1;
          return Some(Admission {
            budget: Arc::clone(self),
            origin: origin.to_string(),
          });
        }
      }
      tokio::select! {
        () = released => {}
        () = cancel_token.cancelled() => return None,
      }
    }
  }
}

/// One open request; dropping it makes room for the next.
pub struct Admission {
  budget: Arc<TransferBudget>,
  origin: String,
}

impl Admission {
  /// Counts the request against `origin` instead, once a redirect has shown
  /// which server it reached. `false` when that server is full: the caller
  /// should close the response and wait its turn.
  pub fn retarget(&mut self, origin: &str) -> bool {
    if origin == self.origin {
      return true;
    }
    {
      let mut counts = self.budget.counts();
      if counts.enforced() && counts.per_origin.get(origin).copied().unwrap_or(0) >= ORIGIN_LIMIT {
        return false;
      }
      counts.release_origin(&self.origin);
      *counts.per_origin.entry(origin.to_string()).or_default() += 1;
    }
    self.origin = origin.to_string();
    self.budget.released.notify_waiters();
    true
  }
}

impl Drop for Admission {
  fn drop(&mut self) {
    {
      let mut counts = self.budget.counts();
      counts.global -= 1;
      counts.release_origin(&self.origin);
    }
    self.budget.released.notify_waiters();
  }
}

pub struct OptIn {
  budget: Arc<TransferBudget>,
}

impl Drop for OptIn {
  fn drop(&mut self) {
    self.budget.counts().opted_in -= 1;
    self.budget.released.notify_waiters();
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::Duration;

  async fn admits_within(budget: &Arc<TransferBudget>, origin: &str) -> Option<Admission> {
    tokio::time::timeout(
      Duration::from_millis(50),
      budget.admit(origin, &CancellationToken::new()),
    )
    .await
    .ok()
    .flatten()
  }

  fn enabled() -> Arc<TransferBudget> {
    let budget = Arc::new(TransferBudget::default());
    budget.set_segmented_enabled(true);
    budget
  }

  #[tokio::test]
  async fn one_server_gets_at_most_four_requests() {
    let budget = enabled();
    let mut held = Vec::new();
    for _ in 0..ORIGIN_LIMIT {
      held.push(
        admits_within(&budget, "https://filecache31.gamebanana.com")
          .await
          .unwrap(),
      );
    }
    assert!(
      admits_within(&budget, "https://filecache31.gamebanana.com")
        .await
        .is_none(),
      "a fifth connection to the same file server"
    );
    held.pop();
    assert!(
      admits_within(&budget, "https://filecache31.gamebanana.com")
        .await
        .is_some()
    );
  }

  #[tokio::test]
  async fn a_redirected_request_counts_against_the_server_it_reached() {
    let budget = enabled();
    let node = "https://filecache31.gamebanana.com";
    let mut held = Vec::new();
    for _ in 0..ORIGIN_LIMIT {
      held.push(admits_within(&budget, node).await.unwrap());
    }
    let mut redirected = admits_within(&budget, "https://gamebanana.com")
      .await
      .unwrap();
    assert!(
      !redirected.retarget(node),
      "a fifth connection to the file server, counted against the address it was asked for"
    );
    held.pop();
    assert!(redirected.retarget(node));
    assert!(
      admits_within(&budget, node).await.is_none(),
      "the moved request no longer counts towards its file server"
    );
    // The address it was asked for has its place back.
    let others: Vec<_> = futures::future::join_all(
      (0..ORIGIN_LIMIT).map(|_| admits_within(&budget, "https://gamebanana.com")),
    )
    .await;
    assert!(others.iter().all(Option::is_some));
  }

  #[tokio::test]
  async fn the_app_gets_at_most_eight_requests() {
    let budget = enabled();
    let mut held = Vec::new();
    for server in ["https://a.test", "https://b.test"] {
      for _ in 0..ORIGIN_LIMIT {
        held.push(admits_within(&budget, server).await.unwrap());
      }
    }
    assert!(
      admits_within(&budget, "https://c.test").await.is_none(),
      "a ninth connection across the app"
    );
  }

  #[tokio::test]
  async fn nothing_waits_while_segmented_downloads_are_off() {
    let budget = Arc::new(TransferBudget::default());
    let mut held = Vec::new();
    for _ in 0..30 {
      held.push(
        admits_within(&budget, "https://gamebanana.com")
          .await
          .expect("a download waited although the setting is off"),
      );
    }
    // Turning it on doesn't drop them, but new requests wait until there's room.
    budget.set_segmented_enabled(true);
    assert!(admits_within(&budget, "https://other.test").await.is_none());
    held.truncate(GLOBAL_LIMIT - 1);
    assert!(admits_within(&budget, "https://other.test").await.is_some());
  }

  #[tokio::test]
  async fn turning_the_setting_off_keeps_the_caps_until_running_downloads_end() {
    let budget = enabled();
    let opted_in = budget.opt_in();
    let held: Vec<_> = futures::future::join_all(
      (0..ORIGIN_LIMIT).map(|_| admits_within(&budget, "https://a.test")),
    )
    .await;
    budget.set_segmented_enabled(false);

    assert!(
      admits_within(&budget, "https://a.test").await.is_none(),
      "the segmented download still running lost its cap"
    );
    let waiting = tokio::spawn({
      let budget = Arc::clone(&budget);
      async move {
        budget
          .admit("https://a.test", &CancellationToken::new())
          .await
          .is_some()
      }
    });
    drop(opted_in);
    assert!(
      tokio::time::timeout(Duration::from_secs(1), waiting)
        .await
        .unwrap()
        .unwrap()
    );
    drop(held);
  }

  #[tokio::test]
  async fn a_waiting_request_wakes_when_another_ends_or_is_cancelled() {
    let budget = enabled();
    let mut held = Vec::new();
    for _ in 0..ORIGIN_LIMIT {
      held.push(admits_within(&budget, "https://a.test").await.unwrap());
    }
    let cancel_token = CancellationToken::new();
    let cancelled = tokio::spawn({
      let budget = Arc::clone(&budget);
      let cancel_token = cancel_token.clone();
      async move {
        budget
          .admit("https://a.test", &cancel_token)
          .await
          .is_none()
      }
    });
    cancel_token.cancel();
    assert!(
      cancelled.await.unwrap(),
      "cancel didn't end the wait for a connection"
    );

    let waiting = tokio::spawn({
      let budget = Arc::clone(&budget);
      async move {
        budget
          .admit("https://a.test", &CancellationToken::new())
          .await
          .is_some()
      }
    });
    tokio::time::sleep(Duration::from_millis(20)).await;
    held.pop();
    assert!(
      tokio::time::timeout(Duration::from_secs(1), waiting)
        .await
        .unwrap()
        .unwrap()
    );
  }
}
