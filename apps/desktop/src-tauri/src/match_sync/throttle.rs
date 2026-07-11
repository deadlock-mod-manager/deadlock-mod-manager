//! Async min-interval throttle: smooths GC requests into a steady trickle (no
//! bursts), independent of the hard [`super::quota`] cap.

use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::Instant;

pub struct Throttle {
  min_interval: Duration,
  last: Mutex<Option<Instant>>,
}

impl Throttle {
  pub fn new(min_interval: Duration) -> Self {
    Self {
      min_interval,
      last: Mutex::new(None),
    }
  }

  pub async fn acquire(&self) {
    let mut last = self.last.lock().await;
    if let Some(prev) = *last {
      let elapsed = prev.elapsed();
      if elapsed < self.min_interval {
        tokio::time::sleep(self.min_interval - elapsed).await;
      }
    }
    *last = Some(Instant::now());
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn spaces_calls_by_min_interval() {
    let throttle = Throttle::new(Duration::from_millis(30));
    let start = Instant::now();
    // First is immediate; each subsequent one waits the interval (3 gaps of 30ms).
    for _ in 0..4 {
      throttle.acquire().await;
    }
    assert!(start.elapsed() >= Duration::from_millis(85));
  }
}
