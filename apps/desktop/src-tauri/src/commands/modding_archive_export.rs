use super::modding_archive::{ModdingAssetSelection, expand_selection};
use super::modding_import::{ModdingImportResult, publish_missing};
use super::modding_workspace::relative;
use crate::{app_runtime::AppHandle, errors::Error};
use source2_model::vpk_extract::VpkArchive;
use std::path::{Path, PathBuf};

fn extract_originals(archive: &VpkArchive, entries: &[String], output: &Path) -> Result<(), Error> {
  for entry in entries {
    let target = output.join(relative(entry, false)?);
    let bytes = archive
      .extract_entry_limited(entry, 256 * 1024 * 1024)
      .map_err(|error| Error::InvalidInput(format!("{entry}: {error}")))?;
    if let Some(parent) = target.parent() {
      std::fs::create_dir_all(parent)?;
    }
    std::fs::write(target, bytes)?;
  }
  Ok(())
}

#[tauri::command]
pub async fn export_modding_archive_files(
  app: AppHandle,
  archive_path: String,
  selections: Vec<ModdingAssetSelection>,
  destination: String,
  decompile: bool,
) -> Result<ModdingImportResult, Error> {
  let path = super::modding_archive::archive_path(Some(archive_path))?;
  let destination = PathBuf::from(destination);
  if !destination.is_absolute() || !destination.is_dir() {
    return Err(Error::InvalidInput(
      "Choose an existing export folder".into(),
    ));
  }
  let compiler = if decompile {
    let cli = super::modding_import::cli_path(&app)?;
    if !cli.is_file() {
      return Err(Error::InvalidInput(
        "Set up Source 2 Viewer in Workbench tools before decompiling".into(),
      ));
    }
    let config = super::modding_tools::get_modding_tools_config(app)?;
    Some((cli, PathBuf::from(config.prepared_sdk)))
  } else {
    None
  };
  tauri::async_runtime::spawn_blocking(move || {
    let archive = super::foundry::open_archive(&path, None)?;
    let entries = expand_selection(
      &selections,
      archive
        .entries_with_sizes()
        .map(|(path, _)| path.to_owned())
        .collect(),
    )?;
    let staging = tempfile::tempdir()?;
    if let Some((cli, sdk)) = compiler {
      let (compiled, original): (Vec<_>, Vec<_>) =
        entries.into_iter().partition(|entry| entry.ends_with("_c"));
      extract_originals(&archive, &original, staging.path())?;
      for batch in compiled.chunks(32) {
        super::modding_import::decompile(&cli, &sdk, &path, batch, staging.path())?;
      }
      super::modding_housekeeping::normalize_particles(staging.path())?;
    } else {
      extract_originals(&archive, &entries, staging.path())?;
    }
    publish_missing(staging.path(), &destination)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;

  fn fixture(path: &Path, payload: &[u8]) {
    let mut tree = b"txt\0folder/nested\0sample\0".to_vec();
    tree.extend(0u32.to_le_bytes());
    tree.extend(0u16.to_le_bytes());
    tree.extend(0x7fffu16.to_le_bytes());
    tree.extend(0u32.to_le_bytes());
    tree.extend(u32::try_from(payload.len()).unwrap().to_le_bytes());
    tree.extend(0xffffu16.to_le_bytes());
    tree.extend(b"\0\0\0");
    let mut bytes = 0x55aa1234u32.to_le_bytes().to_vec();
    bytes.extend(1u32.to_le_bytes());
    bytes.extend(u32::try_from(tree.len()).unwrap().to_le_bytes());
    bytes.extend(tree);
    bytes.extend(payload);
    std::fs::write(path, bytes).unwrap();
  }

  #[test]
  fn exports_selected_archive_with_paths_and_preserves_existing_edits() {
    let root = tempfile::tempdir().unwrap();
    let first = root.path().join("first.vpk");
    let second = root.path().join("second.vpk");
    fixture(&first, b"first archive");
    fixture(&second, b"second archive");
    let archive = VpkArchive::open(&second).unwrap();
    let entries = expand_selection(
      &[ModdingAssetSelection {
        path: "folder".into(),
        directory: true,
        selected: true,
      }],
      archive.list_entries(),
    )
    .unwrap();
    let staging = tempfile::tempdir().unwrap();
    extract_originals(&archive, &entries, staging.path()).unwrap();
    let output = tempfile::tempdir().unwrap();
    let result = publish_missing(staging.path(), output.path()).unwrap();
    assert_eq!(result.created, 1);
    let exported = output.path().join("folder/nested/sample.txt");
    assert_eq!(std::fs::read(&exported).unwrap(), b"second archive");
    std::fs::write(&exported, b"my edit").unwrap();
    let result = publish_missing(staging.path(), output.path()).unwrap();
    assert_eq!(result.created, 0);
    assert_eq!(result.preserved, 1);
    assert_eq!(std::fs::read(&exported).unwrap(), b"my edit");
    assert_eq!(
      VpkArchive::open(&first)
        .unwrap()
        .extract_entry("folder/nested/sample.txt")
        .unwrap(),
      b"first archive"
    );
    assert_eq!(
      archive.extract_entry("folder/nested/sample.txt").unwrap(),
      b"second archive"
    );
  }

  #[test]
  fn rejects_traversal_before_extracting() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("source.vpk");
    fixture(&path, b"payload");
    let archive = VpkArchive::open(&path).unwrap();
    let staging = tempfile::tempdir().unwrap();
    assert!(extract_originals(&archive, &["../outside.txt".into()], staging.path()).is_err());
    assert_eq!(std::fs::read_dir(staging.path()).unwrap().count(), 0);
  }
}
