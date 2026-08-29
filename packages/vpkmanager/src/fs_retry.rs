//! Retrying filesystem operations the running game briefly holds open.

use std::fs;
use std::io;
use std::path::Path;
use std::thread;
use std::time::Duration;

use crate::error::VpkManagerError;

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
    for attempt in 0..FILE_OPERATION_RETRIES {
        match run() {
            Ok(()) => return Ok(()),
            Err(error) if is_transient_file_lock_error(&error) => {
                log::warn!(
                    "File {label} for {path_label} failed because the file may be temporarily locked; retrying ({}/{}) after {}ms: {error}",
                    attempt + 1,
                    FILE_OPERATION_RETRIES,
                    FILE_OPERATION_RETRY_DELAY.as_millis()
                );
                thread::sleep(FILE_OPERATION_RETRY_DELAY);
            }
            Err(error) => return Err(error),
        }
    }

    run()
}

pub fn rename(from: impl AsRef<Path>, to: impl AsRef<Path>) -> io::Result<()> {
    let from = from.as_ref();
    let to = to.as_ref();
    let label = from.display().to_string();
    retry_file_operation("rename", &label, || fs::rename(from, to))
}

pub fn copy(from: impl AsRef<Path>, to: impl AsRef<Path>) -> io::Result<()> {
    let from = from.as_ref();
    let to = to.as_ref();
    let label = from.display().to_string();
    retry_file_operation("copy", &label, || fs::copy(from, to).map(|_| ()))
}

pub fn remove_file(path: impl AsRef<Path>) -> io::Result<()> {
    let path = path.as_ref();
    let label = path.display().to_string();
    retry_file_operation("remove", &label, || fs::remove_file(path))
}

pub fn map_file_lock_error(operation: &str, path: &str, error: io::Error) -> VpkManagerError {
    if is_transient_file_lock_error(&error) {
        VpkManagerError::InUse(format!("{path} ({operation} failed: {error})"))
    } else {
        VpkManagerError::Io(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transient_file_lock_error_matches_windows_sharing_and_lock_violations() {
        assert!(is_transient_file_lock_error(&io::Error::from_raw_os_error(
            32
        )));
        assert!(is_transient_file_lock_error(&io::Error::from_raw_os_error(
            33
        )));
    }

    #[test]
    fn transient_file_lock_error_rejects_access_denied() {
        assert!(!is_transient_file_lock_error(
            &io::Error::from_raw_os_error(5)
        ));
    }

    #[test]
    fn map_file_lock_error_returns_in_use_for_transient_errors() {
        let error = io::Error::from_raw_os_error(32);
        let mapped = map_file_lock_error("rename", "pak01_dir.vpk", error);
        assert!(matches!(mapped, VpkManagerError::InUse(_)));
    }
}
