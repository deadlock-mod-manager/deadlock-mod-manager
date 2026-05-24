use crate::errors::Error;
use log;
use std::io;
use std::thread;
use std::time::Duration;

const FILE_OPERATION_RETRIES: usize = 5;
const FILE_OPERATION_RETRY_DELAY: Duration = Duration::from_millis(150);

pub fn is_transient_file_lock_error(error: &io::Error) -> bool {
  matches!(error.raw_os_error(), Some(32 | 33))
    || matches!(error.kind(), io::ErrorKind::WouldBlock)
}

pub fn retry_file_operation(
  label: &str,
  path_label: &str,
  mut run: impl FnMut() -> io::Result<()>,
) -> io::Result<()> {
  let mut last_error = None;

  for attempt in 0..=FILE_OPERATION_RETRIES {
    match run() {
      Ok(()) => return Ok(()),
      Err(error) => {
        let should_retry =
          attempt < FILE_OPERATION_RETRIES && is_transient_file_lock_error(&error);
        if should_retry {
          log::warn!(
            "File {label} for {path_label} failed because the file may be temporarily locked; retrying ({}/{}) after {}ms: {error}",
            attempt + 1,
            FILE_OPERATION_RETRIES,
            FILE_OPERATION_RETRY_DELAY.as_millis()
          );
          last_error = Some(error);
          thread::sleep(FILE_OPERATION_RETRY_DELAY);
        } else {
          return Err(error);
        }
      }
    }
  }

  Err(last_error.unwrap_or_else(|| io::Error::other("File operation failed")))
}

pub fn map_file_lock_error(operation: &str, path: &str, error: io::Error) -> Error {
  if is_transient_file_lock_error(&error) {
    Error::VpkInUse(format!("{path} ({operation} failed: {error})"))
  } else {
    Error::Io(error)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn transient_file_lock_error_matches_windows_sharing_and_lock_violations() {
    assert!(is_transient_file_lock_error(&io::Error::from_raw_os_error(32)));
    assert!(is_transient_file_lock_error(&io::Error::from_raw_os_error(33)));
  }

  #[test]
  fn transient_file_lock_error_rejects_access_denied() {
    assert!(!is_transient_file_lock_error(&io::Error::from_raw_os_error(5)));
  }

  #[test]
  fn map_file_lock_error_returns_vpk_in_use_for_transient_errors() {
    let error = io::Error::from_raw_os_error(32);
    let mapped = map_file_lock_error("rename", "pak01_dir.vpk", error);
    assert!(matches!(mapped, Error::VpkInUse(_)));
  }
}
