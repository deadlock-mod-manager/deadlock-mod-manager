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
/// Proton replaces its launcher's command line in place during startup.
fn refresh_processes(system: &mut System) {
  system.refresh_processes_specifics(
    ProcessesToUpdate::All,
    true,
    ProcessRefreshKind::nothing()
      .with_cmd(UpdateKind::Always)
      .without_tasks(),
  );
}

fn is_game_process(process: &Process) -> bool {
  process.thread_kind().is_none()
    && is_deadlock_process(process.name(), process.cmd())
    && !is_exiting(process.pid().as_u32())
}

/// A process stuck in teardown (a driver holding it across sleep, say) stays
/// listed with almost no memory and can't be killed, even from an elevated
/// prompt. It isn't the game anymore, so it must not block installs.
#[cfg(windows)]
fn is_exiting(pid: u32) -> bool {
  use crate::game_session::waiter::windows_process::ProcessHandle;

  let exiting = ProcessHandle::open(pid).is_ok_and(|handle| handle.is_exiting());
  if exiting {
    log::debug!("Ignoring Deadlock process {pid}: it is exiting");
  }
  exiting
}

#[cfg(not(windows))]
fn is_exiting(_pid: u32) -> bool {
  false
}

fn is_deadlock_executable(path: &str) -> bool {
  path
    .rsplit(['/', '\\'])
    .next()
    .is_some_and(|name| name.eq_ignore_ascii_case(DEADLOCK_PROCESS_NAME))
}

/// Matches on the process name or argv[0]'s file name, wherever they were read.
pub(crate) fn is_deadlock_command(name: &str, argv0: Option<&str>) -> bool {
  is_deadlock_executable(name) || argv0.is_some_and(is_deadlock_executable)
}

fn is_deadlock_process(name: &OsStr, command: &[std::ffi::OsString]) -> bool {
  is_deadlock_command(
    name.to_str().unwrap_or_default(),
    command.first().and_then(|argument| argument.to_str()),
  )
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

    for process in processes {
      log::info!("Killing process: {:?}", process.pid());
      if !process.kill() {
        log::warn!("Could not kill process {:?}", process.pid());
      }
    }

    // Wait for the OS to fully reap the killed processes before returning,
    // so the next is_game_running() call won't see stale entries.
    thread::sleep(Duration::from_millis(500));
    if self.is_game_running()? {
      return Err(Error::GameStopFailed);
    }
    log::info!("Stopped the game");
    Ok(())
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

  #[cfg(target_os = "linux")]
  #[test]
  fn refreshes_command_lines_after_a_launcher_execs_the_game() {
    use std::io::{BufRead, BufReader, Write};
    use std::process::{Command, Stdio};

    let mut child = Command::new("sh")
      .args(["-c", "printf 'ready\\n'; read -r line; exec sleep 30"])
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .spawn()
      .unwrap();
    let mut ready = String::new();
    BufReader::new(child.stdout.take().unwrap())
      .read_line(&mut ready)
      .unwrap();
    let pid = Pid::from_u32(child.id());
    let mut system = System::new();
    refresh_processes(&mut system);
    let before = system.process(pid).unwrap().cmd().to_vec();
    child.stdin.take().unwrap().write_all(b"\n").unwrap();
    let mut updated = false;
    for _ in 0..100 {
      refresh_processes(&mut system);
      if system
        .process(pid)
        .unwrap()
        .cmd()
        .first()
        .map(|arg| arg.as_os_str())
        == Some(OsStr::new("sleep"))
      {
        updated = true;
        break;
      }
      std::thread::sleep(std::time::Duration::from_millis(10));
    }
    child.kill().unwrap();
    child.wait().unwrap();

    assert!(updated, "kept the launcher's cached arguments: {before:?}");
  }

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
