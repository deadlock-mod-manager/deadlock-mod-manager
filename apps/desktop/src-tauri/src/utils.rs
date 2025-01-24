use crate::errors::Error;
use std::process::Command;

pub fn show_in_folder(path: &str) -> Result<(), Error> {
    #[cfg(target_os = "windows")]
    {
        match Command::new("explorer").arg(path).spawn() {
            Ok(_) => Ok(()),
            Err(e) => Err(Error::FailedToOpenFolder(e.to_string())),
        }
    }
    #[cfg(target_os = "linux")]
    {
        match Command::new("xdg-open").arg(path).spawn() {
            Ok(_) => Ok(()),
            Err(e) => Err(Error::FailedToOpenFolder(e.to_string())),
        }
    }
}
