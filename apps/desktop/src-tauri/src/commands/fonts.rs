use crate::app_runtime::AppHandle;
use std::collections::HashSet;
use std::path::PathBuf;

use crate::errors::Error;

use super::state::MANAGER;

pub(crate) struct PreparedFontCleanup {
  pub conf_path: PathBuf,
  pub game_fonts_dir: PathBuf,
  pub mod_id: String,
  pub removable_font_files: Vec<String>,
}

pub(crate) fn get_validated_mod_folder_path(mod_id: &str) -> Result<PathBuf, Error> {
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.get_validated_mod_folder_path(mod_id)
}

pub(crate) fn collect_other_stashed_font_file_names(
  mods_path: &std::path::Path,
  excluded_mod_id: &str,
) -> Result<HashSet<String>, Error> {
  let mut preserved = HashSet::new();

  if !mods_path.exists() {
    return Ok(preserved);
  }

  let font_manager = crate::mod_manager::FontManager::new();
  for entry in std::fs::read_dir(mods_path)? {
    let entry = entry?;
    let mod_dir = entry.path();
    if !mod_dir.is_dir() {
      continue;
    }

    let Some(mod_dir_name) = mod_dir.file_name().and_then(|name| name.to_str()) else {
      continue;
    };

    if mod_dir_name == excluded_mod_id {
      continue;
    }

    for file_name in font_manager.list_stashed_font_file_names(&mod_dir.join("fonts"))? {
      preserved.insert(file_name);
    }
  }

  Ok(preserved)
}

pub(crate) fn prepare_font_cleanup(
  game_path: &std::path::Path,
  mod_id: &str,
) -> Result<Option<PreparedFontCleanup>, Error> {
  let mod_folder = get_validated_mod_folder_path(mod_id)?;
  let Some(mods_path) = mod_folder.parent() else {
    return Err(Error::InvalidInput(
      "Unable to determine mods directory for font cleanup".to_string(),
    ));
  };

  let stash_dir = mod_folder.join("fonts");
  if !stash_dir.exists() {
    return Ok(None);
  }

  let font_manager = crate::mod_manager::FontManager::new();
  let stashed_font_files = font_manager.list_stashed_font_file_names(&stash_dir)?;
  let preserved_font_files = collect_other_stashed_font_file_names(mods_path, mod_id)?;
  let removable_font_files = stashed_font_files
    .into_iter()
    .filter(|file_name| !preserved_font_files.contains(file_name))
    .collect();

  Ok(Some(PreparedFontCleanup {
    conf_path: game_path
      .join("game")
      .join("citadel")
      .join("panorama")
      .join("fonts")
      .join("fonts.conf"),
    game_fonts_dir: game_path
      .join("game")
      .join("citadel")
      .join("panorama")
      .join("fonts"),
    mod_id: mod_id.to_string(),
    removable_font_files,
  }))
}

pub(crate) fn apply_font_cleanup(cleanup: PreparedFontCleanup) -> Result<(), Error> {
  let font_manager = crate::mod_manager::FontManager::new();

  if let Err(error) = font_manager.remove_font_patterns(&cleanup.conf_path, &cleanup.mod_id) {
    log::warn!(
      "Failed to remove font patterns for mod {}: {error}",
      cleanup.mod_id
    );
  }

  if let Err(error) =
    font_manager.remove_installed_fonts(&cleanup.game_fonts_dir, &cleanup.removable_font_files)
  {
    log::warn!(
      "Failed to remove installed fonts for mod {}: {error}",
      cleanup.mod_id
    );
  }

  Ok(())
}

#[tauri::command]
pub async fn install_mod_fonts(mod_id: String) -> Result<(), Error> {
  use crate::mod_manager::FontManager;

  log::info!("Installing fonts for mod: {mod_id}");

  let game_path = {
    let mod_manager = MANAGER.lock().unwrap();
    mod_manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone()
  };

  let stash_dir = get_validated_mod_folder_path(&mod_id)?.join("fonts");
  let game_fonts_dir = game_path
    .join("game")
    .join("citadel")
    .join("panorama")
    .join("fonts");
  let conf_path = game_fonts_dir.join("fonts.conf");

  let font_manager = FontManager::new();
  let installed = font_manager.install_fonts(&stash_dir, &game_fonts_dir)?;

  if conf_path.exists() {
    font_manager.patch_fonts_conf(&conf_path, &mod_id, &installed)?;
  } else {
    log::warn!("fonts.conf not found at {conf_path:?}, skipping patch");
  }

  log::info!("Installed {} font(s) for mod {mod_id}", installed.len());
  Ok(())
}

