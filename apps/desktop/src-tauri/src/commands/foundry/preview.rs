//! Read-only mod browsing metadata and a bounded cache of rendered local thumbnails.

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;
use ts_rs::TS;

use super::analyze::analyze_vpk_path;
use super::game::{base_game_vpk_path, core_vpk_path, foundry_workspace_root};
use super::staging::{source_stamp, staged_base_game_vpk};
use super::types::{FoundryEntrySource, FoundryManifest};
use crate::errors::Error;
use crate::vpk_archive_cache::open_archive;

/// Bump when model decoding changes.
const PREVIEW_VERSION: &str = "dmm-mod-preview-4";
const MAX_THUMBNAILS: usize = 128;
const MAX_CACHE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_PNG_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ModPreviewInfo {
  pub identity: String,
  pub file_path: String,
  pub model_path: Option<String>,
  pub stock_file_path: Option<String>,
  pub hero: Option<String>,
  pub ambiguous_hero: bool,
  pub game_assets_available: bool,
}

fn mod_entries(manifest: &FoundryManifest) -> impl Iterator<Item = &super::types::FoundryEntry> {
  [
    &manifest.models,
    &manifest.textures,
    &manifest.materials,
    &manifest.cards,
    &manifest.sounds,
    &manifest.other,
  ]
  .into_iter()
  .flatten()
  .filter(|entry| entry.source == FoundryEntrySource::Mod)
}

pub(super) fn preview_identity(path: &Path) -> Result<String, Error> {
  identity_for(
    path,
    &[base_game_vpk_path()?, core_vpk_path()?],
    PREVIEW_VERSION,
  )
}

fn identity_for(
  path: &Path,
  game_archives: &[Option<PathBuf>],
  version: &str,
) -> Result<String, Error> {
  let mut hash = Sha256::new();
  hash.update(version);
  hash.update(source_stamp(path)?);
  for game in game_archives {
    match game {
      Some(path) => hash.update(source_stamp(path)?),
      None => hash.update(b"missing-game-archive"),
    }
  }
  Ok(format!("{:x}", hash.finalize()))
}

#[tauri::command]
pub async fn foundry_mod_preview_info(file_path: String) -> Result<ModPreviewInfo, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    let archive_error = |error: Error| match error {
      Error::Preview { .. } => error,
      _ => Error::Preview {
        kind: "previewCorruptArchive",
        message: error.to_string(),
      },
    };
    let identity = preview_identity(Path::new(&file_path)).map_err(archive_error)?;
    let manifest = analyze_vpk_path(Path::new(&file_path)).map_err(archive_error)?;
    let heroes = mod_entries(&manifest)
      .filter_map(|entry| {
        hero_parser::detect_hero_from_paths(std::slice::from_ref(&entry.path)).hero_display
      })
      .collect::<BTreeSet<_>>();
    let ambiguous_hero = heroes.len() > 1;
    let game_assets_available = base_game_vpk_path()?.is_some();
    let needs_base_character = !manifest
      .models
      .iter()
      .any(|entry| entry.path.ends_with(".vmdl_c") && !super::paint::is_weapon_path(&entry.path));
    let model_path = if ambiguous_hero
      || (!game_assets_available && needs_base_character && manifest.hero.is_some())
    {
      None
    } else {
      manifest.primary_model_path.clone()
    };
    let stock_file_path = if let Some(model_path) = &model_path {
      staged_base_game_vpk()?
        .filter(|path| {
          open_archive(path, None).is_ok_and(|archive| archive.contains_entry(model_path))
        })
        .map(|path| path.to_string_lossy().into_owned())
    } else {
      None
    };
    Ok(ModPreviewInfo {
      identity,
      file_path: manifest.file_path,
      model_path,
      stock_file_path,
      hero: if ambiguous_hero {
        None
      } else {
        manifest.hero_display.or(manifest.hero)
      },
      ambiguous_hero,
      game_assets_available,
    })
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

fn thumbnail_path(identity: &str) -> Result<PathBuf, Error> {
  if identity.len() != 64 || !identity.bytes().all(|byte| byte.is_ascii_hexdigit()) {
    return Err(Error::InvalidInput("Invalid preview cache identity".into()));
  }
  Ok(
    foundry_workspace_root()?
      .with_file_name("mod-preview-thumbnails")
      .join(format!("{identity}.png")),
  )
}

fn trim_cache(root: &Path) -> Result<(), Error> {
  let mut files = std::fs::read_dir(root)?
    .filter_map(Result::ok)
    .filter_map(|entry| {
      let metadata = entry.metadata().ok()?;
      (metadata.is_file()
        && entry
          .path()
          .extension()
          .is_some_and(|extension| extension == "png"))
      .then(|| {
        (
          entry.path(),
          metadata.len(),
          metadata.modified().unwrap_or(UNIX_EPOCH),
        )
      })
    })
    .collect::<Vec<_>>();
  files.sort_by_key(|(_, _, modified)| *modified);
  let mut bytes: u64 = files.iter().map(|(_, bytes, _)| *bytes).sum();
  let mut count = files.len();
  for (path, size, _) in files {
    if count <= MAX_THUMBNAILS && bytes <= MAX_CACHE_BYTES {
      break;
    }
    std::fs::remove_file(path)?;
    count -= 1;
    bytes -= size;
  }
  Ok(())
}

