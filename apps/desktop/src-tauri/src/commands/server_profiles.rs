use crate::errors::Error;

use super::state::MANAGER;

const SERVER_FOLDER_PREFIX: &str = "server_";

pub(crate) fn sanitize_server_id(server_id: &str) -> Result<String, Error> {
  let trimmed = server_id.trim();
  if trimmed.is_empty() {
    return Err(Error::InvalidInput("server_id is empty".to_string()));
  }

  let sanitized: String = trimmed
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
        c.to_ascii_lowercase()
      } else {
        '_'
      }
    })
    .collect();

  let trimmed_sanitized = sanitized.trim_matches(|c| c == '-' || c == '_');
  if trimmed_sanitized.is_empty() {
    return Err(Error::InvalidInput(
      "server_id contains no valid characters".to_string(),
    ));
  }

  Ok(trimmed_sanitized.to_string())
}

pub(crate) fn validate_addons_subfolder(folder_name: &str) -> Result<(), Error> {
  if folder_name.is_empty() || folder_name == "." || folder_name == ".." {
    return Err(Error::InvalidInput(
      "Invalid addons folder name".to_string(),
    ));
  }

  if folder_name.contains("..") || folder_name.contains('/') || folder_name.contains('\\') {
    return Err(Error::InvalidInput(
      "Invalid addons folder name".to_string(),
    ));
  }

  if !folder_name.starts_with("profile_") && !folder_name.starts_with(SERVER_FOLDER_PREFIX) {
    return Err(Error::InvalidInput(
      "Folder must start with 'profile_' or 'server_'".to_string(),
    ));
  }

  Ok(())
}

#[tauri::command]
pub async fn create_server_addons_folder(server_id: String) -> Result<String, Error> {
  log::info!("Creating server addons folder for server: {server_id}");

  let sanitized = sanitize_server_id(&server_id)?;
  let folder_name = format!("{}{}", SERVER_FOLDER_PREFIX, sanitized);

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = game_path.join("game").join("citadel").join("addons");
  let folder_path = addons_path.join(&folder_name);

  if folder_path.exists() {
    log::warn!("Server addons folder already exists: {folder_path:?}");
    return Ok(folder_name);
  }

  std::fs::create_dir_all(&folder_path)?;
  log::info!("Created server addons folder: {folder_path:?}");

  Ok(folder_name)
}

#[tauri::command]
pub async fn delete_server_addons_folder(server_id: String) -> Result<(), Error> {
  log::info!("Deleting server addons folder for server: {server_id}");

  let sanitized = sanitize_server_id(&server_id)?;
  let folder_name = format!("{}{}", SERVER_FOLDER_PREFIX, sanitized);
  validate_addons_subfolder(&folder_name)?;

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = game_path.join("game").join("citadel").join("addons");
  let folder_path = addons_path.join(&folder_name);

  if !folder_path.exists() {
    log::warn!("Server addons folder does not exist: {folder_path:?}");
    return Ok(());
  }

  let addons_canonical = addons_path
    .canonicalize()
    .map_err(|_| Error::UnauthorizedPath("Unable to resolve addons directory".to_string()))?;
  let folder_canonical = folder_path.canonicalize().map_err(|_| {
    Error::UnauthorizedPath(format!(
      "Unable to resolve server folder: {}",
      folder_path.display()
    ))
  })?;

  if !folder_canonical.starts_with(&addons_canonical) {
    return Err(Error::UnauthorizedPath(
      "Server folder must be within addons directory".to_string(),
    ));
  }

  std::fs::remove_dir_all(&folder_canonical)?;
  log::info!("Deleted server addons folder: {folder_canonical:?}");

  Ok(())
}

#[tauri::command]
pub async fn list_server_addons_folders() -> Result<Vec<String>, Error> {
  log::info!("Listing server addons folders");

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = game_path.join("game").join("citadel").join("addons");

  if !addons_path.exists() {
    return Ok(Vec::new());
  }

  let mut folders = Vec::new();
  for entry in std::fs::read_dir(&addons_path)? {
    let entry = entry?;
    let path = entry.path();

    if path.is_dir()
      && let Some(folder_name) = path.file_name().and_then(|n| n.to_str())
      && folder_name.starts_with(SERVER_FOLDER_PREFIX)
    {
      folders.push(folder_name.to_string());
    }
  }

  log::info!("Found {} server addons folders", folders.len());
  Ok(folders)
}

