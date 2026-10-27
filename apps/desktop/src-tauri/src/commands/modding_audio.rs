use base64::Engine;
use std::path::Path;

use super::modding_workspace::{ModdingHierarchy, contained, resolve};
use crate::app_runtime::AppHandle;
use crate::errors::Error;

fn swap_audio_contents(target: &Path, source: &Path) -> Result<(), Error> {
  let extension = target
    .extension()
    .and_then(|ext| ext.to_str())
    .unwrap_or("");
  if !["mp3", "wav", "ogg", "flac", "m4a", "aac"]
    .iter()
    .any(|supported| extension.eq_ignore_ascii_case(supported))
  {
    return Err(Error::InvalidInput(
      "Select an uncompiled audio file to swap its contents".into(),
    ));
  }
  if !source
    .extension()
    .and_then(|ext| ext.to_str())
    .is_some_and(|ext| ext.eq_ignore_ascii_case(extension))
  {
    return Err(Error::InvalidInput(format!(
      "Choose a replacement in the same audio format (.{extension})"
    )));
  }
  let target_metadata = std::fs::metadata(target)?;
  let mut input = std::fs::File::open(source)?;
  let source_metadata = input.metadata()?;
  if !target_metadata.is_file() || !source_metadata.is_file() || source_metadata.len() == 0 {
    return Err(Error::InvalidInput(
      "Both paths must be audio files, and the replacement must not be empty".into(),
    ));
  }
  if target.canonicalize()? == source.canonicalize()? {
    return Ok(());
  }
  let mut replacement = tempfile::NamedTempFile::new_in(
    target
      .parent()
      .ok_or_else(|| Error::InvalidInput("Audio file has no parent folder".into()))?,
  )?;
  std::io::copy(&mut input, &mut replacement)?;
  replacement
    .as_file()
    .set_permissions(target_metadata.permissions())?;
  replacement.as_file().sync_all()?;
  drop(input);
  replacement.persist(target).map_err(|error| error.error)?;
  Ok(())
}

#[tauri::command]
pub async fn swap_modding_audio(
  app: AppHandle,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  path: String,
  source_path: String,
) -> Result<(), Error> {
  let root = resolve(&app, &addon_id)?.root(hierarchy);
  tauri::async_runtime::spawn_blocking(move || {
    let target = contained(&root, &path)?;
    swap_audio_contents(&target, Path::new(&source_path))
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[tauri::command]
pub async fn preview_modding_audio(
  app: AppHandle,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  path: String,
) -> Result<String, Error> {
  let addon = super::modding_local::resolve_read(&app, &addon_id)?;
  let file = contained(&addon.root(hierarchy), &path)?;
  tauri::async_runtime::spawn_blocking(move || {
    if std::fs::metadata(&file)?.len() > 64 * 1024 * 1024 {
      return Err(Error::InvalidInput(
        "This audio file exceeds the 64 MB preview limit".into(),
      ));
    }
    let data = std::fs::read(&file)?;
    let extension = file
      .extension()
      .and_then(|ext| ext.to_str())
      .unwrap_or("")
      .to_ascii_lowercase();
    let (mime, payload) = match extension.as_str() {
      "mp3" => ("audio/mpeg", data.as_slice()),
      "wav" => ("audio/wav", data.as_slice()),
      "ogg" => ("audio/ogg", data.as_slice()),
      "flac" => ("audio/flac", data.as_slice()),
      "m4a" => ("audio/mp4", data.as_slice()),
      "aac" => ("audio/aac", data.as_slice()),
      "vsnd_c" => (
        "audio/mpeg",
        super::foundry::find_mp3_payload(&data).ok_or_else(|| {
          Error::InvalidInput("This compiled sound does not contain a playable MP3 payload".into())
        })?,
      ),
      _ => {
        return Err(Error::InvalidInput(
          "Unsupported audio preview format".into(),
        ));
      }
    };
    Ok(format!(
      "data:{mime};base64,{}",
      base64::engine::general_purpose::STANDARD.encode(payload)
    ))
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn swap_keeps_the_addon_name_and_leaves_the_donor_untouched() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join("original_sound.mp3");
    let source = directory.path().join("replacement.MP3");
    std::fs::write(&target, b"old audio").unwrap();
    std::fs::write(&source, b"new audio contents").unwrap();

    swap_audio_contents(&target, &source).unwrap();

    assert_eq!(std::fs::read(&target).unwrap(), b"new audio contents");
    assert_eq!(std::fs::read(&source).unwrap(), b"new audio contents");
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 2);
    swap_audio_contents(&target, &target).unwrap();
    assert_eq!(std::fs::read(&target).unwrap(), b"new audio contents");
  }

  #[test]
  fn invalid_replacements_preserve_the_original() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join("original.mp3");
    std::fs::write(&target, b"original audio").unwrap();
    let wrong_format = directory.path().join("wrong.wav");
    std::fs::write(&wrong_format, b"wav audio").unwrap();
    let empty = directory.path().join("empty.mp3");
    std::fs::write(&empty, b"").unwrap();
    for source in [wrong_format, empty, directory.path().join("missing.mp3")] {
      assert!(swap_audio_contents(&target, &source).is_err());
      assert_eq!(std::fs::read(&target).unwrap(), b"original audio");
    }
    let compiled = directory.path().join("sound.vsnd_c");
    std::fs::write(&compiled, b"compiled sound").unwrap();
    assert!(swap_audio_contents(&compiled, &target).is_err());
    assert_eq!(std::fs::read(&compiled).unwrap(), b"compiled sound");
  }
}
