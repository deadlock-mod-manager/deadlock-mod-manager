//! The elevated entry point only accepts relay restrictions and removal of owned rules.
//! Requests travel over a short-lived authenticated loopback connection; the helper
//! never reads or writes caller-selected files and never evaluates shell commands.
use std::{path::PathBuf, time::Duration};

use serde::{Deserialize, Serialize};
use tokio::{
  io::{AsyncReadExt, AsyncWriteExt},
  net::{TcpListener, TcpStream},
  time::timeout,
};

use crate::{PickerError, catalog, firewall, types::FirewallRule};

const FLAG: &str = "--dmm-server-picker-helper";
const MAX_MESSAGE: usize = 1024 * 1024;
const OPERATION_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Serialize, Deserialize)]
#[serde(tag = "operation", deny_unknown_fields)]
pub(crate) enum Request {
  Apply {
    rules: Vec<FirewallRule>,
    game_executable: PathBuf,
  },
  Reset {},
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
  rules: Option<Vec<FirewallRule>>,
  error: Option<String>,
}

/// Call before GUI initialization. A helper invocation always terminates here,
/// including malformed arguments, and must never fall through to normal startup.
pub fn run_if_requested() -> Option<i32> {
  let arguments: Vec<_> = std::env::args_os().skip(1).collect();
  if arguments.first().is_none_or(|value| value != FLAG) {
    return None;
  }
  if arguments.len() != 3 {
    return Some(1);
  }
  let Some(port) = arguments[1]
    .to_str()
    .and_then(|value| value.parse::<u16>().ok())
    .filter(|port| *port > 0)
  else {
    return Some(1);
  };
  let Some(token) = arguments[2]
    .to_str()
    .filter(|value| value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
  else {
    return Some(1);
  };
  Some(run_helper(port, token))
}

fn run_helper(port: u16, token: &str) -> i32 {
  let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
  else {
    return 1;
  };
  if runtime
    .block_on(async { timeout(OPERATION_TIMEOUT, serve(port, token)).await })
    .is_ok_and(|result| result.is_ok())
  {
    0
  } else {
    1
  }
}

async fn serve(port: u16, token: &str) -> Result<(), PickerError> {
  let mut stream = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port)).await?;
  stream.write_all(token.as_bytes()).await?;
  let bytes = read_message(&mut stream).await?;
  let request: Request =
    serde_json::from_slice(&bytes).map_err(|error| PickerError::Validation(error.to_string()))?;
  let response = match process(request).await {
    Ok(rules) => Response {
      rules: Some(rules),
      error: None,
    },
    Err(error) => Response {
      rules: None,
      error: Some(error.to_string()),
    },
  };
  write_message(
    &mut stream,
    &serde_json::to_vec(&response).map_err(|error| PickerError::Firewall(error.to_string()))?,
  )
  .await
}

async fn process(request: Request) -> Result<Vec<FirewallRule>, PickerError> {
  match request {
    Request::Reset {} => firewall::apply_privileged(&[], None),
    Request::Apply {
      mut rules,
      game_executable,
    } => {
      firewall::normalize(&mut rules)?;
      if rules.is_empty() {
        return firewall::apply_privileged(&[], None);
      }
      let executable = validate_executable(game_executable)?;
      // Independently obtain Valve's allowlist at the privilege boundary;
      // a compromised caller cannot turn the helper into a general firewall editor.
      let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| PickerError::Firewall(error.to_string()))?;
      let current = catalog::fetch_catalog(&client).await?;
      let locations: Vec<_> = rules.iter().map(|rule| rule.location_id.clone()).collect();
      let allowed = catalog::rules_for_locations(&current, &locations)?;
      if rules.iter().any(|rule| !allowed.contains(rule)) {
        return Err(PickerError::Validation(
          "Relay catalog changed. Refresh locations and apply again.".into(),
        ));
      }
      firewall::apply_privileged(&rules, Some(&executable))
    }
  }
}

