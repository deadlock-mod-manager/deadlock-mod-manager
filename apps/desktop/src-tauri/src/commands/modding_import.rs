use std::collections::BTreeSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;
use tauri::Manager;
use ts_rs::TS;

use super::modding_workspace::{contained, relative, resolve};
use crate::app_runtime::AppHandle;
use crate::errors::Error;

static IMPORT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingImportResult {
  pub created: usize,
  pub preserved: usize,
}

pub(super) fn cli_path(app: &AppHandle) -> Result<PathBuf, Error> {
  Ok(
    app
      .path()
      .app_data_dir()?
      .join("tools/source2viewer-cli-20.1")
      .join(if cfg!(windows) {
        "Source2Viewer-CLI.exe"
      } else {
        "Source2Viewer-CLI"
      }),
  )
}

pub(super) fn decompile(
  cli: &Path,
  sdk: &Path,
  archive: &Path,
  entries: &[String],
  output: &Path,
) -> Result<(), Error> {
  for entry in entries {
    relative(entry, false)?;
  }
  let staging = tempfile::tempdir()?;
  let log = tempfile::NamedTempFile::new()?;
  let log_file = log.reopen()?;
  let mut command = std::process::Command::new(cli);
  command
    .arg("--input")
    .arg(archive)
    .arg("--output")
    .arg(staging.path())
    .arg("--vpk_filepath")
    .arg(entries.join(","))
    .arg("--decompile");
  let gameinfo = sdk.join("game/citadel/gameinfo.gi");
  if gameinfo.is_file() {
    command.arg("--game").arg(gameinfo);
  }
  let status = command
    .stdin(Stdio::null())
    .stdout(log_file.try_clone()?)
    .stderr(log_file)
    .status()?;
  if !status.success() || std::fs::read_dir(staging.path())?.next().is_none() {
    let log = std::fs::read_to_string(log.path()).unwrap_or_default();
    let detail: String = log
      .chars()
      .rev()
      .take(2000)
      .collect::<String>()
      .chars()
      .rev()
      .collect();
    return Err(Error::InvalidInput(format!(
      "Source 2 Viewer could not export {} assets ({status}): {detail}",
      entries.len()
    )));
  }
  publish_missing(staging.path(), output)?;
  Ok(())
}

pub(super) fn publish_missing(
  staging: &Path,
  destination: &Path,
) -> Result<ModdingImportResult, Error> {
  std::fs::create_dir_all(destination)?;
  let mut result = ModdingImportResult {
    created: 0,
    preserved: 0,
  };
  let mut pending = vec![staging.to_path_buf()];
  while let Some(directory) = pending.pop() {
    for entry in std::fs::read_dir(directory)? {
      let entry = entry?;
      let kind = entry.file_type()?;
      if kind.is_dir() {
        pending.push(entry.path());
        continue;
      }
      if !kind.is_file() {
        continue;
      }
      let entry_path = entry.path();
      let relative_path = entry_path
        .strip_prefix(staging)
        .map_err(|e| Error::InvalidInput(e.to_string()))?
        .to_string_lossy()
        .replace('\\', "/");
      let target = contained(destination, &relative_path)?;
      let parent = target
        .parent()
        .ok_or_else(|| Error::InvalidInput("Missing destination directory".into()))?;
      std::fs::create_dir_all(parent)?;
      let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
      let mut input = std::fs::File::open(entry.path())?;
      std::io::copy(&mut input, &mut temporary)?;
      temporary.flush()?;
      match temporary.persist_noclobber(target) {
        Ok(_) => result.created += 1,
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
          result.preserved += 1
        }
        Err(error) => return Err(error.error.into()),
      }
    }
  }
  Ok(result)
}