#[tauri::command]
pub async fn foundry_read_thumbnail(identity: String) -> Result<Option<String>, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    let path = thumbnail_path(&identity)?;
    if path.exists() && std::fs::metadata(&path)?.len() > MAX_PNG_BYTES as u64 {
      std::fs::remove_file(path)?;
      return Ok(None);
    }
    let bytes = match std::fs::read(&path) {
      Ok(bytes) => bytes,
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
      Err(error) => return Err(error.into()),
    };
    if !valid_thumbnail(&bytes) {
      std::fs::remove_file(path)?;
      return Ok(None);
    }
    Ok(Some(format!(
      "data:image/png;base64,{}",
      base64::engine::general_purpose::STANDARD.encode(bytes)
    )))
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

fn valid_thumbnail(bytes: &[u8]) -> bool {
  if bytes.len() > MAX_PNG_BYTES {
    return false;
  }
  let mut reader =
    image::ImageReader::with_format(std::io::Cursor::new(bytes), image::ImageFormat::Png);
  let mut limits = image::Limits::default();
  limits.max_image_width = Some(512);
  limits.max_image_height = Some(512);
  limits.max_alloc = Some(4 * 1024 * 1024);
  reader.limits(limits);
  let Ok(image) = reader.decode() else {
    return false;
  };
  let image = image.to_rgba8();
  let Some(first) = image.pixels().next() else {
    return false;
  };
  image.width() >= 32
    && image.height() >= 32
    && image
      .pixels()
      .filter(|pixel| pixel[3] > 16)
      .take(128)
      .count()
      == 128
    && image.pixels().any(|pixel| pixel[3] > 0 && pixel != first)
}

#[tauri::command]
pub async fn foundry_save_thumbnail(identity: String, png: String) -> Result<(), Error> {
  if png.len() > MAX_PNG_BYTES * 4 / 3 + 4 {
    return Err(Error::InvalidInput("Preview image is too large".into()));
  }
  tauri::async_runtime::spawn_blocking(move || {
    let bytes = base64::engine::general_purpose::STANDARD
      .decode(png)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    if !valid_thumbnail(&bytes) {
      return Err(Error::InvalidInput("Empty or invalid preview image".into()));
    }
    static CACHE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let _guard = CACHE_LOCK
      .get_or_init(|| Mutex::new(()))
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    let path = thumbnail_path(&identity)?;
    let root = path.parent().unwrap();
    std::fs::create_dir_all(root)?;
    let mut file = tempfile::NamedTempFile::new_in(root)?;
    std::io::Write::write_all(&mut file, &bytes)?;
    file
      .persist(&path)
      .map_err(|error| Error::Io(error.error))?;
    trim_cache(root)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn cache_rejects_blank_and_oversized_images() {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::RgbaImage::new(64, 64)
      .write_to(&mut bytes, image::ImageFormat::Png)
      .unwrap();
    assert!(!valid_thumbnail(bytes.get_ref()));
    let mut image = image::RgbaImage::from_pixel(64, 64, image::Rgba([20, 20, 20, 255]));
    for x in 16..48 {
      for y in 16..48 {
        image.put_pixel(x, y, image::Rgba([200, 100, 50, 255]));
      }
    }
    let mut bytes = std::io::Cursor::new(Vec::new());
    image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
    assert!(valid_thumbnail(bytes.get_ref()));
    assert!(!valid_thumbnail(&vec![0; MAX_PNG_BYTES + 1]));
  }

  #[test]
  fn cache_identity_changes_with_mod_game_companions_and_renderer() {
    fn vpk(path: &Path, byte: u8) {
      let mut bytes = 0x55aa1234u32.to_le_bytes().to_vec();
      bytes.extend_from_slice(&1u32.to_le_bytes());
      bytes.extend_from_slice(&1u32.to_le_bytes());
      bytes.push(byte);
      std::fs::write(path, bytes).unwrap();
    }
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("mod.vpk");
    let game = root.path().join("pak01_dir.vpk");
    vpk(&source, 0);
    vpk(&game, 0);
    let games = [Some(game.clone())];
    let initial = identity_for(&source, &games, "v1").unwrap();
    assert_ne!(initial, identity_for(&source, &games, "v2").unwrap());
    let original_time = std::fs::metadata(&source).unwrap().modified().unwrap();
    vpk(&source, 1);
    std::fs::File::options()
      .write(true)
      .open(&source)
      .unwrap()
      .set_times(std::fs::FileTimes::new().set_modified(original_time))
      .unwrap();
    let revised = identity_for(&source, &games, "v1").unwrap();
    assert_ne!(
      initial, revised,
      "equal-size, equal-time index revisions still invalidate"
    );
    vpk(&game, 1);
    assert_ne!(revised, identity_for(&source, &games, "v1").unwrap());
    let before_companion = identity_for(&source, &games, "v1").unwrap();
    std::fs::write(root.path().join("pak01_000.vpk"), b"patched game payload").unwrap();
    assert_ne!(
      before_companion,
      identity_for(&source, &games, "v1").unwrap()
    );
  }
  #[test]
  fn thumbnail_storage_is_bounded_by_count_and_bytes() {
    let root = tempfile::tempdir().unwrap();
    for index in 0..MAX_THUMBNAILS + 4 {
      std::fs::write(root.path().join(format!("{index}.png")), b"test").unwrap();
    }
    trim_cache(root.path()).unwrap();
    assert_eq!(
      std::fs::read_dir(root.path()).unwrap().count(),
      MAX_THUMBNAILS
    );
    for index in 0..3 {
      std::fs::File::create(root.path().join(format!("large-{index}.png")))
        .unwrap()
        .set_len(MAX_CACHE_BYTES / 2)
        .unwrap();
    }
    trim_cache(root.path()).unwrap();
    let bytes: u64 = std::fs::read_dir(root.path())
      .unwrap()
      .map(|entry| entry.unwrap().metadata().unwrap().len())
      .sum();
    assert!(bytes <= MAX_CACHE_BYTES);
  }
}
