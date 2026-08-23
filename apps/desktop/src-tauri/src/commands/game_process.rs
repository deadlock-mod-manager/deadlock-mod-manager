use std::future::{Future, ready};
use std::time::Duration;

use crate::errors::Error;
use crate::flatpak::running_in_flatpak;
use crate::mod_manager::console_log_watcher::ConsoleLogTail;

use super::state::{MANAGER, game_path};

pub(super) const GAME_START_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, PartialEq, Eq)]
pub(super) enum GameStartOutcome {
  Running,
  TimedOut,
  Cancelled,
}

pub(super) async fn is_game_running() -> Result<bool, Error> {
  tokio::task::spawn_blocking(|| {
    let mut manager = MANAGER
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
    manager.is_game_running()
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(format!("Process check task failed: {error}")))?
}

pub(super) async fn wait_for_game_start<Cancel>(
  timeout: Duration,
  poll_interval: Duration,
  cancel: Cancel,
) -> Result<GameStartOutcome, Error>
where
  Cancel: Future<Output = ()>,
{
  if running_in_flatpak() {
    let mut console_log = ConsoleLogTail::from_end(&game_path()?);
    return wait_for_game_start_with_check(
      timeout,
      poll_interval,
      move || ready(Ok(console_log.read_new().is_some())),
      cancel,
    )
    .await;
  }

  wait_for_game_start_with_check(timeout, poll_interval, is_game_running, cancel).await
}

async fn wait_for_game_start_with_check<Check, CheckFuture, Cancel>(
  timeout: Duration,
  poll_interval: Duration,
  mut check: Check,
  cancel: Cancel,
) -> Result<GameStartOutcome, Error>
where
  Check: FnMut() -> CheckFuture,
  CheckFuture: Future<Output = Result<bool, Error>>,
  Cancel: Future<Output = ()>,
{
  let deadline = tokio::time::sleep(timeout);
  tokio::pin!(deadline);
  tokio::pin!(cancel);

  loop {
    if check().await? {
      return Ok(GameStartOutcome::Running);
    }

    tokio::select! {
      _ = &mut deadline => return Ok(GameStartOutcome::TimedOut),
      _ = &mut cancel => return Ok(GameStartOutcome::Cancelled),
      _ = tokio::time::sleep(poll_interval) => {}
    }
  }
}

#[cfg(test)]
mod tests {
  use std::future::pending;

  use super::*;

  #[tokio::test]
  async fn reports_running_when_the_game_appears() {
    let mut checks = 0;
    let result = wait_for_game_start_with_check(
      Duration::from_secs(1),
      Duration::ZERO,
      || {
        checks += 1;
        ready(Ok(checks == 3))
      },
      pending(),
    )
    .await;

    assert_eq!(result.unwrap(), GameStartOutcome::Running);
    assert_eq!(checks, 3);
  }

  #[tokio::test]
  async fn reports_timeout() {
    let result = wait_for_game_start_with_check(
      Duration::ZERO,
      Duration::ZERO,
      || ready(Ok(false)),
      pending(),
    )
    .await;

    assert_eq!(result.unwrap(), GameStartOutcome::TimedOut);
  }

  #[tokio::test]
  async fn reports_cancellation() {
    let result = wait_for_game_start_with_check(
      Duration::from_secs(1),
      Duration::ZERO,
      || ready(Ok(false)),
      ready(()),
    )
    .await;

    assert_eq!(result.unwrap(), GameStartOutcome::Cancelled);
  }
}
