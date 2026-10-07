use super::{LocalizationOverlayPlanKey, LocalizationResolution};
use crate::errors::Error;
use crate::mod_manager::localization_overlay::asset_compatibility::{AssetRepair, AssetWarning};
use crate::mod_manager::localization_overlay::vdata_compatibility::{DataRepair, DataWarning};
use crate::mod_manager::localization_overlay::{
  LocalizationOverlayApplyResult, LocalizationOverlayPlan,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
  fs,
  io::{Read, Write},
  path::{Path, PathBuf},
};

// Increment when repair rules or output semantics change, so installed overlays are rebuilt.
const REPAIR_REVISION: u32 = 26;
const RECEIPT_NAME: &str = "compatibility.json";

#[derive(Serialize, Deserialize)]
pub(super) struct OverlayReceipt {
  revision: u32,
  pub key: LocalizationOverlayPlanKey,
  pub resolutions: Vec<LocalizationResolution>,
  overlay_hash: Option<String>,
  repairs: Vec<AssetRepair>,
  warnings: Vec<AssetWarning>,
  data_repairs: Vec<DataRepair>,
  data_warnings: Vec<DataWarning>,
  baselines: Vec<crate::mod_manager::localization_overlay::CompiledDataBaseline>,
}

pub(super) fn path(overlay: &Path) -> PathBuf {
  overlay.with_file_name(RECEIPT_NAME)
}

pub(super) fn load(overlay: &Path) -> Result<Option<OverlayReceipt>, Error> {
  match fs::read(path(overlay)) {
    Ok(bytes) => match serde_json::from_slice::<OverlayReceipt>(&bytes) {
      Ok(receipt) if receipt.revision == REPAIR_REVISION => Ok(Some(receipt)),
      _ => {
        log::info!("Rebuilding overlay with missing or outdated compatibility receipt");
        Ok(None)
      }
    },
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(error) => Err(Error::io_context(
      "read compatibility receipt",
      &path(overlay),
      error,
    )),
  }
}

fn digest(path: &Path) -> Result<Option<String>, Error> {
  let mut file = match fs::File::open(path) {
    Ok(file) => file,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(error) => return Err(Error::io_context("read compatibility overlay", path, error)),
  };
  let mut hasher = Sha256::new();
  let mut buffer = [0; 8192];
  loop {
    let length = file
      .read(&mut buffer)
      .map_err(|error| Error::io_context("read compatibility overlay", path, error))?;
    if length == 0 {
      break;
    }
    hasher.update(&buffer[..length]);
  }
  Ok(Some(hex::encode(hasher.finalize())))
}

impl OverlayReceipt {
  pub fn is_current(&self, key: &LocalizationOverlayPlanKey) -> Result<bool, Error> {
    Ok(self.key == *key && self.overlay_hash == digest(&key.output_path)?)
  }

  pub(super) fn log_status(&self, action: &str) {
    log::info!(
      "Compatibility overlay {action}: revision={} enabled_mods={:?} selected_mods={:?} overlay_hash={:?} asset_repairs={} data_repairs={} asset_warnings={} data_warnings={} receipt={}",
      self.revision,
      self.key.mods.iter().map(|(id, _)| id).collect::<Vec<_>>(),
      self.key.compatibility_mod_ids,
      self.overlay_hash,
      self.repairs.len(),
      self.data_repairs.len(),
      self.warnings.len(),
      self.data_warnings.len(),
      path(&self.key.output_path).display()
    );
  }
}

pub(super) fn write(
  plan: &LocalizationOverlayPlan,
  key: LocalizationOverlayPlanKey,
  resolutions: &[LocalizationResolution],
) -> Result<LocalizationOverlayApplyResult, Error> {
  let output = key.output_path.clone();
  write_inner(plan, key, resolutions).map_err(|error| match error {
    Error::Io(error) => Error::io_context("save compatibility files beside", &output, error),
    error => error,
  })
}