fn validate_executable(path: PathBuf) -> Result<PathBuf, PickerError> {
  if !path.is_absolute() || !path.is_file() {
    return Err(PickerError::Validation(
      "The Deadlock executable was not found".into(),
    ));
  }
  let path = path.canonicalize()?;
  if !is_deadlock_executable_path(&path) {
    return Err(PickerError::Validation(
      "Only the Deadlock executable can be restricted".into(),
    ));
  }
  Ok(path)
}

pub(crate) fn is_deadlock_executable_path(path: &std::path::Path) -> bool {
  let Some(filename) = path.file_name().and_then(|part| part.to_str()) else {
    return false;
  };
  let expected_platform = if filename.eq_ignore_ascii_case("deadlock.exe") {
    "win64"
  } else if filename == "deadlock" {
    "linuxsteamrt64"
  } else {
    return false;
  };
  let mut parent = path.parent();
  for expected in [expected_platform, "bin", "game"] {
    let Some(directory) = parent else {
      return false;
    };
    if !directory
      .file_name()
      .and_then(|part| part.to_str())
      .is_some_and(|part| part.eq_ignore_ascii_case(expected))
    {
      return false;
    }
    parent = directory.parent();
  }
  path.is_absolute()
}

pub(crate) async fn execute(request: Request) -> Result<Vec<FirewallRule>, PickerError> {
  timeout(OPERATION_TIMEOUT, exchange(request))
    .await
    .map_err(|_| {
      PickerError::Firewall(
        "Firewall authorization timed out. Refresh state before trying again.".into(),
      )
    })?
}

async fn exchange(request: Request) -> Result<Vec<FirewallRule>, PickerError> {
  let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
  let port = listener.local_addr()?.port();
  let token = uuid::Uuid::new_v4().simple().to_string();
  let executable = std::env::current_exe()?;
  let launch_token = token.clone();
  let mut process = tokio::task::spawn_blocking(move || launch(executable, port, launch_token))
    .await
    .map_err(|error| PickerError::Firewall(error.to_string()))??;
  let mut stream = loop {
    let (mut candidate, _) = tokio::select! {
        connection = listener.accept() => connection?,
        _ = tokio::time::sleep(Duration::from_millis(100)) => {
            process.check()?;
            continue;
        }
    };
    let mut received = [0_u8; 32];
    if timeout(Duration::from_secs(2), candidate.read_exact(&mut received))
      .await
      .is_ok_and(|result| result.is_ok())
      && token_matches(token.as_bytes(), &received)
    {
      break candidate;
    }
  };
  let bytes =
    serde_json::to_vec(&request).map_err(|error| PickerError::Validation(error.to_string()))?;
  write_message(&mut stream, &bytes).await?;
  let response: Response = serde_json::from_slice(&read_message(&mut stream).await?)
    .map_err(|error| PickerError::Firewall(error.to_string()))?;
  match (response.rules, response.error) {
    (Some(mut rules), None) => {
      firewall::normalize(&mut rules)?;
      Ok(rules)
    }
    (None, Some(error)) => Err(PickerError::Firewall(error)),
    _ => Err(PickerError::Firewall(
      "Invalid firewall helper response".into(),
    )),
  }
}

struct HelperProcess {
  #[cfg(windows)]
  handle: std::os::windows::io::OwnedHandle,
  #[cfg(target_os = "linux")]
  child: Option<std::process::Child>,
}

