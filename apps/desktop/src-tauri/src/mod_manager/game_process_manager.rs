use std::ffi::OsStr;
use std::thread;
use std::time::Duration;

use crate::errors::Error;
use log;
use sysinfo::{Process, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

const DEADLOCK_PROCESS_NAME: &str = "deadlock.exe";

/// Name, start time and command line are all we read. On Linux, sysinfo
/// lists every thread as a process of its own unless tasks are left out, and
/// the game's threads share its command line.
fn refresh_processes(system: &mut System) {
  system.refresh_processes_specifics(
    ProcessesToUpdate::All,
    true,
    ProcessRefreshKind::nothing()
      .with_cmd(UpdateKind::OnlyIfNotSet)
      .without_tasks(),
  );
}

fn is_game_process(process: &Process) -> bool {
  process.thread_kind().is_none() && is_deadlock_process(process.name(), process.cmd())
}

fn executable_name(value: &OsStr) -> Option<&str> {
  value
    .to_str()?
    .rsplit(['/', '\\'])
    .next()
    .filter(|name| !name.is_empty())
}

fn is_deadlock_process(name: &OsStr, command: &[std::ffi::OsString]) -> bool {
  executable_name(name).is_some_and(|name| name.eq_ignore_ascii_case(DEADLOCK_PROCESS_NAME))
    || command
      .first()
      .and_then(|argument| executable_name(argument))
      .is_some_and(|name| name.eq_ignore_ascii_case(DEADLOCK_PROCESS_NAME))
}

/// A running Deadlock process as the OS reports it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameProcess {
  pub pid: u32,
  /// Seconds since the Unix epoch.
  pub start_time: u64,
  pub command: Vec<String>,
}

/// Manages game process lifecycle
pub struct GameProcessManager {
  system: System,
}

impl GameProcessManager {
  pub fn new() -> Self {
    Self {
      system: System::new(),
    }
  }

  /// Check if the Deadlock game is currently running
  pub fn is_game_running(&mut self) -> Result<bool, Error> {
    Ok(!self.game_processes()?.is_empty())
  }

  pub fn game_processes(&mut self) -> Result<Vec<GameProcess>, Error> {
    refresh_processes(&mut self.system);

    let processes: Vec<GameProcess> = self
      .system
      .processes()
      .values()
      .filter(|process| is_game_process(process))
      .map(|process| GameProcess {
        pid: process.pid().as_u32(),
        start_time: process.start_time(),
        command: process
          .cmd()
          .iter()
          .map(|argument| argument.to_string_lossy().into_owned())
          .collect(),
      })
      .collect();

    log::debug!("Found {} game processes", processes.len());
    Ok(processes)
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
      .processes()
      .values()
      .filter(|process| is_game_process(process))
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
      log::info!("Stopped {stopped_count} game process(es)");
      // Wait for the OS to fully reap the killed processes before returning,
      // so the next is_game_running() call won't see stale entries.
      thread::sleep(Duration::from_millis(500));
      refresh_processes(&mut self.system);
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

#[cfg(test)]
mod tests {
  use std::ffi::{OsStr, OsString};

  use sysinfo::{Pid, System, ThreadKind};

  use super::{is_deadlock_process, refresh_processes};

  #[test]
  fn lists_processes_without_their_threads() {
    let (stop, stopped) = std::sync::mpsc::channel::<()>();
    let worker = std::thread::spawn(move || {
      let _ = stopped.recv();
    });
    let mut system = System::new();

    refresh_processes(&mut system);

    assert!(system.process(Pid::from_u32(std::process::id())).is_some());
    assert!(
      system
        .processes()
        .values()
        .all(|process| process.thread_kind() != Some(ThreadKind::Userland))
    );
    drop(stop);
    worker.join().unwrap();
  }

  #[test]
  fn detects_native_process_name() {
    assert!(is_deadlock_process(OsStr::new("deadlock.exe"), &[]));
  }

  #[test]
  fn detects_proton_process_by_windows_argv_zero() {
    let command = [OsString::from(
      r"S:\steamapps\common\Deadlock\game\bin\win64\deadlock.exe",
    )];

    assert!(is_deadlock_process(OsStr::new("MainThrd"), &command));
  }

  #[test]
  fn ignores_wrapper_processes_that_only_reference_deadlock_later() {
    let command = [
      OsString::from("python3"),
      OsString::from("/steam/Proton/proton"),
      OsString::from("/steam/Deadlock/game/bin/win64/deadlock.exe"),
    ];

    assert!(!is_deadlock_process(OsStr::new("python3"), &command));
  }
}
