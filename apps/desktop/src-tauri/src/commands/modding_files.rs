use super::modding_workspace::{ModdingHierarchy, contained, relative, resolve};
use crate::app_runtime::AppHandle;
use crate::errors::Error;
use base64::Engine;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileAction {
  CreateFile,
  CreateFolder,
  Rename,
  Delete,
}

fn rename_file(root: &Path, path: &str, destination: &str) -> Result<(), Error> {
  relative(path, false)?;
  relative(destination, false)?;
  let source = contained(root, path)?;
  let target = contained(root, destination)?;
  if target.starts_with(&source) {
    return Err(Error::InvalidInput(
      "A folder cannot be moved inside itself".into(),
    ));
  }
  if target.symlink_metadata().is_ok() {
    return Err(Error::InvalidInput("The destination already exists".into()));
  }
  std::fs::rename(source, target)?;
  Ok(())
}

#[tauri::command]
pub async fn change_modding_file(
  app: AppHandle,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  path: String,
  action: FileAction,
  destination: Option<String>,
) -> Result<(), Error> {
  relative(&path, false)?;
  let root = resolve(&app, &addon_id)?.root(hierarchy);
  tauri::async_runtime::spawn_blocking(move || {
    std::fs::create_dir_all(&root)?;
    let source = contained(&root, &path)?;
    match action {
      FileAction::CreateFile => {
        std::fs::OpenOptions::new()
          .write(true)
          .create_new(true)
          .open(source)?;
      }
      FileAction::CreateFolder => std::fs::create_dir(source)?,
      FileAction::Delete => {
        if source.is_dir() {
          std::fs::remove_dir(source)?;
        } else {
          std::fs::remove_file(source)?;
        }
      }
      FileAction::Rename => {
        let destination =
          destination.ok_or_else(|| Error::InvalidInput("A new file name is required".into()))?;
        rename_file(&root, &path, &destination)?;
      }
    }
    if matches!(hierarchy, ModdingHierarchy::Content) {
      super::modding_image_compiler::sync(&root)?;
    }
    Ok(())
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

#[tauri::command]
pub async fn preview_modding_image(
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
        "This image exceeds the 64 MB preview limit".into(),
      ));
    }
    let data = std::fs::read(&file)?;
    let png = if path.ends_with(".vtex_c") {
      source2_model::decode_texture_png_bytes(data)
        .map_err(|e| Error::InvalidInput(e.to_string()))?
        .png
    } else {
      let mut reader = image::ImageReader::new(std::io::Cursor::new(data)).with_guessed_format()?;
      let mut limits = image::Limits::default();
      limits.max_alloc = Some(128 * 1024 * 1024);
      reader.limits(limits);
      let image = reader
        .decode()
        .map_err(|e| Error::InvalidInput(e.to_string()))?;
      let image = if image.width() > 4096 || image.height() > 4096 {
        image.thumbnail(4096, 4096)
      } else {
        image
      };
      let mut output = std::io::Cursor::new(Vec::new());
      image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|e| Error::InvalidInput(e.to_string()))?;
      output.into_inner()
    };
    Ok(format!(
      "data:image/png;base64,{}",
      base64::engine::general_purpose::STANDARD.encode(png)
    ))
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

#[tauri::command]
pub async fn open_modding_blender(
  app: AppHandle,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  path: String,
) -> Result<super::modding_blender::BlenderAddonStatus, Error> {
  relative(&path, false)?;
  let addon = resolve(&app, &addon_id)?;
  let status = super::modding_blender::inspect_modding_blender(app.clone()).await?;
  if !status.ready {
    return Ok(status);
  }
  let config = super::modding_tools::get_modding_tools_config(app.clone())?;
  let root = app.path().app_data_dir()?.join("tools/blender-exports");
  tauri::async_runtime::spawn_blocking(move || {
    std::fs::create_dir_all(root.clone())?;
    let temporary = tempfile::tempdir_in(root)?;
    let model = if path.to_ascii_lowercase().ends_with(".dmx") {
      let source = contained(&addon.root(hierarchy), &path)?;
      if !source.is_file() {
        return Err(Error::InvalidInput("The DMX file does not exist".into()));
      }
      source.canonicalize()?
    } else if path.ends_with(".vmdl") || path.ends_with(".vmdl_c") || path.ends_with(".vmesh_c") {
      let entry = if path.ends_with("_c") {
        path.clone()
      } else {
        format!("{path}_c")
      };
      let archive = source2_model::vpk_extract::VpkArchive::open_with_overlay(
        Path::new(&addon.archive_path),
        Some(Path::new(&addon.game_path)),
      )
      .map_err(|e| Error::InvalidInput(e.to_string()))?;
      let decoded = source2_model::decode_model_glb_from_archive(&archive, &entry)
        .map_err(|e| Error::InvalidInput(e.to_string()))?;
      let output = temporary.path().join("model.glb");
      std::fs::write(&output, decoded.glb)?;
      output
    } else {
      return Err(Error::InvalidInput(
        "Open in Blender supports DMX, compiled models, and ModelDoc sources".into(),
      ));
    };
    let script = temporary.path().join("import_model.py");
    std::fs::write(&script, include_str!("modding_blender.py"))?;
    let source_path = path.strip_suffix("_c").unwrap_or(&path);
    let content_root = Path::new(&addon.content_path);
    std::fs::create_dir_all(content_root)?;
    let source = contained(content_root, source_path)?;
    let export_directory = source
      .parent()
      .ok_or_else(|| Error::InvalidInput("The model has no parent directory".into()))?;
    std::fs::create_dir_all(export_directory)?;
    let export_directory = export_directory.canonicalize()?;
    let executable = if config.blender.is_empty() {
      PathBuf::from("blender")
    } else {
      PathBuf::from(config.blender)
    };
    let mut child = std::process::Command::new(executable)
      .arg("--python")
      .arg(script)
      .arg("--")
      .arg(model)
      .arg(export_directory)
      .spawn()?;
    std::thread::spawn(move || {
      let _ = child.wait();
      drop(temporary);
    });
    Ok(status)
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

#[cfg(test)]
mod file_move_tests {
  use super::*;
  #[test]
  fn moving_preserves_contents_and_rejects_collisions_and_escape() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    std::fs::create_dir(root.join("models")).unwrap();
    std::fs::create_dir(root.join("target")).unwrap();
    std::fs::write(root.join("models/source.dmx"), b"mesh").unwrap();
    rename_file(root, "models/source.dmx", "target/source.dmx").unwrap();
    assert!(!root.join("models/source.dmx").exists());
    assert_eq!(
      std::fs::read(root.join("target/source.dmx")).unwrap(),
      b"mesh"
    );
    std::fs::write(root.join("models/source.dmx"), b"keep").unwrap();
    assert!(rename_file(root, "target/source.dmx", "models/source.dmx").is_err());
    assert_eq!(
      std::fs::read(root.join("models/source.dmx")).unwrap(),
      b"keep"
    );
    assert!(rename_file(root, "target/source.dmx", "../outside.dmx").is_err());
    assert!(rename_file(root, "models", "models/inside").is_err());
  }
}
