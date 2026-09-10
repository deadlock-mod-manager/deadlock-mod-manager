//! Abrupt transaction exits, available only in the isolated E2E binary.
use std::fs;
use std::io::Write;
use std::path::Path;

pub fn checkpoint(name: &str, profile: &Path) -> std::io::Result<()> {
  let Some(configuration) = crate::runtime_environment::current().e2e() else {
    return Ok(());
  };
  let expected = match configuration.case_id.as_str() {
    "filesystem-crash-placed" => "placed",
    "filesystem-crash-committed" => "committed",
    _ => return Ok(()),
  };
  if name != expected {
    return Ok(());
  }
  let artifacts = configuration.roots.world.join("artifacts");
  let arm = artifacts.join("crash-arm.txt");
  if !arm.exists() {
    return Ok(());
  }
  for path in [profile, artifacts.as_path(), arm.as_path()] {
    crate::runtime_environment::ensure_e2e_managed_path(path).map_err(std::io::Error::other)?;
  }
  if fs::read_to_string(&arm)? != format!("{}:{name}", std::process::id()) {
    return Err(std::io::Error::other(
      "E2E crash arm does not match this process",
    ));
  }
  fs::remove_file(arm)?;
  let mut evidence = fs::OpenOptions::new()
    .write(true)
    .create_new(true)
    .open(artifacts.join("crash-observed.json"))?;
  serde_json::to_writer(
    &mut evidence,
    &serde_json::json!({
      "processId": std::process::id(),
      "checkpoint": name,
      "profile": profile,
      "runId": configuration.run_id,
    }),
  )?;
  evidence.flush()?;
  evidence.sync_all()?;
  // Do not unwind: Drop would roll the transaction back and mask crash recovery.
  std::process::exit(86);
}
