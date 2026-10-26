use std::time::Duration;

use tokio::process::Command;

use crate::errors::Error;

// Proton can keep MainThrd as its process name and use a Windows path as argv[0].
const GAME_COMMAND_PATTERN: &str =
  r"^([[:alpha:]]:.*[\\/]|/[^[:space:]]*/)?deadlock\.exe([[:space:]]|$)";
const CHECK_TIMEOUT: Duration = Duration::from_secs(5);

pub(crate) async fn is_steam_running() -> Result<bool, Error> {
  Ok(host_processes(["-ix", "steam"]).await?.is_some())
}

pub(crate) async fn is_game_running() -> Result<bool, Error> {
  if host_processes(["-ix", r"deadlock\.exe"]).await?.is_some() {
    return Ok(true);
  }
  Ok(
    host_processes(["-ifl", GAME_COMMAND_PATTERN])
      .await?
      .is_some_and(|output| contains_proton_game_process(&output)),
  )
}

fn contains_proton_game_process(output: &[u8]) -> bool {
  // Wine's steam.exe wrapper also mentions the game in its arguments.
  String::from_utf8_lossy(output).lines().any(|line| {
    line
      .split_ascii_whitespace()
      .nth(1)
      .is_some_and(|name| name.eq_ignore_ascii_case("MainThrd"))
  })
}

async fn host_processes(args: [&str; 2]) -> Result<Option<Vec<u8>>, Error> {
  let mut command = Command::new("flatpak-spawn");
  command.args(["--host", "pgrep"]).args(args);
  check_process(command, CHECK_TIMEOUT).await
}

async fn check_process(mut command: Command, timeout: Duration) -> Result<Option<Vec<u8>>, Error> {
  let output = tokio::time::timeout(timeout, command.kill_on_drop(true).output())
    .await
    .map_err(|_| Error::GameLaunchFailed("Host process check timed out".to_string()))?
    .map_err(|error| Error::GameLaunchFailed(format!("Could not check host processes: {error}")))?;

  match output.status.code() {
    Some(0) => Ok(Some(output.stdout)),
    Some(1) if output.stderr.is_empty() => Ok(None),
    _ => Err(Error::GameLaunchFailed(format!(
      "Host process check failed ({}): {}",
      output.status,
      String::from_utf8_lossy(&output.stderr).trim(),
    ))),
  }
}

#[cfg(test)]
mod tests {
  use regex::RegexBuilder;

  use super::*;

  #[test]
  fn matches_proton_game_commands_without_matching_wrappers() {
    let pattern = RegexBuilder::new(GAME_COMMAND_PATTERN)
      .case_insensitive(true)
      .build()
      .unwrap();

    for command in [
      r"S:\steamapps\common\Deadlock\game\bin\win64\deadlock.exe -steam",
      r"C:\Program Files (x86)\Steam\Deadlock\DEADLOCK.EXE",
      "S:/Steam/Deadlock/deadlock.exe -steam",
      "C:/deadlock.exe",
      "deadlock.exe -steam",
      "/steam/Deadlock/deadlock.exe -steam",
    ] {
      assert!(pattern.is_match(command), "missed {command}");
    }
    for command in [
      r"python3 /steam/Proton/proton S:\Steam\Deadlock\deadlock.exe",
      r"/usr/bin/python3 /steam/Proton/proton S:\Steam\Deadlock\deadlock.exe",
      r"S:\Steam\Deadlock\deadlock.exe.bak",
      "/usr/bin/python3 /steam/Deadlock/deadlock.exe",
    ] {
      assert!(!pattern.is_match(command), "matched {command}");
    }
  }

  #[test]
  fn waits_for_the_game_instead_of_its_steam_wrapper() {
    assert!(!contains_proton_game_process(b"840299 steam.exe\n"));
    assert!(contains_proton_game_process(
      b"840299 steam.exe\n840408 MainThrd\n"
    ));
  }

  #[tokio::test]
  async fn distinguishes_running_missing_and_failed_process_checks() {
    for (code, expected) in [(0, Ok(true)), (1, Ok(false)), (2, Err(()))] {
      let mut command = Command::new("sh");
      command.args(["-c", &format!("exit {code}")]);
      assert_eq!(
        check_process(command, CHECK_TIMEOUT)
          .await
          .map(|output| output.is_some())
          .map_err(|_| ()),
        expected,
      );
    }
  }

  #[tokio::test]
  async fn reports_a_missing_host_launcher() {
    let directory = tempfile::tempdir().unwrap();
    let command = Command::new(directory.path().join("missing-flatpak-spawn"));
    assert!(check_process(command, CHECK_TIMEOUT).await.is_err());
  }

  #[tokio::test]
  async fn reports_host_errors_instead_of_a_missing_game() {
    let mut command = Command::new("sh");
    command.args(["-c", "echo 'Host access denied' >&2; exit 1"]);
    assert!(matches!(
      check_process(command, CHECK_TIMEOUT).await,
      Err(Error::GameLaunchFailed(message)) if message.contains("Host access denied"),
    ));
  }

  #[tokio::test]
  async fn bounds_the_time_spent_waiting_for_the_host() {
    let mut command = Command::new("sleep");
    command.arg("10");
    assert!(matches!(
      check_process(command, Duration::from_millis(10)).await,
      Err(Error::GameLaunchFailed(message)) if message.contains("timed out"),
    ));
  }
}