impl HelperProcess {
  fn check(&mut self) -> Result<(), PickerError> {
    #[cfg(windows)]
    {
      use std::os::windows::io::AsRawHandle;
      use windows::Win32::{
        Foundation::{HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT},
        System::Threading::{GetExitCodeProcess, WaitForSingleObject},
      };
      let handle = HANDLE(self.handle.as_raw_handle());
      // OwnedHandle keeps the process object valid across worker threads;
      // a zero wait observes completion without blocking the async executor.
      match unsafe { WaitForSingleObject(handle, 0) } {
        WAIT_TIMEOUT => {}
        WAIT_OBJECT_0 => {
          let mut exit_code = 0;
          unsafe { GetExitCodeProcess(handle, &mut exit_code) }.map_err(|error| {
            PickerError::Firewall(format!(
              "Could not read firewall helper exit status: {error}"
            ))
          })?;
          return Err(PickerError::Firewall(format!(
            "The firewall helper exited before connecting (exit code 0x{exit_code:08X}). No request was sent."
          )));
        }
        _ => {
          return Err(PickerError::Firewall(format!(
            "Could not monitor the firewall helper: {}",
            std::io::Error::last_os_error()
          )));
        }
      }
    }
    #[cfg(target_os = "linux")]
    if let Some(child) = &mut self.child
      && let Some(status) = child.try_wait()?
    {
      return Err(PickerError::Firewall(format!(
        "Firewall authorization was cancelled or the helper exited ({status})."
      )));
    }
    Ok(())
  }
}

impl Drop for HelperProcess {
  fn drop(&mut self) {
    #[cfg(target_os = "linux")]
    if let Some(mut child) = self.child.take() {
      std::thread::spawn(move || {
        let _ = child.wait();
      });
    }
  }
}

fn token_matches(expected: &[u8], actual: &[u8; 32]) -> bool {
  expected.len() == actual.len()
    && expected
      .iter()
      .zip(actual)
      .fold(0, |difference, (left, right)| difference | (left ^ right))
      == 0
}

async fn read_message(stream: &mut TcpStream) -> Result<Vec<u8>, PickerError> {
  let size = stream.read_u32().await? as usize;
  if size > MAX_MESSAGE {
    return Err(PickerError::Validation(
      "Firewall helper message is too large".into(),
    ));
  }
  let mut bytes = vec![0; size];
  stream.read_exact(&mut bytes).await?;
  Ok(bytes)
}

async fn write_message(stream: &mut TcpStream, bytes: &[u8]) -> Result<(), PickerError> {
  if bytes.len() > MAX_MESSAGE {
    return Err(PickerError::Validation(
      "Firewall helper message is too large".into(),
    ));
  }
  stream.write_u32(bytes.len() as u32).await?;
  stream.write_all(bytes).await?;
  Ok(())
}

#[cfg(windows)]
fn launch(executable: PathBuf, port: u16, token: String) -> Result<HelperProcess, PickerError> {
  use std::os::windows::{
    ffi::OsStrExt,
    io::{FromRawHandle, OwnedHandle},
  };
  use windows::{
    Win32::UI::{
      Shell::{SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW, ShellExecuteExW},
      WindowsAndMessaging::SW_HIDE,
    },
    core::{PCWSTR, w},
  };
  let path: Vec<_> = executable
    .as_os_str()
    .encode_wide()
    .chain(Some(0))
    .collect();
  let arguments: Vec<_> = format!("{FLAG} {port} {token}")
    .encode_utf16()
    .chain(Some(0))
    .collect();
  let mut info = SHELLEXECUTEINFOW {
    cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
    fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC,
    lpVerb: w!("runas"),
    lpFile: PCWSTR(path.as_ptr()),
    lpParameters: PCWSTR(arguments.as_ptr()),
    nShow: SW_HIDE.0,
    ..Default::default()
  };
  // `path` and `arguments` outlive the call.
  unsafe {
    ShellExecuteExW(&mut info).map_err(|error| {
      PickerError::Firewall(format!(
        "Firewall authorization was cancelled or failed: {error}"
      ))
    })?;
  }
  if info.hProcess.is_invalid() {
    return Err(PickerError::Firewall(
      "Windows did not return a process handle for the firewall helper.".into(),
    ));
  }
  // ShellExecuteExW transfers this handle to the caller with
  // SEE_MASK_NOCLOSEPROCESS. OwnedHandle closes it after the exchange.
  let handle = unsafe { OwnedHandle::from_raw_handle(info.hProcess.0) };
  Ok(HelperProcess { handle })
}

