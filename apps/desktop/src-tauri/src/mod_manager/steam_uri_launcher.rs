use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::ExitStatus;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, ChildStderr, Command};
use tokio::task::JoinHandle;

use crate::errors::Error;

const PORTAL_TIMEOUT: Duration = Duration::from_secs(15);
const CAPTURED_STDERR_LINES: usize = 20;

#[derive(Debug, PartialEq, Eq)]
enum CompletionPolicy {
  Observe,
  Timeout(Duration),
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct SteamUriLaunchRequest {
  program: PathBuf,
  uri: String,
  completion: CompletionPolicy,
}

#[derive(Debug)]
pub(crate) struct SteamUriLaunchMonitor {
  task: JoinHandle<Result<(), Error>>,
}

impl SteamUriLaunchRequest {
  pub(crate) fn direct(program: PathBuf, uri: String) -> Self {
    Self {
      program,
      uri,
      completion: CompletionPolicy::Observe,
    }
  }

  pub(crate) fn portal(program: PathBuf, uri: String) -> Self {
    Self {
      program,
      uri,
      completion: CompletionPolicy::Timeout(PORTAL_TIMEOUT),
    }
  }

  pub(crate) fn spawn(self) -> Result<SteamUriLaunchMonitor, Error> {
    use std::process::Stdio;

    let mut child = Command::new(&self.program)
      .arg(&self.uri)
      .stdout(Stdio::null())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|error| {
        Error::GameLaunchFailed(format!(
          "failed to spawn {}: {error}",
          self.program.display()
        ))
      })?;

    let stderr = child.stderr.take().ok_or_else(|| {
      Error::GameLaunchFailed(format!(
        "failed to capture stderr from {}",
        self.program.display()
      ))
    })?;

    let task = tokio::spawn(async move {
      let outcome = monitor_child(
        &mut child,
        stderr,
        &self.program,
        &self.uri,
        self.completion,
      )
      .await;
      if let Err(error) = &outcome {
        log::error!("Steam URI launch failed: {error}");
      }
      outcome
    });

    Ok(SteamUriLaunchMonitor { task })
  }

  #[cfg(test)]
  pub(crate) fn program(&self) -> &Path {
    &self.program
  }

  #[cfg(test)]
  pub(crate) fn uses_portal_timeout(&self) -> bool {
    matches!(self.completion, CompletionPolicy::Timeout(_))
  }
}

impl SteamUriLaunchMonitor {
  pub(crate) async fn wait(self) -> Result<(), Error> {
    self.task.await.map_err(|error| {
      Error::BackgroundTaskFailed(format!("Steam URI launcher task failed: {error}"))
    })?
  }
}

async fn monitor_child(
  child: &mut Child,
  stderr: ChildStderr,
  program: &Path,
  uri: &str,
  completion: CompletionPolicy,
) -> Result<(), Error> {
  let program_display = program.display().to_string();
  let wait_for_exit = async {
    match completion {
      CompletionPolicy::Observe => child.wait().await.map_err(|error| {
        Error::GameLaunchFailed(format!("failed to wait for {program_display}: {error}"))
      }),
      CompletionPolicy::Timeout(timeout) => wait_with_timeout(child, program, timeout).await,
    }
  };
  let (status, stderr) =
    tokio::try_join!(wait_for_exit, read_stderr(stderr, &program_display, uri))?;

  if status.success() {
    return Ok(());
  }

  let message = unsuccessful_exit_message(program, status, &stderr);
  Err(Error::GameLaunchFailed(message))
}

async fn wait_with_timeout(
  child: &mut Child,
  program: &Path,
  timeout: Duration,
) -> Result<ExitStatus, Error> {
  match tokio::time::timeout(timeout, child.wait()).await {
    Ok(result) => result.map_err(|error| {
      Error::GameLaunchFailed(format!(
        "failed to wait for {} while handling the Steam URI: {error}",
        program.display()
      ))
    }),
    Err(_) => {
      if let Err(error) = child.kill().await {
        log::warn!(
          "Failed to stop timed-out URI launcher {}: {error}",
          program.display()
        );
      }
      let _ = child.wait().await;
      Err(Error::GameLaunchFailed(format!(
        "{} did not finish handling the Steam URI within {} seconds",
        program.display(),
        timeout.as_secs()
      )))
    }
  }
}

async fn read_stderr(stderr: ChildStderr, program: &str, uri: &str) -> Result<String, Error> {
  let mut lines = BufReader::new(stderr).lines();
  let mut captured = VecDeque::with_capacity(CAPTURED_STDERR_LINES);

  while let Some(line) = lines.next_line().await.map_err(|error| {
    Error::GameLaunchFailed(format!("failed to read output from {program}: {error}"))
  })? {
    let line = redact_launcher_output(&line, uri);
    log::debug!("[{program}] {line}");
    if captured.len() == CAPTURED_STDERR_LINES {
      captured.pop_front();
    }
    captured.push_back(line);
  }

  Ok(captured.into_iter().collect::<Vec<_>>().join("\n"))
}