#[tauri::command]
pub async fn apply_server_gameinfo(
  server_folder: String,
  also_include_profile: Option<String>,
) -> Result<(), Error> {
  log::info!("Applying server gameinfo: server={server_folder}, profile={also_include_profile:?}");

  if !server_folder.starts_with(SERVER_FOLDER_PREFIX) {
    return Err(Error::InvalidInput(format!(
      "Expected server folder name with '{SERVER_FOLDER_PREFIX}' prefix, got: {server_folder}"
    )));
  }
  validate_addons_subfolder(&server_folder)?;

  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?
    .clone();

  let mut folders: Vec<Option<String>> = vec![Some(server_folder)];
  if let Some(profile) = also_include_profile {
    folders.push(Some(profile));
  }

  mod_manager
    .get_config_manager_mut()
    .update_mod_path_multi(&game_path, &folders)?;

  Ok(())
}

#[tauri::command]
pub async fn restore_active_profile_gameinfo(profile_folder: Option<String>) -> Result<(), Error> {
  log::info!("Restoring gameinfo to active profile: {profile_folder:?}");

  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?
    .clone();

  mod_manager
    .get_config_manager_mut()
    .update_mod_path(&game_path, profile_folder)?;

  Ok(())
}

#[tauri::command]
pub async fn cleanup_stale_server_gameinfo(
  active_profile_folder: Option<String>,
) -> Result<bool, Error> {
  log::info!("Checking for stale server gameinfo (active profile: {active_profile_folder:?})");

  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?
    .clone();

  let paths = mod_manager
    .get_config_manager()
    .marker_addons_paths(&game_path)?;

  let server_prefix = format!("citadel/addons/{}", SERVER_FOLDER_PREFIX);
  let profile_prefix = "citadel/addons/profile_";

  let has_server = paths.iter().any(|p| p.starts_with(&server_prefix));

  if !has_server {
    log::debug!("No stale server entries in gameinfo.gi");
    return Ok(false);
  }

  if active_profile_folder.is_none()
    && let Some(existing) = paths.iter().find(|p| p.starts_with(profile_prefix))
  {
    log::warn!(
      "Stale server entry present but caller passed no active profile; preserving existing profile reference {existing:?}"
    );
    let recovered = existing
      .strip_prefix("citadel/addons/")
      .map(|s| s.to_string());
    mod_manager
      .get_config_manager_mut()
      .update_mod_path(&game_path, recovered)?;
    return Ok(true);
  }

  log::info!("Stale server entry detected, restoring active profile path");
  mod_manager
    .get_config_manager_mut()
    .update_mod_path(&game_path, active_profile_folder)?;

  Ok(true)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sanitize_server_id_lowercases_alphanumeric() {
    let out = sanitize_server_id("AbC-123_xyz").expect("ok");
    assert_eq!(out, "abc-123_xyz");
  }

  #[test]
  fn sanitize_server_id_replaces_invalid_chars_with_underscore() {
    let out = sanitize_server_id("foo bar.baz!").expect("ok");
    assert_eq!(out, "foo_bar_baz");
  }

  #[test]
  fn sanitize_server_id_rejects_empty() {
    let err = sanitize_server_id("");
    assert!(matches!(err, Err(Error::InvalidInput(_))));
  }

  #[test]
  fn sanitize_server_id_rejects_whitespace_only() {
    let err = sanitize_server_id("   ");
    assert!(matches!(err, Err(Error::InvalidInput(_))));
  }

  #[test]
  fn sanitize_server_id_rejects_only_separators() {
    let err = sanitize_server_id("---___");
    assert!(matches!(err, Err(Error::InvalidInput(_))));
  }

  #[test]
  fn sanitize_server_id_strips_leading_trailing_separators() {
    let out = sanitize_server_id("--abc--").expect("ok");
    assert_eq!(out, "abc");
  }

  #[test]
  fn validate_addons_subfolder_accepts_profile_prefix() {
    assert!(validate_addons_subfolder("profile_default").is_ok());
  }

  #[test]
  fn validate_addons_subfolder_accepts_server_prefix() {
    assert!(validate_addons_subfolder("server_xyz").is_ok());
  }

  #[test]
  fn validate_addons_subfolder_rejects_traversal() {
    assert!(validate_addons_subfolder("..").is_err());
    assert!(validate_addons_subfolder("server_..foo").is_err());
    assert!(validate_addons_subfolder("server_/foo").is_err());
    assert!(validate_addons_subfolder("server_\\foo").is_err());
  }

  #[test]
  fn validate_addons_subfolder_rejects_wrong_prefix() {
    assert!(validate_addons_subfolder("xyz").is_err());
    assert!(validate_addons_subfolder("addons").is_err());
  }

  #[test]
  fn validate_addons_subfolder_rejects_empty_or_dots() {
    assert!(validate_addons_subfolder("").is_err());
    assert!(validate_addons_subfolder(".").is_err());
  }
}
