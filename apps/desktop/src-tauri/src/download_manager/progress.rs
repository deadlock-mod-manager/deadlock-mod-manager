use std::sync::{Mutex, MutexGuard, PoisonError};

#[derive(Clone, Copy, Default)]
struct FileProgressSlot {
  downloaded: u64,
  speed: f64,
  size: u64,
}

#[derive(Clone, Copy)]
pub struct AcceptedProgress {
  pub file_downloaded: u64,
  pub total_downloaded: u64,
  pub total_size: u64,
  pub total_speed: f64,
  pub percentage: f64,
}

pub struct ProgressAggregator {
  slots: Mutex<Vec<FileProgressSlot>>,
}

impl ProgressAggregator {
  pub fn new(declared_sizes: &[u64]) -> Self {
    Self {
      slots: Mutex::new(
        declared_sizes
          .iter()
          .map(|&size| FileProgressSlot {
            size,
            ..FileProgressSlot::default()
          })
          .collect(),
      ),
    }
  }

  pub fn record(
    &self,
    file_index: usize,
    downloaded: u64,
    total: Option<u64>,
    speed: f64,
    publish: impl FnOnce(AcceptedProgress),
  ) {
    let mut slots = self.lock();
    let slot = &mut slots[file_index];
    slot.downloaded = downloaded;
    slot.speed = speed;
    if let Some(total) = total {
      slot.size = total;
    }

    // Publishing inside the critical section is what orders the emitted sequence: released
    // first, two concurrent files can compute ascending figures and then emit them in the
    // opposite order. `publish` must therefore stay non-blocking.
    publish(Self::aggregate(&slots, file_index));
  }

  pub fn finish(&self, file_index: usize, publish: impl FnOnce(AcceptedProgress)) {
    let mut slots = self.lock();
    slots[file_index].speed = 0.0;

    publish(Self::aggregate(&slots, file_index));
  }

