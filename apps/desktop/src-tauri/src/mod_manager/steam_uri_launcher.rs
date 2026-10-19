use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::{ExitStatus, Stdio};
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, ChildStderr, Command};
use tokio::task::JoinHandle;

use crate::errors::Error;

#[cfg(target_os = "linux")]
const PORTAL_TIMEOUT: Duration = Duration::from_secs(15);
const CAPTURED_STDERR_LINES: usize = 20;

enum CompletionPolicy {
  Observe,
  // Only constructed by the Linux portal path and tests.
  #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
  Timeout(Duration),
}

pub(crate) struct SteamUriLaunchRequest {
  program: PathBuf,
  launcher_args: Vec<&'static str>,
  uri: String,
  completion: CompletionPolicy,
}

#[derive(Debug)]
pub(crate) struct SteamUriLaunchMonitor {
  task: JoinHandle<Result<(), Error>>,
  recorded: bool,
}

impl SteamUriLaunchRequest {
  pub(crate) fn direct(program: PathBuf, uri: String) -> Self {
    Self {
      program,
      launcher_args: Vec::new(),
      uri,
      completion: CompletionPolicy::Observe,
    }
  }

  /// Hand the URI to a launcher that needs its own arguments first, such as
  /// `flatpak run com.valvesoftware.Steam`.
  #[cfg(target_os = "linux")]
  pub(crate) fn wrapped(program: PathBuf, launcher_args: Vec<&'static str>, uri: String) -> Self {
    Self {
      program,
      launcher_args,
      uri,
      completion: CompletionPolicy::Observe,
    }
  }

  #[cfg(target_os = "linux")]
  pub(crate) fn portal(program: PathBuf, uri: String) -> Self {
    Self {
      program,
      launcher_args: Vec::new(),
      uri,
      completion: CompletionPolicy::Timeout(PORTAL_TIMEOUT),
    }
  }

  pub(crate) fn spawn(self) -> Result<SteamUriLaunchMonitor, Error> {
    if crate::runtime_environment::records_game_launches() {
      crate::runtime_environment::record_game_launch(&self.program, &redacted_steam_uri(&self.uri))
        .map_err(|error| {
          Error::GameLaunchFailed(format!("failed to record E2E game launch: {error}"))
        })?;
      return Ok(SteamUriLaunchMonitor {
        task: tokio::spawn(async { Ok(()) }),
        recorded: true,
      });
    }

    let mut child = Command::new(&self.program)
      .args(&self.launcher_args)
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

    Ok(SteamUriLaunchMonitor {
      task,
      recorded: false,
    })
  }

  #[cfg(all(test, target_os = "linux"))]
  pub(crate) fn program(&self) -> &Path {
    &self.program
  }

  #[cfg(all(test, target_os = "linux"))]
  pub(crate) fn launcher_args(&self) -> &[&'static str] {
    &self.launcher_args
  }

  #[cfg(all(test, target_os = "linux"))]
  pub(crate) fn uses_portal_timeout(&self) -> bool {
    matches!(self.completion, CompletionPolicy::Timeout(_))
  }
}

impl SteamUriLaunchMonitor {
  pub(crate) fn was_recorded(&self) -> bool {
    self.recorded
  }

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

  Err(Error::GameLaunchFailed(unsuccessful_exit_message(
    program, status, &stderr,
  )))
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

  // A test thread forking while fake_launcher still holds the script open for writing leaks that
  // fd into the child until it execs, so exec'ing the script can briefly fail with ETXTBSY.
  fn spawn_fake(request: impl Fn() -> SteamUriLaunchRequest) -> SteamUriLaunchMonitor {
    for _ in 0..50 {
      match request().spawn() {
        Err(Error::GameLaunchFailed(message)) if message.contains("os error 26") => {
          std::thread::sleep(Duration::from_millis(10));
        }
        result => return result.unwrap(),
      }
    }
    panic!("fake launcher stayed busy");
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
    let result = spawn_fake(|| {
      SteamUriLaunchRequest::direct(launcher.clone(), "steam://run/1422450//".to_string())
    })
    .wait()
    .await;

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
    spawn_fake(|| {
      SteamUriLaunchRequest::direct(
        launcher.clone(),
        "steam://run/1422450//-condebug".to_string(),
      )
    })
    .wait()
    .await
    .unwrap();

    assert_eq!(
      fs::read_to_string(recording_path).unwrap(),
      "steam://run/1422450//-condebug"
    );
  }

  #[tokio::test]
  async fn reports_a_portal_timeout() {
    let temp_dir = tempfile::tempdir().unwrap();
    let launcher = fake_launcher(&temp_dir.path().join("fake-xdg-open"), "exec sleep 5");
    let result = spawn_fake(|| SteamUriLaunchRequest {
      program: launcher.clone(),
      launcher_args: Vec::new(),
      uri: "steam://run/1422450//".to_string(),
      completion: CompletionPolicy::Timeout(Duration::from_millis(20)),
    })
    .wait()
    .await;

    assert!(
      matches!(result, Err(Error::GameLaunchFailed(ref message)) if message.contains("did not finish")),
      "expected a portal timeout, got {result:?}"
    );
  }
}