pub(super) fn export_skeletons(
  cli: &Path,
  sdk: &Path,
  archive: &Path,
  skeletons: &[String],
  source_root: &Path,
) -> Result<(), Error> {
  let staging = tempfile::tempdir()?;
  for chunk in skeletons.chunks(32) {
    decompile(cli, sdk, archive, chunk, staging.path())?;
  }
  publish_missing(staging.path(), source_root)?;
  Ok(())
}

#[tauri::command]
pub async fn import_modding_files(
  app: AppHandle,
  addon_id: String,
  selections: Vec<super::modding_archive::ModdingAssetSelection>,
) -> Result<ModdingImportResult, Error> {
  let addon = resolve(&app, &addon_id)?;
  let cli = cli_path(&app)?;
  let config = super::modding_tools::get_modding_tools_config(app)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = IMPORT_LOCK
      .lock()
      .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
    let sdk = PathBuf::from(config.prepared_sdk);
    let archive_path = PathBuf::from(addon.archive_path);
    let core = source2_model::vpk_extract::VpkArchive::open(&sdk.join("game/core/pak01_dir.vpk"))
      .map_err(|e| Error::InvalidInput(e.to_string()))?;
    let archive = source2_model::vpk_extract::VpkArchive::open(&archive_path)
      .map_err(|e| Error::InvalidInput(e.to_string()))?
      .with_fallbacks(vec![std::sync::Arc::new(core)]);
    let entries = super::modding_archive::expand_selection(&selections, archive.list_entries())?;
    let content = tempfile::tempdir()?;
    let game = tempfile::tempdir()?;
    let mut skeletons = BTreeSet::new();
    let mut compiled_entries = Vec::new();
    for entry in &entries {
      if entry.ends_with("_c") {
        skeletons.extend(super::modding_dependencies::stage_dependencies(
          &archive,
          entry,
          game.path(),
        )?);
        compiled_entries.push(entry.clone());
      } else {
        let data = archive
          .extract_entry_limited(entry, 256 * 1024 * 1024)
          .map_err(|e| Error::InvalidInput(e.to_string()))?;
        for root in [content.path(), game.path()] {
          let target = root.join(entry);
          std::fs::create_dir_all(
            target
              .parent()
              .ok_or_else(|| Error::InvalidInput("Missing export parent".into()))?,
          )?;
          std::fs::write(target, &data)?;
        }
      }
    }
    for chunk in compiled_entries.chunks(32) {
      decompile(&cli, &sdk, &archive_path, chunk, content.path())?;
    }
    for entry in compiled_entries
      .iter()
      .filter(|entry| entry.ends_with(".vmdl_c"))
    {
      let output = content.path().join(entry.trim_end_matches("_c"));
      let text = source2_tools::modeldoc_preview_entity(&std::fs::read_to_string(&output)?)
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
      std::fs::write(output, text)?;
    }
    export_skeletons(
      &cli,
      &sdk,
      &archive_path,
      &skeletons.into_iter().collect::<Vec<_>>(),
      content.path(),
    )?;
    super::modding_housekeeping::normalize_particles(content.path())?;
    let sources = publish_missing(content.path(), Path::new(&addon.content_path))?;
    publish_missing(game.path(), Path::new(&addon.game_path))?;
    super::modding_image_compiler::sync(Path::new(&addon.content_path))?;
    Ok(ModdingImportResult {
      created: sources.created,
      preserved: sources.preserved,
    })
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn imports_preserve_paths_and_existing_edits() {
    let staging = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(staging.path().join("models/hero")).unwrap();
    std::fs::write(staging.path().join("models/hero/body.vmdl"), b"original").unwrap();
    assert_eq!(
      publish_missing(staging.path(), target.path())
        .unwrap()
        .created,
      1
    );
    std::fs::write(target.path().join("models/hero/body.vmdl"), b"edited").unwrap();
    assert_eq!(
      publish_missing(staging.path(), target.path())
        .unwrap()
        .preserved,
      1
    );
    assert_eq!(
      std::fs::read(target.path().join("models/hero/body.vmdl")).unwrap(),
      b"edited"
    );
  }
}
