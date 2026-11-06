use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tokio::process::Command;

use crate::errors::Error;
use crate::mod_manager::game_process_manager::is_deadlock_command;

const CHECK_TIMEOUT: Duration = Duration::from_secs(5);
/// Lets the host reap the killed processes, so the check after a stop doesn't
/// see them. Matches the native stop.
const STOP_SETTLE: Duration = Duration::from_millis(500);

// Unlike ps's space-joined arguments, /proc preserves argv[0]'s boundaries.
// Each record is pid\0comm\0argv[0]\0\0; a process without a command line is
// pid\0comm\0\0.
const HOST_PROCESSES: &str = r#"
for proc in "$1"/[0-9]*; do
  IFS= read -r name 2>/dev/null < "$proc/comm" || continue
  printf '%s\000%s\000' "${proc##*/}" "$name"
  head -z -n 1 "$proc/cmdline" 2>/dev/null
  printf '\000'
done
"#;

fn host_command() -> Command {
  let mut command = Command::new("flatpak-spawn");
  command.args(["--host", "--watch-bus"]);
  command
}

/// The sandbox hides host processes, so read their names and first arguments
/// on the host and apply the native process match.
async fn host_game_pids() -> Result<Vec<u32>, Error> {
  let mut command = host_command();
  command.args(["sh", "-c", HOST_PROCESSES, "host-processes", "/proc"]);
  let output = host_output(command, CHECK_TIMEOUT).await?;
  Ok(game_pids(&output))
}

#[derive(Default)]
struct LastScan {
  seq: u64,
  running: bool,
}

impl LastScan {
  /// Several pollers scan at once and can finish out of order, so only a scan
  /// that started after the stored one may replace it.
  fn record(&mut self, seq: u64, running: bool) {
    if seq > self.seq {
      *self = Self { seq, running };
    }
  }
}

static SCAN_SEQ: AtomicU64 = AtomicU64::new(0);

/// The host's last answer. A failed check reports it again, so a transient
/// failure doesn't read as the game closing (which would reset gameinfo.gi
/// while the game still runs).
static LAST_SCAN: Mutex<LastScan> = Mutex::new(LastScan {
  seq: 0,
  running: false,
});

fn last_scan() -> MutexGuard<'static, LastScan> {
  LAST_SCAN
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub(crate) async fn is_game_running() -> Result<bool, Error> {
  let seq = SCAN_SEQ.fetch_add(1, Ordering::Relaxed) + 1;
  let running = !host_game_pids().await?.is_empty();
  last_scan().record(seq, running);
  Ok(running)
}

pub(crate) fn last_known_running() -> bool {
  last_scan().running
}

