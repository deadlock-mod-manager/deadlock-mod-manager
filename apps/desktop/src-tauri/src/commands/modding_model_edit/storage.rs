use super::*;
use std::{io::Read, path::PathBuf};

pub(super) const STATE: &str = ".dmm-model-editor/state.json";
#[derive(Clone, Default, Deserialize, Serialize)]
pub(super) struct Saved {
  pub version: u32,
  pub models: BTreeMap<String, Vec<ModdingModelPartEdit>>,
  pub resources: BTreeMap<String, ResourceState>,
}
#[derive(Clone, Deserialize, Serialize)]
pub(super) struct ResourceState {
  pub original: Option<String>,
  pub local: bool,
  pub applied: String,
  #[serde(default)]
  pub input: Option<String>,
}
pub(super) fn read(path: &Path) -> Result<Vec<u8>, Error> {
  let mut bytes = Vec::new();
  std::fs::File::open(path)?
    .take(256 * 1024 * 1024 + 1)
    .read_to_end(&mut bytes)?;
  if bytes.len() > 256 * 1024 * 1024 {
    return Err(invalid("Model edit input exceeds 256 MB"));
  }
  Ok(bytes)
}
pub(super) fn load(addon: &ModdingAddon) -> Result<Saved, Error> {
  let path = contained(Path::new(&addon.content_path), STATE)?;
  if !path.exists() {
    return Ok(Saved {
      version: 1,
      ..Default::default()
    });
  }
  if path.metadata()?.len() > 1024 * 1024 {
    return Err(invalid("Model edit manifest exceeds 1 MB"));
  }
  let saved: Saved = serde_json::from_slice(&read(&path)?).map_err(|e| invalid(e.to_string()))?;
  if saved.version != 1 || saved.models.len() > 256 || saved.resources.len() > 2048 {
    return Err(invalid("Unsupported model edit manifest"));
  }
  for (model, edits) in &saved.models {
    validate_model_path(model)?;
    validate_edits(edits)?;
  }
  for path in saved.resources.keys() {
    relative(path, false)?;
  }
  Ok(saved)
}
pub(super) fn original_path(addon: &ModdingAddon, path: &str) -> Result<PathBuf, Error> {
  contained(
    Path::new(&addon.content_path),
    &format!(".dmm-model-editor/originals/{path}"),
  )
}
pub(super) fn original(
  addon: &ModdingAddon,
  saved: &Saved,
  archive: &VpkArchive,
  path: &str,
) -> Result<Vec<u8>, Error> {
  relative(path, false)?;
  if let Some(digest) = saved.resources.get(path).and_then(|r| r.original.as_ref()) {
    let bytes = read(&original_path(addon, path)?)?;
    if fingerprint(&bytes) != *digest {
      return Err(invalid(format!("Model edit original changed: {path}")));
    }
    return Ok(bytes);
  }
  archive
    .extract_entry_limited(path, 256 * 1024 * 1024)
    .map_err(|e| invalid(e.to_string()))
}
pub(super) fn verify(addon: &ModdingAddon, saved: &Saved) -> Result<(), Error> {
  for (path, resource) in &saved.resources {
    let target = contained(Path::new(&addon.game_path), path)?;
    if !target.is_file() || fingerprint(&read(&target)?) != resource.applied {
      return Err(invalid(format!(
        "{path} changed outside the model editor. Compile the addon to refresh its model-edit baseline before saving."
      )));
    }
  }
  Ok(())
}

/// Keep all originals in the addon; publish the manifest last and roll back ordinary I/O failures.
pub(super) fn write_transaction(files: BTreeMap<PathBuf, Option<Vec<u8>>>) -> Result<(), Error> {
  let mut size = 0usize;
  let mut previous = Vec::new();
  let mut ordered = Vec::new();
  for (path, bytes) in &files {
    let old = if path.is_file() {
      Some(read(path)?)
    } else {
      None
    };
    if old.as_ref() == bytes.as_ref() {
      continue;
    }
    size = size
      .saturating_add(bytes.as_ref().map_or(0, Vec::len))
      .saturating_add(old.as_ref().map_or(0, Vec::len));
    if size > 512 * 1024 * 1024 {
      return Err(invalid(
        "Model edit transaction exceeds 512 MB; edit a smaller model",
      ));
    }
    previous.push((path, old));
    ordered.push((path, bytes));
  }
  let publish = |path: &Path, bytes: &Option<Vec<u8>>| -> Result<(), Error> {
    match bytes {
      Some(bytes) => super::super::modding_edits::write_atomic(path, bytes),
      None if path.exists() => Ok(std::fs::remove_file(path)?),
      None => Ok(()),
    }
  };
  ordered.sort_by_key(|(path, _)| path.ends_with(STATE));
  for (path, bytes) in ordered {
    if let Err(error) = publish(path, bytes) {
      for (path, bytes) in previous.iter().rev() {
        if let Err(rollback) = publish(path, bytes) {
          return Err(invalid(format!(
            "{error}; model edit rollback failed: {rollback}. Originals remain in .dmm-model-editor/originals"
          )));
        }
      }
      return Err(error);
    }
  }
  Ok(())
}

pub(super) fn baseline_archive(
  addon: &ModdingAddon,
  current: Arc<VpkArchive>,
) -> Result<(tempfile::TempDir, VpkArchive), Error> {
  let directory = tempfile::tempdir()?;
  let index = directory.path().join("empty_dir.vpk");
  std::fs::write(&index, [0x34, 0x12, 0xaa, 0x55, 1, 0, 0, 0, 1, 0, 0, 0, 0])?;
  let overlay = directory.path().join("originals");
  std::fs::create_dir(&overlay)?;
  // Only active records shadow current files. Reset recipes may leave older backups behind.
  for (path, record) in load(addon)?.resources {
    if record.original.is_none() {
      continue;
    }
    let original = original_path(addon, &path)?;
    let data = read(&original)?;
    if Some(fingerprint(&data)) != record.original {
      return Err(invalid("Model edit original changed"));
    }
    let destination = overlay.join(relative(&path, false)?);
    std::fs::create_dir_all(
      destination
        .parent()
        .ok_or_else(|| invalid("Missing original parent"))?,
    )?;
    if std::fs::hard_link(&original, &destination).is_err() {
      std::fs::write(destination, data)?;
    }
  }
  let archive = VpkArchive::open_with_overlay(&index, Some(&overlay))
    .map_err(|e| invalid(e.to_string()))?
    .with_fallbacks(vec![current]);
  Ok((directory, archive))
}
