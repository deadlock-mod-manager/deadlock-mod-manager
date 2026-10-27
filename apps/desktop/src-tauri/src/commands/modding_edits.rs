use super::modding_workspace::{contained, relative};
use crate::errors::Error;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, io::Write, path::Path};
pub(super) static EDIT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
pub(super) fn fingerprint(bytes: &[u8]) -> String {
  format!("{:x}", Sha256::digest(bytes))
}
pub(super) struct Edit {
  pub from: String,
  pub to: String,
  pub bytes: Vec<u8>,
}
#[derive(Serialize, Deserialize)]
struct SavedEdit {
  from: String,
  to: String,
  digest: String,
}
pub(super) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), Error> {
  let parent = path
    .parent()
    .ok_or_else(|| Error::InvalidInput("Missing parent folder".into()))?;
  std::fs::create_dir_all(parent)?;
  let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
  temporary.write_all(bytes)?;
  temporary.as_file().sync_all()?;
  temporary.persist(path).map_err(|error| error.error)?;
  Ok(())
}
pub(super) fn commit(root: &Path, edits: Vec<Edit>) -> Result<String, Error> {
  if edits.is_empty() || edits.len() > 8192 {
    return Err(Error::InvalidInput(
      "Select between 1 and 8192 files".into(),
    ));
  }
  if edits
    .iter()
    .try_fold(0usize, |size, edit| size.checked_add(edit.bytes.len()))
    .is_none_or(|size| size > 512 * 1024 * 1024)
  {
    return Err(Error::InvalidInput(
      "A reversible edit is limited to 512 MB; select a smaller batch".into(),
    ));
  }
  let sources: BTreeSet<_> = edits.iter().map(|edit| edit.from.as_str()).collect();
  let mut targets = BTreeSet::new();
  for edit in &edits {
    relative(&edit.from, false)?;
    relative(&edit.to, false)?;
    let source = contained(root, &edit.from)?;
    let target = contained(root, &edit.to)?;
    if !source.is_file()
      || !targets.insert(edit.to.to_lowercase())
      || (target.exists() && !sources.contains(edit.to.as_str()))
    {
      return Err(Error::InvalidInput(format!(
        "Missing source or conflicting destination: {} → {}",
        edit.from, edit.to
      )));
    }
  }
  if sources.len() != edits.len() {
    return Err(Error::InvalidInput("Duplicate edit targets".into()));
  }
  let history_root = contained(root, ".dmm-history")?;
  std::fs::create_dir_all(&history_root)?;
  let temporary = tempfile::Builder::new()
    .prefix("edit-")
    .tempdir_in(&history_root)?;
  let id = temporary
    .path()
    .file_name()
    .unwrap()
    .to_string_lossy()
    .into_owned();
  let history = temporary.keep();
  let mut journal = Vec::new();
  for (index, edit) in edits.iter().enumerate() {
    std::fs::copy(
      contained(root, &edit.from)?,
      history.join(index.to_string()),
    )?;
    journal.push(SavedEdit {
      from: edit.from.clone(),
      to: edit.to.clone(),
      digest: fingerprint(&edit.bytes),
    });
  }
  std::fs::write(
    history.join("edits.json"),
    serde_json::to_vec(&journal).map_err(|error| Error::InvalidInput(error.to_string()))?,
  )?;
  let result = (|| {
    for edit in &edits {
      std::fs::remove_file(contained(root, &edit.from)?)?;
    }
    for (index, edit) in edits.iter().enumerate() {
      let target = contained(root, &edit.to)?;
      write_atomic(&target, &edit.bytes)?;
      std::fs::set_permissions(
        target,
        std::fs::metadata(history.join(index.to_string()))?.permissions(),
      )?;
    }
    Ok::<_, Error>(())
  })();
  if let Err(error) = result {
    let rollback = (|| {
      for edit in &edits {
        let target = contained(root, &edit.to)?;
        if target.is_file() {
          std::fs::remove_file(target)?;
        }
      }
      for (index, edit) in edits.iter().enumerate() {
        write_atomic(
          &contained(root, &edit.from)?,
          &std::fs::read(history.join(index.to_string()))?,
        )?;
      }
      Ok::<_, Error>(())
    })();
    if let Err(rollback) = rollback {
      return Err(Error::InvalidInput(format!(
        "{error}; rollback failed: {rollback}. Originals are saved at {}",
        history.display()
      )));
    }
    return Err(error);
  }
  Ok(id)
}
pub(super) fn undo(root: &Path, id: &str) -> Result<(), Error> {
  if !id.starts_with("edit-")
    || !id
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
  {
    return Err(Error::InvalidInput("Invalid backup id".into()));
  }
  let history = contained(root, &format!(".dmm-history/{id}"))?;
  let journal: Vec<SavedEdit> = serde_json::from_slice(&std::fs::read(history.join("edits.json"))?)
    .map_err(|error| Error::InvalidInput(error.to_string()))?;
  let mut edits = Vec::new();
  for (index, edit) in journal.iter().enumerate() {
    if fingerprint(&std::fs::read(contained(root, &edit.to)?)?) != edit.digest {
      return Err(Error::InvalidInput(format!(
        "{} changed after this operation; restore the backup manually to keep newer edits",
        edit.to
      )));
    }
    edits.push(Edit {
      from: edit.to.clone(),
      to: edit.from.clone(),
      bytes: std::fs::read(history.join(index.to_string()))?,
    });
  }
  commit(root, edits)?;
  Ok(())
}
#[tauri::command]
pub async fn undo_modding_edit(
  app: crate::app_runtime::AppHandle,
  addon_id: String,
  hierarchy: super::modding_workspace::ModdingHierarchy,
  backup_id: String,
) -> Result<(), Error> {
  let root = super::modding_workspace::resolve(&app, &addon_id)?.root(hierarchy);
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = EDIT_LOCK
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
    undo(&root, &backup_id)?;
    if matches!(
      hierarchy,
      super::modding_workspace::ModdingHierarchy::Content
    ) {
      super::modding_image_compiler::sync(&root)?;
    }
    Ok(())
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn edits_round_trip_and_do_not_overwrite_newer_changes() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("one.txt"), b"before").unwrap();
    let id = commit(
      root.path(),
      vec![Edit {
        from: "one.txt".into(),
        to: "folder/two.txt".into(),
        bytes: b"after".to_vec(),
      }],
    )
    .unwrap();
    assert!(!root.path().join("one.txt").exists());
    undo(root.path(), &id).unwrap();
    assert_eq!(
      std::fs::read(root.path().join("one.txt")).unwrap(),
      b"before"
    );
    let id = commit(
      root.path(),
      vec![Edit {
        from: "one.txt".into(),
        to: "one.txt".into(),
        bytes: b"after".to_vec(),
      }],
    )
    .unwrap();
    std::fs::write(root.path().join("one.txt"), b"newer edit").unwrap();
    assert!(undo(root.path(), &id).is_err());
  }
}
