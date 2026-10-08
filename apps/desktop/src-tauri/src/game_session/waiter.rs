//! Blocks until the game process exits.
//!
//! On Windows we hold a handle on the process, which is the only way to read
//! its exit code: it has to be opened while the process is alive. Elsewhere
//! the game isn't our child (Steam and Proton start it), so we poll for the
//! PID and get no exit code; sysinfo's own `wait` reports a made-up status
//! for non-children on Linux.

use std::time::Duration;

use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use super::same_process_start;

const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// Waits for `pid` (started at `start_time`) to exit and returns its exit
/// code when the platform can tell.
pub fn wait_for_exit(pid: u32, start_time: Option<u64>) -> Option<u32> {
  #[cfg(windows)]
  if let Some(handle) = windows_process::ProcessHandle::open(pid) {
    match (start_time, handle.start_time()) {
      // The PID belongs to a newer process, so ours is gone.
      (Some(expected), Some(actual)) if !same_process_start(expected, actual) => return None,
      // Which process this is can't be told; polling checks the start time.
      (Some(_), None) => {}
      _ => return handle.wait(),
    }
  }

  let mut system = System::new();
  while is_alive(&mut system, pid, start_time) {
    std::thread::sleep(POLL_INTERVAL);
  }
  None
}

fn is_alive(system: &mut System, pid: u32, start_time: Option<u64>) -> bool {
  let pid = Pid::from_u32(pid);
  system.refresh_processes_specifics(
    ProcessesToUpdate::Some(&[pid]),
    true,
    ProcessRefreshKind::nothing(),
  );
  system.process(pid).is_some_and(|process| {
    start_time.is_none_or(|start_time| same_process_start(process.start_time(), start_time))
  })
}

#[cfg(windows)]
mod windows_process {
  use windows::Win32::Foundation::{BOOL, CloseHandle, FILETIME, HANDLE, WAIT_OBJECT_0};
  use windows::Win32::System::Threading::{
    GetExitCodeProcess, GetProcessTimes, INFINITE, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    PROCESS_SYNCHRONIZE, WaitForSingleObject,
  };

  /// FILETIME counts 100 ns ticks since 1601-01-01.
  const FILETIME_TICKS_PER_SEC: u64 = 10_000_000;
  const SECS_FROM_1601_TO_UNIX_EPOCH: u64 = 11_644_473_600;

  pub struct ProcessHandle(HANDLE);

  impl ProcessHandle {
    pub fn open(pid: u32) -> Option<Self> {
      // SAFETY: OpenProcess has no preconditions; failure is returned as an error.
      let handle = unsafe {
        OpenProcess(
          PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
          BOOL::from(false),
          pid,
        )
      };
      handle
        .inspect_err(|error| log::warn!("Could not open Deadlock process {pid}: {error}"))
        .ok()
        .map(Self)
    }

    /// When the process was created, in seconds since the Unix epoch: the
    /// same clock sysinfo reads for `GameProcess::start_time`.
    pub fn start_time(&self) -> Option<u64> {
      let mut creation = FILETIME::default();
      let mut exit = FILETIME::default();
      let mut kernel = FILETIME::default();
      let mut user = FILETIME::default();
      // SAFETY: the handle is valid until Drop and was opened with
      // PROCESS_QUERY_LIMITED_INFORMATION; the out pointers are live locals.
      unsafe {
        GetProcessTimes(self.0, &mut creation, &mut exit, &mut kernel, &mut user).ok()?;
      }
      let ticks = (u64::from(creation.dwHighDateTime) << 32) | u64::from(creation.dwLowDateTime);
      (ticks / FILETIME_TICKS_PER_SEC).checked_sub(SECS_FROM_1601_TO_UNIX_EPOCH)
    }

    pub fn wait(&self) -> Option<u32> {
      let mut exit_code = 0u32;
      // SAFETY: the handle is valid until Drop and was opened with SYNCHRONIZE
      // and PROCESS_QUERY_LIMITED_INFORMATION, which these calls need.
      unsafe {
        if WaitForSingleObject(self.0, INFINITE) != WAIT_OBJECT_0 {
          return None;
        }
        GetExitCodeProcess(self.0, &mut exit_code).ok()?;
      }
      Some(exit_code)
    }
  }

  impl Drop for ProcessHandle {
    fn drop(&mut self) {
      // SAFETY: we own the handle and close it exactly once.
      unsafe {
        let _ = CloseHandle(self.0);
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn this_process_is_alive_and_a_mismatched_start_time_is_not() {
    let pid = std::process::id();
    let mut system = System::new();

    assert!(is_alive(&mut system, pid, None));
    assert!(!is_alive(&mut system, pid, Some(1)));
  }

  #[test]
  fn does_not_wait_for_a_process_that_reused_the_pid() {
    assert_eq!(wait_for_exit(std::process::id(), Some(1)), None);
  }

  #[cfg(windows)]
  #[test]
  fn reads_the_exit_code_of_a_finished_process() {
    let mut child = std::process::Command::new("cmd")
      .args(["/C", "exit 3"])
      .spawn()
      .unwrap();
    let pid = child.id();
    // `child` keeps the process object alive after it exits.
    let start_time =
      windows_process::ProcessHandle::open(pid).and_then(|handle| handle.start_time());
    child.wait().unwrap();

    assert!(start_time.is_some());
    assert_eq!(wait_for_exit(pid, start_time), Some(3));
  }

  #[cfg(windows)]
  #[test]
  fn the_handle_and_sysinfo_agree_on_the_start_time() {
    let pid = std::process::id();
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::Some(&[Pid::from_u32(pid)]), true);
    let expected = system.process(Pid::from_u32(pid)).unwrap().start_time();

    let actual = windows_process::ProcessHandle::open(pid).and_then(|handle| handle.start_time());

    assert!(actual.is_some_and(|actual| same_process_start(actual, expected)));
  }
}
