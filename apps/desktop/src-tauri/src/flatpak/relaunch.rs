use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

use crate::errors::Error;

const SCRIPT: &str = include_str!("relaunch.sh");

struct RelaunchTarget<'a> {
  instance: &'a str,
  reference: String,
}

impl<'a> RelaunchTarget<'a> {
  fn from_info(info: &'a str) -> Result<Self, Error> {
    let value = |key| {
      info
        .lines()
        .filter_map(|line| line.split_once('='))
        .find_map(|(name, value)| (name == key && !value.is_empty()).then_some(value))
        .ok_or_else(|| Error::InvalidInput(format!("Missing Flatpak {key}")))
    };
    Ok(Self {
      instance: value("instance-id")?,
      reference: format!("{}/{}/{}", value("name")?, value("arch")?, value("branch")?),
    })
  }
}

pub(super) async fn schedule(scope: &str, cache: &Path) -> Result<(), Error> {
  let info = tokio::fs::read_to_string("/.flatpak-info").await?;
  let target = RelaunchTarget::from_info(&info)?;
  let output = Command::new("flatpak-spawn")
    .args(["--host", "sh", "-c", SCRIPT, "dmm-flatpak-relaunch"])
    .args([target.instance, scope, &target.reference])
    .arg(cache.join("flatpak-relaunch.log"))
    .stdin(Stdio::null())
    .output()
    .await?;
  if !output.status.success() {
    return Err(Error::InvalidInput(format!(
      "Failed to schedule Flatpak relaunch: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    )));
  }
  log::info!(
    "Scheduled host relaunch of {} ({scope}) after instance {} exits",
    target.reference,
    target.instance
  );
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn relaunch_preserves_the_running_branch_and_architecture() {
    let target = RelaunchTarget::from_info(
      "[Application]\nname=dev.stormix.deadlock-mod-manager\n[Instance]\ninstance-id=123\narch=aarch64\nbranch=beta\n",
    ).unwrap();
    assert_eq!(target.instance, "123");
    assert_eq!(
      target.reference,
      "dev.stormix.deadlock-mod-manager/aarch64/beta"
    );
  }

  #[test]
  fn incomplete_instance_metadata_does_not_schedule_a_relaunch() {
    for info in [
      "",
      "name=app\narch=x86_64\nbranch=master\n",
      "instance-id=1\nname=app\narch=x86_64\nbranch=\n",
    ] {
      assert!(RelaunchTarget::from_info(info).is_err());
    }
  }
}