fn write_inner(
  plan: &LocalizationOverlayPlan,
  key: LocalizationOverlayPlanKey,
  resolutions: &[LocalizationResolution],
) -> Result<LocalizationOverlayApplyResult, Error> {
  let output = &key.output_path;
  let parent = output
    .parent()
    .ok_or_else(|| Error::InvalidInput("Overlay has no parent directory".into()))?
    .to_path_buf();
  fs::create_dir_all(&parent)?;
  let staged = tempfile::NamedTempFile::new_in(&parent)?;
  let mut result = plan.write(staged.path(), resolutions)?;
  if result.has_overlay {
    staged.as_file().sync_all()?;
    staged
      .persist(output)
      .map_err(|error| Error::Io(error.error))?;
    result.output_path = Some(output.display().to_string());
  } else if output.is_file() {
    fs::remove_file(output)?;
  }
  let receipt = OverlayReceipt {
    revision: REPAIR_REVISION,
    overlay_hash: digest(output)?,
    key,
    resolutions: resolutions.to_vec(),
    repairs: plan.analysis.asset_repairs.clone(),
    warnings: plan.analysis.asset_warnings.clone(),
    data_repairs: result.data_repairs.clone(),
    data_warnings: result.data_warnings.clone(),
    baselines: plan.analysis.baselines.clone(),
  };
  let mut staged_receipt = tempfile::NamedTempFile::new_in(&parent)?;
  serde_json::to_writer_pretty(staged_receipt.as_file_mut(), &receipt).map_err(|error| {
    Error::ModInvalid(format!("Failed to record overlay compatibility: {error}"))
  })?;
  staged_receipt.as_file_mut().flush()?;
  staged_receipt.as_file().sync_all()?;
  staged_receipt
    .persist(path(&receipt.key.output_path))
    .map_err(|error| Error::Io(error.error))?;
  receipt.log_status("saved");
  Ok(result)
}

pub(super) fn remove(overlay: &Path) -> Result<(), Error> {
  for path in [overlay.to_path_buf(), path(overlay)] {
    match fs::remove_file(&path) {
      Ok(()) => {}
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
      Err(error) => return Err(Error::io_context("remove compatibility file", &path, error)),
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::localization_overlay::{LocalizationModInput, OVERLAY_VPK_NAME};

  fn key(root: &Path) -> LocalizationOverlayPlanKey {
    LocalizationOverlayPlanKey {
      output_path: root.join(OVERLAY_VPK_NAME),
      input_warnings: Vec::new(),
      history_digest: None,
      compatibility_mod_ids: Default::default(),
      base_game: Vec::new(),
      mods: Vec::new(),
    }
  }

  #[test]
  fn receipts_require_matching_inputs_revision_and_overlay_bytes() {
    let temp = tempfile::tempdir().unwrap();
    let key = key(temp.path());
    fs::write(&key.output_path, b"overlay").unwrap();
    assert!(load(&key.output_path).unwrap().is_none());
    let mut receipt = OverlayReceipt {
      revision: REPAIR_REVISION,
      overlay_hash: digest(&key.output_path).unwrap(),
      key: key.clone(),
      resolutions: Vec::new(),
      repairs: Vec::new(),
      warnings: Vec::new(),
      data_repairs: Vec::new(),
      data_warnings: Vec::new(),
      baselines: Vec::new(),
    };
    assert!(receipt.is_current(&key).unwrap());
    let mut changed = key.clone();
    changed.mods.push(("new-mod".into(), Vec::new()));
    assert!(!receipt.is_current(&changed).unwrap());
    fs::write(&key.output_path, b"corrupt").unwrap();
    assert!(!receipt.is_current(&key).unwrap());
    receipt.revision += 1;
    fs::write(
      path(&key.output_path),
      serde_json::to_vec(&receipt).unwrap(),
    )
    .unwrap();
    assert!(load(&key.output_path).unwrap().is_none());
    fs::write(path(&key.output_path), b"partial json").unwrap();
    assert!(load(&key.output_path).unwrap().is_none());
  }

  #[test]
  fn empty_plan_removes_old_overlay_and_records_a_current_receipt() {
    let temp = tempfile::tempdir().unwrap();
    let key = key(temp.path());
    fs::write(&key.output_path, b"stale").unwrap();
    let plan =
      LocalizationOverlayPlan::build(temp.path(), &Vec::<LocalizationModInput>::new()).unwrap();
    let result = write(&plan, key.clone(), &[]).unwrap();
    assert!(!result.has_overlay);
    assert!(!key.output_path.exists());
    assert!(
      load(&key.output_path)
        .unwrap()
        .unwrap()
        .is_current(&key)
        .unwrap()
    );
    remove(&key.output_path).unwrap();
    assert!(!path(&key.output_path).exists());
  }
}
