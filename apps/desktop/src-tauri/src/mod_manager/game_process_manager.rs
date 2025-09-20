use crate::errors::Error;
use log;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

const DEADLOCK_PROCESS_NAME: &str = "deadlock.exe";

/// Manages game process lifecycle
pub struct GameProcessManager {
  system: System,
}

impl GameProcessManager {
  pub fn new() -> Self {
    Self {
      system: System::new_all(),
    }
  }

  /// Check if the Deadlock game is currently running
  pub fn is_game_running(&mut self) -> Result<bool, Error> {
    self.system.refresh_processes_specifics(
      ProcessesToUpdate::All,
      true,
      ProcessRefreshKind::everything(),
    );

    let process_count = self
      .system
      .processes_by_name(DEADLOCK_PROCESS_NAME.as_ref())
      .count();

    log::debug!("Found {} game processes", process_count);
    Ok(process_count > 0)
  }

  /// Check if game is running and return error if it is (for operations that require game to be closed)
  pub fn ensure_game_not_running(&mut self) -> Result<(), Error> {
    if self.is_game_running()? {
      log::debug!("Game is running");
      Err(Error::GameRunning)
    } else {
      log::debug!("Game is not running");
      Ok(())
    }
  }

  /// Stop the running game processes
  pub fn stop_game(&mut self) -> Result<(), Error> {
    if !self.is_game_running()? {
      log::info!("Game is not running");
      return Err(Error::GameNotRunning);
    }

    log::info!("Stopping game...");
    let processes: Vec<_> = self
      .system
      .processes_by_name(DEADLOCK_PROCESS_NAME.as_ref())
      .collect();

    if processes.is_empty() {
      return Err(Error::GameNotRunning);
    }

    let mut stopped_count = 0;
    for process in processes {
      log::info!("Killing process: {:?}", process.pid());
      process.kill();
      stopped_count += 1;
    }

    if stopped_count > 0 {
      log::info!("Stopped {} game process(es)", stopped_count);
      Ok(())
    } else {
      Err(Error::GameNotRunning)
    }
  }
}

impl Default for GameProcessManager {
  fn default() -> Self {
    Self::new()
  }
}
