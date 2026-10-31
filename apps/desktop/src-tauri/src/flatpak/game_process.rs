use std::time::Duration;

use tokio::process::Command;

use crate::errors::Error;
use crate::mod_manager::game_process_manager::is_deadlock_command;

const CHECK_TIMEOUT: Duration = Duration::from_secs(5);

// Unlike ps's space-joined arguments, /proc preserves argv[0]'s boundaries.
// Each record is comm\0argv[0]\0\0; a process without a command line is comm\0\0.
const HOST_PROCESSES: &str = r#"
for proc in "$1"/[0-9]*; do
  IFS= read -r name 2>/dev/null < "$proc/comm" || continue
  printf '%s\000' "$name"
  head -z -n 1 "$proc/cmdline" 2>/dev/null
  printf '\000'
done
"#;

/// The sandbox hides host processes, so read their names and first arguments
/// on the host and apply the native process match.
pub(crate) async fn is_game_running() -> Result<bool, Error> {
  let mut command = Command::new("flatpak-spawn");
  command.args([
    "--host",
    "--watch-bus",
    "sh",
    "-c",
    HOST_PROCESSES,
    "host-processes",
    "/proc",
  ]);
  let output = host_output(command, CHECK_TIMEOUT).await?;
  Ok(host_has_game(&output))
}

fn host_has_game(output: &[u8]) -> bool {
  String::from_utf8_lossy(output).split("\0\0").any(|record| {
    let (name, argv0) = record.split_once('\0').unwrap_or((record, ""));
    is_deadlock_command(name, Some(argv0))
  })
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
      assert!(
        host_has_game(format!("MainThrd\0{path}\0\0").as_bytes()),
        "missed {path}"
      );
    }
    let wrappers = concat!(
      "steam.exe\0C:\\windows\\system32\\steam.exe\0\0",
      "python3\0/usr/bin/python3\0\0",
      "MainThrd\0S:\\Steam\\Deadlock\\deadlock.exe.bak\0\0",
      "bash\0bash\0\0",
      "kworker\0\0",
    );
    assert!(!host_has_game(wrappers.as_bytes()));
    assert!(host_has_game(
      format!("{wrappers}deadlock.exe\0\0").as_bytes()
    ));
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
    assert!(!host_has_game(
      &host_output(scan(), CHECK_TIMEOUT).await.unwrap()
    ));
    std::fs::write(root.path().join("2/comm"), "MainThrd\n").unwrap();
    for path in [
      "/home/user/Steam Library/deadlock.exe",
      r"C:\Games.exe files\deadlock.exe",
    ] {
      std::fs::write(root.path().join("2/cmdline"), format!("{path}\0-steam\0")).unwrap();
      assert!(host_has_game(
        &host_output(scan(), CHECK_TIMEOUT).await.unwrap()
      ));
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