fn unsuccessful_exit_message(program: &Path, status: ExitStatus, stderr: &str) -> String {
  if stderr.is_empty() {
    format!(
      "{} exited unsuccessfully while handling the Steam URI: {status}",
      program.display()
    )
  } else {
    format!(
      "{} exited unsuccessfully while handling the Steam URI ({status}): {stderr}",
      program.display()
    )
  }
}

fn redact_launcher_output(line: &str, uri: &str) -> String {
  redact_password_args(&line.replace(uri, &redacted_steam_uri(uri)))
}

pub(super) fn redacted_steam_uri(uri: &str) -> String {
  let without_connect_password = match uri.strip_prefix("steam://connect/") {
    Some(rest) => {
      let addr = rest.split('/').next().unwrap_or(rest);
      format!("steam://connect/{addr}")
    }
    None => uri.to_string(),
  };

  redact_password_args(&without_connect_password)
}

fn redact_password_args(value: &str) -> String {
  let mut parts = value.split(' ').peekable();
  let mut out = Vec::new();
  while let Some(part) = parts.next() {
    out.push(part.to_string());
    if part.eq_ignore_ascii_case("+password") && parts.peek().is_some() {
      parts.next();
      out.push("<redacted>".to_string());
    }
  }
  out.join(" ")
}

#[cfg(test)]
mod redaction_tests {
  use super::*;

  #[test]
  fn redacts_connect_and_launch_passwords() {
    assert_eq!(
      redacted_steam_uri("steam://connect/203.0.113.10:27015/hunter2"),
      "steam://connect/203.0.113.10:27015"
    );
    assert_eq!(
      redacted_steam_uri(
        "steam://run/1422450//+connect 203.0.113.10:27015 +password hunter2 -condebug"
      ),
      "steam://run/1422450//+connect 203.0.113.10:27015 +password <redacted> -condebug"
    );
  }
}

#[cfg(all(test, unix))]
mod process_tests {
  use std::fs;
  use std::os::unix::fs::PermissionsExt;

  use super::*;

  fn fake_launcher(path: &Path, body: &str) -> PathBuf {
    fs::write(path, format!("#!/bin/sh\n{body}\n")).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    path.to_path_buf()
  }

  #[tokio::test]
  async fn reports_a_missing_program() {
    let temp_dir = tempfile::tempdir().unwrap();
    let request = SteamUriLaunchRequest::direct(
      temp_dir.path().join("missing-launcher"),
      "steam://run/1422450//".to_string(),
    );

    let result = request.spawn();

    assert!(
      matches!(result, Err(Error::GameLaunchFailed(ref message)) if message.contains("failed to spawn")),
      "expected a spawn failure, got {result:?}"
    );
  }

  #[tokio::test]
  async fn reports_an_unsuccessful_exit_to_the_monitor() {
    let temp_dir = tempfile::tempdir().unwrap();
    let launcher = fake_launcher(
      &temp_dir.path().join("fake-steam.sh"),
      "echo 'no handler for Steam URI' >&2\nexit 3",
    );
    let request = SteamUriLaunchRequest::direct(launcher, "steam://run/1422450//".to_string());

    let result = request.spawn().unwrap().wait().await;

    assert!(
      matches!(result, Err(Error::GameLaunchFailed(ref message)) if message.contains("no handler for Steam URI") && message.contains("exit status: 3")),
      "expected stderr and exit status, got {result:?}"
    );
  }

  #[tokio::test]
  async fn hands_the_uri_to_the_program() {
    let temp_dir = tempfile::tempdir().unwrap();
    let recording_path = temp_dir.path().join("args.txt");
    let launcher = fake_launcher(
      &temp_dir.path().join("fake-steam.sh"),
      &format!("printf '%s' \"$@\" > \"{}\"", recording_path.display()),
    );
    let request =
      SteamUriLaunchRequest::direct(launcher, "steam://run/1422450//-condebug".to_string());

    request.spawn().unwrap().wait().await.unwrap();

    assert_eq!(
      fs::read_to_string(recording_path).unwrap(),
      "steam://run/1422450//-condebug"
    );
  }

  #[tokio::test]
  async fn reports_a_portal_timeout() {
    let temp_dir = tempfile::tempdir().unwrap();
    let launcher = fake_launcher(&temp_dir.path().join("fake-xdg-open"), "exec sleep 5");
    let request = SteamUriLaunchRequest {
      program: launcher,
      uri: "steam://run/1422450//".to_string(),
      completion: CompletionPolicy::Timeout(Duration::from_millis(20)),
    };

    let result = request.spawn().unwrap().wait().await;

    assert!(
      matches!(result, Err(Error::GameLaunchFailed(ref message)) if message.contains("did not finish")),
      "expected a portal timeout, got {result:?}"
    );
  }
}
