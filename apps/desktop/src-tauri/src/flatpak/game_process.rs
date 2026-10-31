use std::time::Duration;

use tokio::process::Command;

use crate::errors::Error;
use crate::mod_manager::game_process_manager::is_deadlock_command;

const CHECK_TIMEOUT: Duration = Duration::from_secs(5);

/// The sandbox hides host processes, so this lists them with the host's `ps`
/// and applies the same match as the native check.
pub(crate) async fn is_game_running() -> Result<bool, Error> {
  let mut command = Command::new("flatpak-spawn");
  command.args(["--host", "ps", "-eo", "comm=,args="]);
  let output = host_output(command, CHECK_TIMEOUT).await?;
  Ok(String::from_utf8_lossy(&output).lines().any(is_game_line))
}

fn is_game_line(line: &str) -> bool {
  let line = line.trim_start();
  let (name, args) = line.split_once(char::is_whitespace).unwrap_or((line, ""));
  is_deadlock_command(name, argv0(args.trim_start()))
}

/// `ps` joins the arguments with spaces. Proton's argv[0] is a Windows path
/// that may contain some, so a drive-letter path runs to its first `.exe`.
fn argv0(args: &str) -> Option<&str> {
  let bytes = args.as_bytes();
  if bytes.len() > 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
    let lower = args.to_ascii_lowercase();
    let end = lower
      .match_indices(".exe")
      .map(|(index, _)| index + ".exe".len())
      .find(|&end| lower[end..].chars().next().is_none_or(char::is_whitespace));
    if let Some(end) = end {
      return Some(&args[..end]);
    }
  }
  args.split_whitespace().next()
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
    for line in [
      r"MainThrd        S:\steamapps\common\Deadlock\game\bin\win64\deadlock.exe -steam",
      r"MainThrd        C:\Program Files (x86)\Steam\Deadlock\DEADLOCK.EXE",
      "MainThrd        S:/Steam/Deadlock/deadlock.exe -steam",
      "deadlock.exe    /steam/Deadlock/deadlock.exe -steam",
    ] {
      assert!(is_game_line(line), "missed {line}");
    }
    for line in [
      r"steam.exe       C:\windows\system32\steam.exe S:\Steam\Deadlock\deadlock.exe -steam",
      r"python3         /usr/bin/python3 /steam/Proton/proton waitforexitandrun S:\Steam\Deadlock\deadlock.exe",
      r"MainThrd        S:\Steam\Deadlock\deadlock.exe.bak",
      "bash            bash",
    ] {
      assert!(!is_game_line(line), "matched {line}");
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