  fn lock(&self) -> MutexGuard<'_, Vec<FileProgressSlot>> {
    self.slots.lock().unwrap_or_else(PoisonError::into_inner)
  }

  fn aggregate(slots: &[FileProgressSlot], file_index: usize) -> AcceptedProgress {
    let total_downloaded: u64 = slots.iter().map(|slot| slot.downloaded).sum();
    let total_size: u64 = slots.iter().map(|slot| slot.size).sum();
    let total_speed: f64 = slots.iter().map(|slot| slot.speed).sum();

    let percentage = if total_size > 0 {
      (total_downloaded as f64 / total_size as f64 * 100.0).min(100.0)
    } else {
      0.0
    };

    AcceptedProgress {
      file_downloaded: slots[file_index].downloaded,
      total_downloaded,
      total_size,
      total_speed,
      percentage,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const CHUNK: u64 = 1_000;
  const CHUNKS_PER_FILE: u64 = 20;
  const SPEED: f64 = 1_000.0;

  fn record(
    aggregator: &ProgressAggregator,
    file_index: usize,
    downloaded: u64,
    speed: f64,
  ) -> AcceptedProgress {
    record_observing(aggregator, file_index, downloaded, None, speed)
  }

  fn record_with_total(
    aggregator: &ProgressAggregator,
    file_index: usize,
    downloaded: u64,
    total: u64,
    speed: f64,
  ) -> AcceptedProgress {
    record_observing(aggregator, file_index, downloaded, Some(total), speed)
  }

  fn record_observing(
    aggregator: &ProgressAggregator,
    file_index: usize,
    downloaded: u64,
    total: Option<u64>,
    speed: f64,
  ) -> AcceptedProgress {
    let mut published = None;
    aggregator.record(file_index, downloaded, total, speed, |accepted| {
      published = Some(accepted)
    });
    published.expect("record did not publish")
  }

  fn finish(aggregator: &ProgressAggregator, file_index: usize) -> AcceptedProgress {
    let mut published = None;
    aggregator.finish(file_index, |accepted| published = Some(accepted));
    published.expect("finish did not publish")
  }

  #[test]
  fn progress_is_published_while_the_lock_is_held() {
    let aggregator = ProgressAggregator::new(&[CHUNK, CHUNK]);
    let mut published = 0;

    aggregator.record(0, CHUNK, None, SPEED, |_| {
      published += 1;
      assert!(
        aggregator.slots.try_lock().is_err(),
        "the lock was released before publishing, leaving two concurrent files free to compute ascending figures and emit them in the opposite order"
      );
    });

    aggregator.finish(0, |_| {
      published += 1;
      assert!(
        aggregator.slots.try_lock().is_err(),
        "`finish` released the lock before publishing"
      );
    });

    assert_eq!(
      published, 2,
      "the assertions above sit inside the callbacks, so a publish that never runs passes them silently"
    );
  }

  #[test]
  fn each_file_counts_towards_the_shared_total() {
    let size = CHUNK * CHUNKS_PER_FILE;
    let aggregator = ProgressAggregator::new(&[size, size]);

    let first = record(&aggregator, 0, size, SPEED);
    assert_eq!(
      first.percentage, 50.0,
      "one file's bytes were divided by that file's size instead of the mod's"
    );

    let second = record(&aggregator, 1, size, SPEED);
    assert_eq!(second.total_downloaded, size * 2);
    assert_eq!(second.percentage, 100.0);
  }

  #[test]
  fn a_file_that_stopped_short_leaves_the_bar_short() {
    let size = CHUNK * CHUNKS_PER_FILE;
    let aggregator = ProgressAggregator::new(&[size, size]);

    record(&aggregator, 0, size, SPEED);
    record(&aggregator, 1, size / 2, SPEED);

    assert_eq!(
      finish(&aggregator, 1).percentage,
      75.0,
      "a file that stopped half-transferred was snapped up to its full size, reporting the mod complete"
    );
  }

  #[test]
  fn restarted_file_reports_its_reset() {
    let size = CHUNK * CHUNKS_PER_FILE;
    let aggregator = ProgressAggregator::new(&[size, size]);

    record(&aggregator, 0, size, SPEED);
    record(&aggregator, 1, size / 5 * 4, SPEED);

    let after_restart = record(&aggregator, 1, CHUNK, SPEED);

    assert_eq!(
      after_restart.total_downloaded,
      size + CHUNK,
      "the restarted file stayed pinned at its earlier peak"
    );
  }

  #[test]
  fn a_finished_file_stops_contributing_its_rate() {
    let aggregator = ProgressAggregator::new(&[CHUNK, CHUNK]);

    record(&aggregator, 0, CHUNK, 5.0);
    assert_eq!(
      record(&aggregator, 1, CHUNK / 2, 5.0).total_speed,
      10.0,
      "the aggregate reported one file's rate instead of every live file's"
    );

    let accepted = finish(&aggregator, 0);

    assert_eq!(
      accepted.total_speed, 5.0,
      "finishing a file left the inflated rate for a sibling to correct"
    );
    assert_eq!(accepted.total_downloaded, CHUNK + CHUNK / 2);
    assert_eq!(accepted.file_downloaded, CHUNK);

    assert_eq!(
      record(&aggregator, 1, CHUNK, 5.0).total_speed,
      5.0,
      "a file that stopped downloading kept donating bandwidth"
    );
  }

  #[test]
  fn a_file_with_no_declared_size_reports_zero_percent() {
    let aggregator = ProgressAggregator::new(&[0]);

    let accepted = record(&aggregator, 0, CHUNK, SPEED);

    assert_eq!(
      accepted.percentage, 0.0,
      "a file with no size was measured against a denominator of zero"
    );
    assert_eq!(accepted.file_downloaded, CHUNK);
  }

  #[test]
  fn an_observed_size_supplies_a_missing_fraction() {
    let aggregator = ProgressAggregator::new(&[0, 0]);

    record_with_total(&aggregator, 0, CHUNK, CHUNK * 2, SPEED);
    let accepted = record_with_total(&aggregator, 1, CHUNK, CHUNK * 2, SPEED);

    assert_eq!(accepted.total_size, CHUNK * 4);
    assert_eq!(
      accepted.percentage, 50.0,
      "a mod whose metadata omits every size stayed pinned at 0%"
    );
  }

  #[test]
  fn an_observed_size_corrects_an_overstated_file() {
    let aggregator = ProgressAggregator::new(&[CHUNK * 2]);

    let accepted = record_with_total(&aggregator, 0, CHUNK, CHUNK, SPEED);

    assert_eq!(accepted.total_size, CHUNK);
    assert_eq!(
      accepted.percentage, 100.0,
      "metadata larger than the real file stalled the bar short of 100%"
    );
  }

  #[test]
  fn a_report_without_a_size_keeps_the_one_already_observed() {
    let aggregator = ProgressAggregator::new(&[CHUNK * 2]);

    record_with_total(&aggregator, 0, CHUNK / 2, CHUNK, SPEED);
    let accepted = record(&aggregator, 0, CHUNK, SPEED);

    assert_eq!(
      accepted.total_size, CHUNK,
      "a report carrying no size of its own reverted the file to the size its metadata declared"
    );
    assert_eq!(accepted.percentage, 100.0);
  }

  #[test]
  fn a_size_confirmed_after_a_sibling_reported_widens_the_denominator() {
    let aggregator = ProgressAggregator::new(&[CHUNK * 10, 0]);

    let before = record(&aggregator, 0, CHUNK * 10, SPEED);
    assert_eq!(
      before.percentage, 100.0,
      "a file whose size nothing has stated yet was counted in the denominator"
    );

    let after = record_with_total(&aggregator, 1, 0, CHUNK * 10, SPEED);

    assert_eq!(after.total_size, CHUNK * 20);
    assert_eq!(
      after.percentage, 50.0,
      "the denominator was frozen at the value published before the second file stated its size"
    );
  }

  #[test]
  fn a_file_that_overruns_its_size_cannot_push_past_one_hundred() {
    let aggregator = ProgressAggregator::new(&[CHUNK, CHUNK]);

    record(&aggregator, 1, CHUNK, SPEED);
    let accepted = record(&aggregator, 0, CHUNK * 3, SPEED);

    assert_eq!(
      accepted.percentage, 100.0,
      "a file that read past its declared size drove the bar above 100%"
    );
    assert_eq!(
      accepted.file_downloaded,
      CHUNK * 3,
      "the reported byte count was capped along with the percentage"
    );
  }
}