#[tauri::command]
pub async fn discard_mod_fonts(mod_id: String) -> Result<(), Error> {
  use crate::mod_manager::FontManager;

  log::info!("Discarding stashed fonts for mod: {mod_id}");

  let stash_dir = get_validated_mod_folder_path(&mod_id)?.join("fonts");
  FontManager::new().discard_stash(&stash_dir)
}

#[tauri::command]
pub async fn scan_and_stash_local_mod_fonts(
  app_handle: AppHandle,
  mod_id: String,
  files_dir: String,
) -> Result<(), Error> {
  use crate::download_manager::DownloadFontsFoundEvent;
  use crate::mod_manager::FontManager;
  use tauri::Emitter;

  let (mod_dir, validated_files_dir) = {
    let mod_manager = MANAGER.lock().unwrap();
    let mod_dir = mod_manager.get_validated_mod_folder_path(&mod_id)?;
    let validated_files_dir =
      mod_manager.validate_extract_target_path(&PathBuf::from(&files_dir))?;
    let expected_files_dir = mod_dir.join("files");

    if validated_files_dir != expected_files_dir {
      return Err(Error::UnauthorizedPath(format!(
        "Path '{}' is outside the allowed mod files directory '{}'",
        validated_files_dir.display(),
        expected_files_dir.display()
      )));
    }

    (mod_dir, validated_files_dir)
  };

  let search_dir = validated_files_dir.as_path();
  if !search_dir.exists() {
    return Ok(());
  }

  let font_manager = FontManager::new();
  let stash_dir = mod_dir.join("fonts");

  font_manager.discard_stash(&stash_dir)?;

  let found_loose = font_manager.scan_for_fonts(search_dir);
  let found_vpk = font_manager.scan_vpks_for_fonts(search_dir);
  if found_loose.is_empty() && found_vpk.is_empty() {
    return Ok(());
  }

  let mut font_infos: Vec<crate::mod_manager::FontInfo> = Vec::new();
  if !found_loose.is_empty() {
    font_infos.extend(font_manager.stash_fonts(&found_loose, &stash_dir)?);
  }
  if !found_vpk.is_empty() {
    font_infos.extend(font_manager.stash_font_bytes(&found_vpk, &stash_dir)?);
  }

  log::info!(
    "Found {} font(s) in local mod {mod_id}, emitting fonts-found event",
    font_infos.len()
  );

  app_handle
    .emit(
      "download-fonts-found",
      DownloadFontsFoundEvent {
        mod_id,
        fonts: font_infos,
      },
    )
    .map_err(|e| Error::Io(std::io::Error::other(e.to_string())))?;

  Ok(())
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn debug_trigger_font_install(
  mod_id: String,
  app_handle: AppHandle,
) -> Result<(), Error> {
  use crate::download_manager::DownloadFontsFoundEvent;
  use crate::mod_manager::FontManager;
  use tauri::Emitter;

  let system_ttf = std::path::Path::new("/usr/share/fonts/Adwaita/AdwaitaSans-Regular.ttf");
  if !system_ttf.exists() {
    return Err(Error::Io(std::io::Error::new(
      std::io::ErrorKind::NotFound,
      "test TTF not found at /usr/share/fonts/Adwaita/AdwaitaSans-Regular.ttf — adjust path in debug_trigger_font_install",
    )));
  }

  let stash_dir = get_validated_mod_folder_path(&mod_id)?.join("fonts");
  let font_manager = FontManager::new();

  let font_infos = font_manager.stash_fonts(&[system_ttf.to_path_buf()], &stash_dir)?;

  app_handle
    .emit(
      "download-fonts-found",
      DownloadFontsFoundEvent {
        mod_id: mod_id.clone(),
        fonts: font_infos,
      },
    )
    .map_err(|e| Error::Io(std::io::Error::other(e.to_string())))?;

  log::info!("debug_trigger_font_install: emitted download-fonts-found for mod {mod_id}");
  Ok(())
}