#[cfg(target_os = "linux")]
fn launch(executable: PathBuf, port: u16, token: String) -> Result<HelperProcess, PickerError> {
  let capability = firewall::FirewallBackend::new().capability();
  if !capability.supported {
    return Err(PickerError::Firewall(capability.reason.unwrap_or_default()));
  }
  // Fixed system path avoids executing caller-controlled PATH entries as root.
  let child = std::process::Command::new("/usr/bin/pkexec")
    .arg(executable)
    .arg(FLAG)
    .arg(port.to_string())
    .arg(token)
    .stdin(std::process::Stdio::null())
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::null())
    .spawn()?;
  Ok(HelperProcess { child: Some(child) })
}

#[cfg(not(any(windows, target_os = "linux")))]
fn launch(_executable: PathBuf, _port: u16, _token: String) -> Result<HelperProcess, PickerError> {
  Err(PickerError::Firewall("Unsupported platform".into()))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn helper_starts_its_runtime_before_connecting_and_rejects_unsafe_requests() {
    use std::io::{Read, Write};

    let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let token = "01234567890123456789012345678901";
    let parent = std::thread::spawn(move || {
      let (mut stream, _) = listener.accept().unwrap();
      stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
      let mut received = [0_u8; 32];
      stream.read_exact(&mut received).unwrap();
      assert_eq!(&received, token.as_bytes());
      let invalid = br#"{"operation":"Execute","command":"whoami"}"#;
      stream
        .write_all(&(invalid.len() as u32).to_be_bytes())
        .unwrap();
      stream.write_all(invalid).unwrap();
    });
    assert_eq!(run_helper(port, token), 1);
    parent.join().unwrap();
  }

  #[cfg(windows)]
  #[test]
  fn reports_helper_exit_without_waiting_for_the_handshake_timeout() {
    use std::os::windows::{io::AsHandle, process::CommandExt};
    use windows::Win32::System::Threading::CREATE_NO_WINDOW;

    let mut child = std::process::Command::new("cmd.exe")
      .args(["/d", "/c", "exit", "23"])
      .creation_flags(CREATE_NO_WINDOW.0)
      .stdin(std::process::Stdio::null())
      .stdout(std::process::Stdio::null())
      .stderr(std::process::Stdio::null())
      .spawn()
      .unwrap();
    let mut process = HelperProcess {
      handle: child.as_handle().try_clone_to_owned().unwrap(),
    };
    child.wait().unwrap();
    let error = process.check().unwrap_err();
    assert!(error.to_string().contains("0x00000017"));
    assert!(error.to_string().contains("No request was sent"));
  }

  #[test]
  fn helper_rejects_arbitrary_commands_and_extra_fields() {
    assert!(
      serde_json::from_str::<Request>(r#"{"operation":"Execute","command":"whoami"}"#).is_err()
    );
    assert!(
      serde_json::from_str::<Request>(r#"{"operation":"Reset","path":"/etc/passwd"}"#).is_err()
    );
  }

  #[test]
  fn rejects_unrelated_executables_and_misleading_names() {
    let root = std::env::temp_dir();
    assert!(is_deadlock_executable_path(
      &root.join("Deadlock/game/bin/win64/deadlock.exe")
    ));
    assert!(!is_deadlock_executable_path(&root.join("deadlock.exe")));
    assert!(!is_deadlock_executable_path(
      &root.join("Deadlock/game/bin/win64/steam.exe")
    ));
    assert!(!is_deadlock_executable_path(std::path::Path::new(
      "game/bin/win64/deadlock.exe"
    )));
  }

  #[tokio::test]
  async fn rejects_oversized_payload_before_allocating_it() {
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
      .await
      .unwrap();
    let mut client = TcpStream::connect(listener.local_addr().unwrap())
      .await
      .unwrap();
    let (mut server, _) = listener.accept().await.unwrap();
    client.write_u32((MAX_MESSAGE + 1) as u32).await.unwrap();
    assert!(read_message(&mut server).await.is_err());
  }
}