/// Kills the game on the host, as the native stop does. The sandbox can't
/// signal processes it can't see.
pub(crate) async fn stop_game() -> Result<(), Error> {
  let pids = host_game_pids().await?;
  if pids.is_empty() {
    return Err(Error::GameNotRunning);
  }

  log::info!("Stopping game processes on the host: {pids:?}");
  let mut command = host_command();
  command
    .args(["sh", "-c", r#"exec kill -KILL "$@""#, "kill"])
    .args(pids.iter().map(u32::to_string));
  // kill exits nonzero when one PID exited after the scan, though it signaled
  // the rest; the recheck below decides whether the stop worked.
  if let Err(error) = host_output(command, CHECK_TIMEOUT).await {
    log::warn!("Host kill reported an error; checking for remaining game processes: {error}");
  }

  tokio::time::sleep(STOP_SETTLE).await;
  if is_game_running().await? {
    return Err(Error::GameStopFailed);
  }
  log::info!("Stopped the game");
  Ok(())
}

fn game_pids(output: &[u8]) -> Vec<u32> {
  String::from_utf8_lossy(output)
    .split("\0\0")
    .filter_map(|record| {
      // An empty argv[0] adds a NUL, which lands at the start of the next
      // record.
      let mut fields = record.trim_start_matches('\0').splitn(3, '\0');
      let pid = fields.next()?.parse().ok()?;
      let name = fields.next()?;
      let argv0 = fields.next().unwrap_or_default();
      is_deadlock_command(name, Some(argv0)).then_some(pid)
    })
    .collect()
}

async fn host_output(mut command: Command, timeout: Duration) -> Result<Vec<u8>, Error> {
  let output = tokio::time::timeout(timeout, command.kill_on_drop(true).output())
    .await
    .map_err(|_| Error::GameLaunchFailed("Host process check timed out".to_string()))?
    .map_err(|error| Error::GameLaunchFailed(format!("Could not check host processes: {error}")))?;

  if !output.status.success() {
    return Err(Error::GameLaunchFailed(format!(
      "Host process check failed ({}): {}",
      output.status,
      String::from_utf8_lossy(&output.stderr).trim(),
    )));
  }
  Ok(output.stdout)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn matches_the_game_without_matching_its_wrappers() {
    for path in [
      r"S:\steamapps\common\Deadlock\game\bin\win64\deadlock.exe",
      r"C:\Program Files (x86)\Steam\Deadlock\DEADLOCK.EXE",
      r"C:\Games.exe files\Deadlock\deadlock.exe",
      "/home/user/Steam Library/Deadlock/deadlock.exe",
      "/home/user/Games.exe files/Deadlock/deadlock.exe",
      "S:/Steam/Deadlock/deadlock.exe",
    ] {
      assert_eq!(
        game_pids(format!("42\0MainThrd\0{path}\0\0").as_bytes()),
        [42],
        "missed {path}"
      );
    }
    let wrappers = concat!(
      "1\0steam.exe\0C:\\windows\\system32\\steam.exe\0\0",
      "2\0python3\0/usr/bin/python3\0\0",
      "3\0MainThrd\0S:\\Steam\\Deadlock\\deadlock.exe.bak\0\0",
      "4\0bash\0bash\0\0",
      "5\0kworker\0\0",
    );
    assert!(game_pids(wrappers.as_bytes()).is_empty());
    assert_eq!(
      game_pids(format!("{wrappers}42\0deadlock.exe\0\0").as_bytes()),
      [42]
    );
  }

  #[test]
  fn an_older_scan_finishing_last_does_not_replace_a_newer_one() {
    let mut last = LastScan::default();
    last.record(2, true);
    last.record(1, false);
    assert!(last.running);
    last.record(3, false);
    assert!(!last.running);
  }

  #[tokio::test]
  async fn host_records_preserve_spaces_and_ignore_later_wrapper_arguments() {
    let root = tempfile::tempdir().unwrap();
    for (pid, name, command) in [
      (
        "1",
        "python3",
        "/usr/bin/python3\0/home/user/Steam Library/deadlock.exe\0",
      ),
      (
        "2",
        "steam.exe",
        "C:\\windows\\steam.exe\0C:\\Games.exe files\\deadlock.exe\0",
      ),
      ("3", "kworker", ""),
      // An empty argv[0] must not hide the record after it.
      ("10", "empty-argv0", "\0--flag\0"),
      ("11", "MainThrd", "S:\\Steam\\Deadlock\\deadlock.exe\0"),
    ] {
      let proc = root.path().join(pid);
      std::fs::create_dir(&proc).unwrap();
      std::fs::write(proc.join("comm"), format!("{name}\n")).unwrap();
      std::fs::write(proc.join("cmdline"), command).unwrap();
    }
    let scan = || {
      let mut command = Command::new("sh");
      command
        .args(["-c", HOST_PROCESSES, "host-processes"])
        .arg(root.path());
      command
    };
    assert_eq!(
      game_pids(&host_output(scan(), CHECK_TIMEOUT).await.unwrap()),
      [11]
    );
    std::fs::remove_dir_all(root.path().join("11")).unwrap();
    assert!(game_pids(&host_output(scan(), CHECK_TIMEOUT).await.unwrap()).is_empty());
    std::fs::write(root.path().join("2/comm"), "MainThrd\n").unwrap();
    for path in [
      "/home/user/Steam Library/deadlock.exe",
      r"C:\Games.exe files\deadlock.exe",
    ] {
      std::fs::write(root.path().join("2/cmdline"), format!("{path}\0-steam\0")).unwrap();
      assert_eq!(
        game_pids(&host_output(scan(), CHECK_TIMEOUT).await.unwrap()),
        [2]
      );
    }
  }

  #[tokio::test]
  async fn reports_host_errors_instead_of_a_missing_game() {
    let mut command = Command::new("sh");
    command.args(["-c", "echo 'Host access denied' >&2; exit 1"]);
    assert!(matches!(
      host_output(command, CHECK_TIMEOUT).await,
      Err(Error::GameLaunchFailed(message)) if message.contains("Host access denied"),
    ));
  }

  #[tokio::test]
  async fn bounds_the_time_spent_waiting_for_the_host() {
    let mut command = Command::new("sleep");
    command.arg("10");
    assert!(matches!(
      host_output(command, Duration::from_millis(10)).await,
      Err(Error::GameLaunchFailed(message)) if message.contains("timed out"),
    ));
  }
}
