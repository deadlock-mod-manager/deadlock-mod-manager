use crate::app_runtime::AppHandle;
use crate::download_manager::{DownloadTask, PreparedDownload};
use crate::errors::Error;
use crate::mod_manager::Mod;
use crate::mod_manager::shard::{ShardIndex, ShardLocator};
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use super::downloads::{FileserverPreference, get_download_manager, resolve_download_files};
use super::mods::InstalledModInfo;
use super::state::MANAGER;

#[tauri::command]
pub async fn create_profile_folder(
  profile_id: String,
  profile_name: String,
  guard_permit: Option<String>,
) -> Result<String, Error> {
  crate::game_guard::ensure_game_idle_locked("create_profile_folder", guard_permit.as_deref())?;
  create_profile_folder_unguarded(&profile_id, &profile_name)
}

/// Callers must have passed the game guard already. Kept separate so a batch
/// import the user confirmed does not need a second override to create its
/// folder.
fn create_profile_folder_unguarded(profile_id: &str, profile_name: &str) -> Result<String, Error> {
  log::info!("Creating profile folder for: {profile_id} - {profile_name}");

  let folder_name = profile_folder_name(profile_id, profile_name);

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = game_path.join("game").join("citadel").join("addons");
  let profile_folder = addons_path.join(&folder_name);

  if profile_folder.exists() {
    log::warn!("Profile folder already exists: {profile_folder:?}");
    return Ok(folder_name);
  }

  std::fs::create_dir_all(&profile_folder)?;
  log::info!("Created profile folder: {profile_folder:?}");
  #[cfg(feature = "plugins")]
  crate::external_plugins::events::profile_created(&folder_name);

  Ok(folder_name)
}

fn profile_folder_name(profile_id: &str, profile_name: &str) -> String {
  let sanitized_name = profile_name
    .to_lowercase()
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
        c
      } else if c.is_whitespace() {
        '-'
      } else {
        '_'
      }
    })
    .collect::<String>()
    .trim_matches(|c| c == '-' || c == '_')
    .to_string();

  if sanitized_name.is_empty() {
    profile_id.to_string()
  } else {
    format!("{profile_id}_{sanitized_name}")
  }
}

#[tauri::command]
pub async fn delete_profile_folder(
  app_handle: AppHandle,
  profile_folder: String,
  guard_permit: Option<String>,
) -> Result<(), Error> {
  crate::game_guard::ensure_game_idle_locked("delete_profile_folder", guard_permit.as_deref())?;
  log::info!("Deleting profile folder: {profile_folder}");

  if profile_folder.is_empty() || profile_folder == "." || profile_folder == ".." {
    return Err(Error::InvalidInput(
      "Invalid profile folder name".to_string(),
    ));
  }

  if !profile_folder.starts_with("profile_") {
    return Err(Error::InvalidInput(
      "Profile folder must start with 'profile_'".to_string(),
    ));
  }

  if profile_folder.contains("..") || profile_folder.contains('/') || profile_folder.contains('\\')
  {
    return Err(Error::InvalidInput(
      "Invalid profile folder name".to_string(),
    ));
  }

  get_download_manager(app_handle)
    .await
    .cancel_profile_downloads(&profile_folder)
    .await;

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let base = game_path
    .join("game")
    .join("citadel")
    .join("addons")
    .join(&profile_folder);
  let removed = crate::mod_manager::shard::remove_profile_shards(&base)?;
  mod_manager.delete_profile_localization_overlay(&profile_folder)?;

  if removed {
    log::info!("Deleted profile shard folders for: {profile_folder}");
    #[cfg(feature = "plugins")]
    crate::external_plugins::events::profile_removed(&profile_folder);
  } else {
    log::warn!("Profile folder does not exist in any addon shard: {profile_folder}");
  }

  Ok(())
}

#[tauri::command]
pub async fn switch_profile(
  profile_folder: Option<String>,
  guard_permit: Option<String>,
) -> Result<(), Error> {
  crate::game_guard::ensure_game_idle_locked("switch_profile", guard_permit.as_deref())?;
  log::info!("Switching to profile folder: {profile_folder:?}");

  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.migrate_profile_to_shards(profile_folder.clone())?;
  #[cfg(feature = "plugins")]
  let event_profile = profile_folder.clone();
  mod_manager.apply_profile_gameinfo(profile_folder)?;
  #[cfg(feature = "plugins")]
  crate::external_plugins::events::profile_activated(event_profile.as_deref());

  log::info!("Successfully switched profile");
  Ok(())
}

#[tauri::command]
pub async fn list_profile_folders() -> Result<Vec<String>, Error> {
  log::info!("Listing profile folders in addons directory");

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = game_path.join("game").join("citadel").join("addons");

  if !addons_path.exists() {
    log::warn!("Addons path does not exist: {addons_path:?}");
    return Ok(Vec::new());
  }

  let mut profile_folders = Vec::new();

  for entry in std::fs::read_dir(&addons_path)? {
    let entry = entry?;
    let path = entry.path();

    if path.is_dir()
      && let Some(folder_name) = path.file_name().and_then(|n| n.to_str())
      && folder_name.starts_with("profile_")
    {
      profile_folders.push(folder_name.to_string());
      log::debug!("Found profile folder: {folder_name}");
    }
  }

  log::info!("Found {} profile folders", profile_folders.len());
  Ok(profile_folders)
}

#[tauri::command]
pub async fn get_profile_installed_vpks(
  profile_folder: Option<String>,
) -> Result<Vec<ProfileVpkFile>, Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = if let Some(folder) = profile_folder {
    game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(folder)
  } else {
    game_path.join("game").join("citadel").join("addons")
  };

  if !addons_path.exists() {
    log::warn!("Addons path does not exist: {addons_path:?}");
    return Ok(Vec::new());
  }

  let mut vpk_files = Vec::new();

  let profile_base = crate::mod_manager::shard::ProfileBase::new(addons_path)?;

  for (shard_index, dir) in profile_base.existing_shards() {
    for entry in std::fs::read_dir(&dir)? {
      let path = entry?.path();

      if path.is_file()
        && let Some(file_name) = path.file_name().and_then(|n| n.to_str())
        && file_name.ends_with(".vpk")
      {
        let locator = ShardLocator::new(shard_index, file_name);
        vpk_files.push(ProfileVpkFile {
          shard: shard_index,
          filename: file_name.to_string(),
          locator: locator.to_wire(),
        });
        log::debug!("Found VPK file: {file_name}");
      }
    }
  }

  log::debug!("Found {} VPK files in profile", vpk_files.len());
  Ok(vpk_files)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVpkFile {
  shard: ShardIndex,
  filename: String,
  locator: String,
}

struct ResolvedProfileVpk {
  path: std::path::PathBuf,
  profile_base: crate::mod_manager::shard::ProfileBase,
  shard: ShardIndex,
  filename: String,
  /// The listed name is a link; `path` is its target.
  linked: bool,
}

fn resolve_profile_vpk_path(
  profile_folder: Option<String>,
  vpk_name: &str,
) -> Result<ResolvedProfileVpk, Error> {
  let base = MANAGER
    .lock()
    .unwrap()
    .get_addons_path(profile_folder.as_deref())?;
  resolve_profile_vpk_in(base, vpk_name)
}

fn resolve_profile_vpk_in(
  base: crate::mod_manager::shard::ProfileBase,
  vpk_name: &str,
) -> Result<ResolvedProfileVpk, Error> {
  if vpk_name.is_empty() || vpk_name.contains('\\') || vpk_name.contains("..") {
    return Err(Error::InvalidInput(format!(
      "Invalid VPK file name: {vpk_name}"
    )));
  }

  let locator = ShardLocator::parse(vpk_name)?;
  let shard_index = locator.shard;
  let filename = locator.filename;
  if filename.is_empty() || filename.contains('/') || !filename.to_lowercase().ends_with(".vpk") {
    return Err(Error::InvalidInput(format!(
      "Invalid VPK file name: {vpk_name}"
    )));
  }

  let target_dir = base.shard_dir(shard_index);
  let vpk_path = target_dir.join(&filename);
  let linked = vpk_path
    .symlink_metadata()
    .is_ok_and(|metadata| metadata.file_type().is_symlink());
  let target_canonical = target_dir
    .canonicalize()
    .map_err(|_| Error::UnauthorizedPath("Unable to resolve addon shard directory".to_string()))?;
  let vpk_canonical = vpk_path.canonicalize().map_err(|_| {
    Error::UnauthorizedPath(format!(
      "Unable to resolve VPK path: {}",
      vpk_path.display()
    ))
  })?;

  if !vpk_canonical.starts_with(&target_canonical) {
    return Err(Error::UnauthorizedPath(
      "VPK file must be within addons directory".to_string(),
    ));
  }

  Ok(ResolvedProfileVpk {
    path: vpk_canonical,
    profile_base: base,
    shard: shard_index,
    filename,
    linked,
  })
}

#[tauri::command]
pub async fn delete_profile_vpk(
  profile_folder: Option<String>,
  vpk_name: String,
  guard_permit: Option<String>,
) -> Result<(), Error> {
  crate::game_guard::ensure_game_idle_locked("delete_profile_vpk", guard_permit.as_deref())?;
  log::info!("Deleting VPK {vpk_name} from profile {profile_folder:?}");
  // Held through the removal, so an install can't put a mod's file at this
  // path after the ownership check.
  let manager = MANAGER.lock().unwrap();
  let base = manager.get_addons_path(profile_folder.as_deref())?;
  let resolved = resolve_profile_vpk_in(base, &vpk_name)?;
  ensure_unlinked(&resolved)?;
  let manifest = ProfileVpkManifest::open_for_write(&resolved.profile_base)?;
  if is_managed(&resolved, &manifest) {
    return Err(Error::ModInvalid(format!(
      "Cannot delete managed VPK {} as an unmatched file; refresh the VPK scan",
      resolved.filename
    )));
  }

  std::fs::remove_file(&resolved.path)?;
  log::info!("Deleted unmanaged VPK file: {:?}", resolved.path);
  Ok(())
}

/// Deleting or moving a link would act on its target, which may be a file a
/// mod owns under another name.
fn ensure_unlinked(resolved: &ResolvedProfileVpk) -> Result<(), Error> {
  if resolved.linked {
    return Err(Error::UnauthorizedPath(format!(
      "{} is a link; remove it outside DMM",
      resolved.filename
    )));
  }
  Ok(())
}

fn is_managed(resolved: &ResolvedProfileVpk, manifest: &ProfileVpkManifest) -> bool {
  manifest.mods.values().any(|entry| {
    if entry.enabled {
      entry.shard == resolved.shard && entry.current_vpks.contains(&resolved.filename)
    } else {
      resolved.shard == ShardIndex::FIRST && entry.disabled_vpks.contains(&resolved.filename)
    }
  })
}

/// Folder inside a profile where Analyze sets aside files the user chose to
/// quarantine. The game only loads VPKs at the top of each search path, and
/// Analyze and the VPK scan read only that level, so nothing here is loaded or
/// offered again until the user moves it back.
const QUARANTINE_DIR: &str = ".dmm-quarantine";

/// Move an unmanaged VPK into the profile's quarantine folder and return where
/// it went. The manager lock is held throughout, so no mod can take the file
/// between the ownership check and the move.
#[tauri::command]
pub async fn quarantine_profile_vpk(
  profile_folder: Option<String>,
  vpk_name: String,
  guard_permit: Option<String>,
) -> Result<String, Error> {
  crate::game_guard::ensure_game_idle_locked("quarantine_profile_vpk", guard_permit.as_deref())?;
  log::info!("Quarantining VPK {vpk_name} from profile {profile_folder:?}");
  let manager = MANAGER.lock().unwrap();
  let base = manager.get_addons_path(profile_folder.as_deref())?;
  let destination = quarantine_unmanaged_vpk(base, &vpk_name)?;
  Ok(destination.to_string_lossy().into_owned())
}

fn quarantine_unmanaged_vpk(
  base: crate::mod_manager::shard::ProfileBase,
  vpk_name: &str,
) -> Result<std::path::PathBuf, Error> {
  let resolved = resolve_profile_vpk_in(base, vpk_name)?;
  ensure_unlinked(&resolved)?;
  let manifest = ProfileVpkManifest::open_for_write(&resolved.profile_base)?;
  if is_managed(&resolved, &manifest) {
    return Err(Error::ModInvalid(format!(
      "Cannot quarantine managed VPK {}; run Analyze again",
      resolved.filename
    )));
  }

  let folder = resolved.profile_base.join(QUARANTINE_DIR);
  match std::fs::symlink_metadata(&folder) {
    Ok(metadata) if metadata.is_dir() => {}
    Ok(_) => {
      return Err(Error::UnauthorizedPath(format!(
        "{} is not a folder",
        folder.display()
      )));
    }
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => std::fs::create_dir(&folder)?,
    Err(error) => return Err(error.into()),
  }

  // Overflow shards reuse the base folder's pakNN names, so their files keep
  // the shard in front to stay distinguishable.
  let name = if resolved.shard == ShardIndex::FIRST {
    resolved.filename.clone()
  } else {
    format!("{}-{}", resolved.shard.root_name(), resolved.filename)
  };
  let destination = free_path(&folder, &name);
  std::fs::rename(&resolved.path, &destination)?;
  log::info!(
    "Quarantined unmanaged VPK {:?} to {:?}",
    resolved.path,
    destination
  );
  Ok(destination)
}

/// `name` in `folder`, or `name (2)`, `name (3)`... when it is taken. Any
/// entry counts as taken, a dangling link too, which `rename` would replace.
fn free_path(folder: &std::path::Path, name: &str) -> std::path::PathBuf {
  let taken = |path: &std::path::Path| path.symlink_metadata().is_ok();
  let candidate = folder.join(name);
  if !taken(&candidate) {
    return candidate;
  }
  let path = std::path::Path::new(name);
  let stem = path
    .file_stem()
    .map(|s| s.to_string_lossy().into_owned())
    .unwrap_or_default();
  let extension = path.extension().map(|e| e.to_string_lossy().into_owned());
  (2..)
    .map(|n| {
      folder.join(match &extension {
        Some(extension) => format!("{stem} ({n}).{extension}"),
        None => format!("{stem} ({n})"),
      })
    })
    .find(|candidate| !taken(candidate))
    .expect("an unused name exists")
}

#[tauri::command]
pub async fn show_profile_vpk_in_folder(
  profile_folder: Option<String>,
  vpk_name: String,
) -> Result<(), Error> {
  log::info!("Revealing VPK {vpk_name} from profile {profile_folder:?}");
  let resolved = resolve_profile_vpk_path(profile_folder, &vpk_name)?;
  crate::utils::show_in_folder(resolved.path.to_string_lossy().as_ref())
}

/// The Default profile arrives as an empty folder and lives in the root addons folder.
fn import_install_folder(final_profile_folder: &str) -> Option<String> {
  (!final_profile_folder.is_empty()).then(|| final_profile_folder.to_string())
}

fn install_imported_mod(
  mod_manager: &mut crate::mod_manager::ModManager,
  mod_data: &super::downloads::ProfileImportMod,
  final_profile_folder: &str,
) -> Result<Mod, Error> {
  let deadlock_mod = Mod {
    id: mod_data.mod_id.clone(),
    name: mod_data.mod_name.clone(),
    is_map: mod_data.is_map,
    installed_vpks: Vec::new(),
    file_tree: mod_data.file_tree.clone(),
    install_order: None,
    original_vpk_names: Vec::new(),
  };

  mod_manager.install_mod(deadlock_mod, import_install_folder(final_profile_folder))
}

/// Mods the profile already has, enabled or not. Importing one beside its old
/// files would keep both versions loaded, so these are replaced instead.
fn profile_mod_ids(
  mod_manager: &crate::mod_manager::ModManager,
  final_profile_folder: &str,
) -> Result<std::collections::HashSet<String>, Error> {
  let addons_path =
    mod_manager.get_addons_path(import_install_folder(final_profile_folder).as_deref())?;
  Ok(
    ProfileVpkManifest::load(&addons_path)?
      .mods
      .into_keys()
      .collect(),
  )
}

fn replace_imported_mod(
  mod_manager: &mut crate::mod_manager::ModManager,
  mod_data: &super::downloads::ProfileImportMod,
  final_profile_folder: &str,
  prepared_vpks: &[std::path::PathBuf],
  prepared_tree: Option<crate::mod_manager::file_tree::ModFileTree>,
) -> Result<Mod, Error> {
  mod_manager.update_mod_from_prepared(
    &mod_data.mod_id,
    &mod_data.mod_name,
    prepared_vpks,
    prepared_tree.or_else(|| mod_data.file_tree.clone()),
    import_install_folder(final_profile_folder),
    true,
  )
}

async fn prepare_replacement(
  manager: &crate::download_manager::DownloadManager,
  task: DownloadTask,
) -> Result<Option<PreparedDownload>, String> {
  match manager.queue_download_and_prepare(task).await {
    Ok(prepared) if prepared.selection_required => {
      prepared.remove_scratch_files();
      Err("The saved file selection doesn't match this mod's current downloads".to_string())
    }
    Ok(prepared) => Ok(Some(prepared)),
    Err(error) => Err(error.to_string()),
  }
}

#[tauri::command]
pub async fn import_profile_batch(
  app_handle: AppHandle,
  catalog_state: State<'_, super::gamebanana_catalog::GameBananaCatalogState>,
  native_sources: State<'_, crate::providers::native_sources::NativeSourceManager>,
  policy: State<'_, super::policy::PolicyState>,
  profile_name: String,
  _profile_description: String,
  profile_folder: String,
  mods: Vec<super::downloads::ProfileImportMod>,
  import_type: String,
  fileserver_preference: FileserverPreference,
  guard_permit: Option<String>,
) -> Result<super::downloads::ProfileImportResult, Error> {
  crate::game_guard::ensure_game_idle_locked("import_profile_batch", guard_permit.as_deref())?;
  log::info!(
    "Starting batch profile import: {} mods, type: {}, folder: {}",
    mods.len(),
    import_type,
    profile_folder
  );

  let total_mods = mods.len();
  if total_mods == 0 {
    return Err(Error::InvalidInput(
      "No mods provided for import".to_string(),
    ));
  }
  // Trees shared before names were unique can repeat a name, and both the
  // download and the install go by these names.
  let mods: Vec<_> = mods
    .into_iter()
    .map(|mut mod_data| {
      mod_data.file_tree = mod_data
        .file_tree
        .map(|tree| crate::mod_manager::file_tree::ModFileTree::from_extracted(tree.files));
      mod_data
    })
    .collect();

  let mut resolved_downloads = Vec::with_capacity(total_mods);
  for mod_data in &mods {
    resolved_downloads.push(
      resolve_download_files(
        &native_sources,
        &catalog_state,
        &policy,
        &mod_data.mod_id,
        &mod_data.download_files,
        fileserver_preference,
      )
      .await
      .map_err(|error| format!("Failed to resolve download files: {error:?}")),
    );
  }

  let final_profile_folder = if import_type == "create" {
    let now = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap();
    let timestamp_ms = now.as_millis();
    let nanos = now.subsec_nanos();

    let random_part = format!("{:x}", nanos).chars().take(9).collect::<String>();

    let profile_id = format!("profile_{}_{}", timestamp_ms, random_part);

    create_profile_folder_unguarded(&profile_id, &profile_name)?
  } else {
    let mod_manager = MANAGER.lock().unwrap();
    let game_path = mod_manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    let addons_path = game_path.join("game").join("citadel").join("addons");
    let profile_path = addons_path.join(&profile_folder);

    if !profile_path.exists() {
      std::fs::create_dir_all(&profile_path)?;
      log::info!("Created profile folder for override: {profile_path:?}");
    }

    profile_folder
  };
  let installed_ids = profile_mod_ids(&MANAGER.lock().unwrap(), &final_profile_folder)?;

  // `Some` holds a replacement for a mod the profile already has.
  let mut download_results: Vec<Result<Option<PreparedDownload>, String>> = Vec::new();

  for (index, (mod_data, download_files)) in mods.iter().zip(resolved_downloads).enumerate() {
    // download_results stays index-aligned with mods; the install loop below zips them.
    let download_files = match download_files {
      Ok(files) => files,
      Err(reason) => {
        log::error!(
          "Failed to resolve downloads for mod {}: {reason}",
          mod_data.mod_id
        );
        download_results.push(Err(reason));
        continue;
      }
    };

    app_handle
      .emit(
        "profile-import-progress",
        super::downloads::ProfileImportProgressEvent {
          current_step: "downloading".to_string(),
          current_mod_index: index,
          total_mods,
          current_mod_name: mod_data.mod_name.clone(),
          overall_progress: (index as f64 / total_mods as f64) * 50.0,
        },
      )
      .ok();

    let target_dir = crate::mod_manager::mods_store::dir(&app_handle)?.join(&mod_data.mod_id);

    let task = DownloadTask {
      mod_id: mod_data.mod_id.clone(),
      files: download_files,
      target_dir,
      profile_folder: import_install_folder(&final_profile_folder),
      is_profile_import: true,
      file_tree: mod_data.file_tree.clone(),
      native_component_plan: false,
      attempt_id: None,
    };

    let manager = get_download_manager(app_handle.clone()).await;
    if installed_ids.contains(&mod_data.mod_id) {
      download_results.push(prepare_replacement(manager, task).await);
      continue;
    }
    if let Err(error) = manager.queue_download_and_wait(task).await {
      log::error!("Download failed for mod {}: {error}", mod_data.mod_id);
      download_results.push(Err(error.to_string()));
      continue;
    }

    let game_path = MANAGER
      .lock()
      .unwrap()
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone();

    let verify_path = game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(&final_profile_folder);

    let vpk_manager = crate::mod_manager::vpk_manager::VpkManager::new();
    match vpk_manager.find_prefixed_vpks(&verify_path, &mod_data.mod_id) {
      Ok(vpks) if !vpks.is_empty() => {
        log::info!(
          "Download completed for mod: {} ({} VPKs)",
          mod_data.mod_id,
          vpks.len()
        );
        download_results.push(Ok(None));
      }
      Ok(_) => {
        log::error!(
          "Download completed but no VPKs found for mod: {}",
          mod_data.mod_id
        );
        download_results.push(Err("Download completed but no VPKs found".to_string()));
      }
      Err(e) => {
        log::error!("Failed to check VPKs for mod {}: {:?}", mod_data.mod_id, e);
        download_results.push(Err(format!("Failed to verify download: {:?}", e)));
      }
    }
  }

  let mut succeeded = Vec::new();
  let mut failed = Vec::new();
  let mut installed_mods = Vec::new();
  let mut replaced_any = false;

  for (index, (mod_data, download_result)) in mods.iter().zip(download_results).enumerate() {
    app_handle
      .emit(
        "profile-import-progress",
        super::downloads::ProfileImportProgressEvent {
          current_step: "installing".to_string(),
          current_mod_index: index,
          total_mods,
          current_mod_name: mod_data.mod_name.clone(),
          overall_progress: 50.0 + (index as f64 / total_mods as f64) * 50.0,
        },
      )
      .ok();

    let install_result = match download_result {
      Err(reason) => {
        failed.push((mod_data.mod_id.clone(), reason));
        continue;
      }
      Ok(Some(prepared)) => {
        let result = replace_imported_mod(
          &mut MANAGER.lock().unwrap(),
          mod_data,
          &final_profile_folder,
          &prepared.vpk_paths,
          prepared.file_tree.clone(),
        );
        prepared.remove_scratch_files();
        replaced_any |= result.is_ok();
        result
      }
      Ok(None) => install_imported_mod(
        &mut MANAGER.lock().unwrap(),
        mod_data,
        &final_profile_folder,
      ),
    };

    match install_result {
      Ok(installed_mod) => {
        log::info!("Successfully installed mod: {}", mod_data.mod_id);
        succeeded.push(mod_data.mod_id.clone());

        installed_mods.push(InstalledModInfo {
          mod_id: installed_mod.id.clone(),
          mod_name: installed_mod.name.clone(),
          installed_vpks: installed_mod.installed_vpks.clone(),
          file_tree: installed_mod.file_tree.clone(),
        });
      }
      Err(e) => {
        log::error!("Failed to install mod {}: {:?}", mod_data.mod_id, e);
        failed.push((mod_data.mod_id.clone(), format!("{:?}", e)));
      }
    }
  }

  // Replacements can land out of load order, and later installs rename files
  // already reported, so reorder once and report the manifest's final names.
  if replaced_any {
    let mut mod_manager = MANAGER.lock().unwrap();
    let folder = import_install_folder(&final_profile_folder);
    if let Err(error) = mod_manager.reorder_all_mods_for_profile(folder.clone()) {
      log::warn!("Post-import reorder failed: {error}");
    }
    if let Ok(addons_path) = mod_manager.get_addons_path(folder.as_deref())
      && let Ok(manifest) = ProfileVpkManifest::load(&addons_path)
    {
      for info in &mut installed_mods {
        if let Some(entry) = manifest.mods.get(&info.mod_id) {
          info.installed_vpks = entry.current_vpks.clone();
        }
      }
    }
  }

  app_handle
    .emit(
      "profile-import-progress",
      super::downloads::ProfileImportProgressEvent {
        current_step: "complete".to_string(),
        current_mod_index: total_mods,
        total_mods,
        current_mod_name: String::new(),
        overall_progress: 100.0,
      },
    )
    .ok();

  log::info!(
    "Batch profile import completed: {} succeeded, {} failed",
    succeeded.len(),
    failed.len()
  );

  Ok(super::downloads::ProfileImportResult {
    profile_folder: final_profile_folder,
    succeeded,
    failed,
    installed_mods,
  })
}

#[tauri::command]
pub async fn get_profile_vpk_manifest(
  profile_folder: Option<String>,
) -> Result<ProfileVpkManifest, Error> {
  log::info!("Getting VPK manifest for profile: {profile_folder:?}");

  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.hydrate_mods_from_manifest(profile_folder.clone())?;
  mod_manager.get_profile_vpk_manifest(profile_folder)
}

#[tauri::command]
pub async fn hydrate_mods_from_manifest(profile_folder: Option<String>) -> Result<usize, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.hydrate_mods_from_manifest(profile_folder)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedManifestEntry {
  pub mod_id: String,
  pub enabled: bool,
  #[serde(default = "default_seed_shard")]
  pub shard: ShardIndex,
  #[serde(default)]
  pub current_vpks: Vec<String>,
  #[serde(default)]
  pub disabled_vpks: Vec<String>,
  #[serde(default)]
  pub original_vpk_names: Vec<String>,
  #[serde(default)]
  pub order: Option<u32>,
}

pub(crate) fn seed_manifest_entries(
  manifest: &mut ProfileVpkManifest,
  entries: Vec<SeedManifestEntry>,
) -> bool {
  let mut changed = false;
  for mut entry in entries {
    if manifest.mods.contains_key(&entry.mod_id) {
      continue;
    }
    let vpk_count = if entry.enabled {
      entry.current_vpks.len()
    } else {
      entry.disabled_vpks.len()
    };
    // Names pair with files by position, so a list of a different length
    // would rename files after the wrong variant.
    if !entry.original_vpk_names.is_empty() && entry.original_vpk_names.len() != vpk_count {
      log::warn!(
        "Dropping {} original VPK names for mod {}: they do not match its {vpk_count} VPKs",
        entry.original_vpk_names.len(),
        entry.mod_id
      );
      entry.original_vpk_names.clear();
    }
    if entry.enabled {
      manifest.mark_enabled(
        &entry.mod_id,
        entry.current_vpks,
        entry.original_vpk_names,
        entry.order,
        entry.shard,
      );
    } else {
      manifest.mark_disabled(&entry.mod_id, entry.disabled_vpks, entry.original_vpk_names);
    }
    changed = true;
  }
  changed
}

fn default_seed_shard() -> ShardIndex {
  ShardIndex::FIRST
}

#[tauri::command]
pub async fn seed_profile_vpk_manifest_entries(
  profile_folder: Option<String>,
  entries: Vec<SeedManifestEntry>,
) -> Result<(), Error> {
  log::info!(
    "Seeding VPK manifest for profile {profile_folder:?} with {} entries",
    entries.len()
  );

  let mod_manager = MANAGER.lock().unwrap();
  let addons_path = mod_manager.get_addons_path(profile_folder.as_deref())?;
  let mut manifest = ProfileVpkManifest::open_for_write(&addons_path)?;
  if seed_manifest_entries(&mut manifest, entries) {
    manifest.save(&addons_path)?;
    mod_manager.invalidate_localization_overlay(profile_folder.as_deref());
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::shard::ProfileBase;
  use crate::mod_manager::vpk_manifest::ProfileVpkManifestEntry;

  fn profile() -> (tempfile::TempDir, ProfileBase) {
    let temp = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(temp.path().join("citadel/addons/profile_1")).unwrap();
    std::fs::create_dir_all(base.path()).unwrap();
    (temp, base)
  }

  fn write(base: &ProfileBase, shard: ShardIndex, name: &str, bytes: &[u8]) -> std::path::PathBuf {
    let dir = base.shard_dir(shard);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, bytes).unwrap();
    path
  }

  fn quarantine_folder(base: &ProfileBase) -> std::path::PathBuf {
    base.path().join(QUARANTINE_DIR)
  }

  #[test]
  fn quarantine_keeps_the_shard_and_never_overwrites() {
    let (_temp, base) = profile();
    let second = ShardIndex::new(2).unwrap();
    write(&base, ShardIndex::FIRST, "pak01_dir.vpk", b"base");
    write(&base, second, "pak01_dir.vpk", b"overflow");
    std::fs::create_dir_all(quarantine_folder(&base)).unwrap();
    std::fs::write(quarantine_folder(&base).join("pak01_dir.vpk"), b"earlier").unwrap();

    let base_file = quarantine_unmanaged_vpk(base.clone(), "pak01_dir.vpk").unwrap();
    let overflow_file = quarantine_unmanaged_vpk(base.clone(), "addons2/pak01_dir.vpk").unwrap();

    assert_eq!(
      base_file,
      quarantine_folder(&base).join("pak01_dir (2).vpk")
    );
    assert_eq!(std::fs::read(&base_file).unwrap(), b"base");
    assert_eq!(
      overflow_file,
      quarantine_folder(&base).join("addons2-pak01_dir.vpk")
    );
    assert_eq!(std::fs::read(&overflow_file).unwrap(), b"overflow");
    assert_eq!(
      std::fs::read(quarantine_folder(&base).join("pak01_dir.vpk")).unwrap(),
      b"earlier"
    );
  }

  /// The analysis the user acted on can be stale: a mod may have taken the
  /// file since.
  #[test]
  fn quarantine_refuses_files_a_mod_owns() {
    let (_temp, base) = profile();
    let enabled = write(&base, ShardIndex::FIRST, "pak01_dir.vpk", b"enabled");
    let parked = write(&base, ShardIndex::FIRST, "900077_red.vpk", b"parked");
    let mut manifest = ProfileVpkManifest::default();
    manifest.mods.insert(
      "900001".to_string(),
      ProfileVpkManifestEntry {
        enabled: true,
        current_vpks: vec!["pak01_dir.vpk".to_string()],
        ..Default::default()
      },
    );
    manifest.mods.insert(
      "900077".to_string(),
      ProfileVpkManifestEntry {
        enabled: false,
        disabled_vpks: vec!["900077_red.vpk".to_string()],
        ..Default::default()
      },
    );
    manifest.save(base.path()).unwrap();

    for name in ["pak01_dir.vpk", "900077_red.vpk"] {
      assert!(matches!(
        quarantine_unmanaged_vpk(base.clone(), name),
        Err(Error::ModInvalid(_))
      ));
    }
    assert_eq!(std::fs::read(enabled).unwrap(), b"enabled");
    assert_eq!(std::fs::read(parked).unwrap(), b"parked");
  }

  #[test]
  fn quarantine_refuses_paths_outside_the_profile() {
    let (_temp, base) = profile();
    write(&base, ShardIndex::FIRST, "notes.txt", b"text");
    for name in [
      "../pak01_dir.vpk",
      "",
      "notes.txt",
      "sub/pak01_dir.vpk",
      "missing.vpk",
    ] {
      assert!(
        quarantine_unmanaged_vpk(base.clone(), name).is_err(),
        "{name:?} was accepted"
      );
    }
  }

  /// A link named like a leftover would otherwise move the file it points
  /// to, which may be one a mod owns.
  #[cfg(unix)]
  #[test]
  fn quarantine_refuses_a_linked_file() {
    let (_temp, base) = profile();
    let owned = write(&base, ShardIndex::FIRST, "pak01_dir.vpk", b"owned");
    let mut manifest = ProfileVpkManifest::default();
    manifest.mods.insert(
      "900001".to_string(),
      ProfileVpkManifestEntry {
        enabled: true,
        current_vpks: vec!["pak01_dir.vpk".to_string()],
        ..Default::default()
      },
    );
    manifest.save(base.path()).unwrap();
    let alias = base.path().join("900999_alias.vpk");
    std::os::unix::fs::symlink(&owned, &alias).unwrap();

    assert!(matches!(
      quarantine_unmanaged_vpk(base.clone(), "900999_alias.vpk"),
      Err(Error::UnauthorizedPath(_))
    ));
    assert_eq!(std::fs::read(&owned).unwrap(), b"owned");
    assert!(alias.symlink_metadata().unwrap().file_type().is_symlink());
  }

  #[cfg(unix)]
  #[test]
  fn quarantine_treats_a_dangling_link_as_taken() {
    let (temp, base) = profile();
    write(&base, ShardIndex::FIRST, "pak04_dir.vpk", b"stray");
    std::fs::create_dir_all(quarantine_folder(&base)).unwrap();
    let dangling = quarantine_folder(&base).join("pak04_dir.vpk");
    std::os::unix::fs::symlink(temp.path().join("gone"), &dangling).unwrap();

    let destination = quarantine_unmanaged_vpk(base.clone(), "pak04_dir.vpk").unwrap();

    assert_eq!(
      destination,
      quarantine_folder(&base).join("pak04_dir (2).vpk")
    );
    assert!(
      dangling
        .symlink_metadata()
        .unwrap()
        .file_type()
        .is_symlink()
    );
  }

  #[cfg(unix)]
  #[test]
  fn quarantine_refuses_a_linked_quarantine_folder() {
    let (temp, base) = profile();
    let source = write(&base, ShardIndex::FIRST, "pak04_dir.vpk", b"stray");
    let elsewhere = temp.path().join("elsewhere");
    std::fs::create_dir_all(&elsewhere).unwrap();
    std::os::unix::fs::symlink(&elsewhere, quarantine_folder(&base)).unwrap();

    assert!(matches!(
      quarantine_unmanaged_vpk(base.clone(), "pak04_dir.vpk"),
      Err(Error::UnauthorizedPath(_))
    ));
    assert!(source.exists());
    assert_eq!(std::fs::read_dir(elsewhere).unwrap().count(), 0);
  }

  fn test_game() -> (
    tempfile::TempDir,
    std::path::PathBuf,
    crate::mod_manager::ModManager,
  ) {
    let game = tempfile::tempdir().unwrap();
    let citadel = game.path().join("game/citadel");
    let addons = citadel.join("addons");
    std::fs::create_dir_all(&addons).unwrap();
    std::fs::write(
      citadel.join("gameinfo.gi"),
      "\"GameInfo\"\n{\n\"FileSystem\"\n{\nSearchPaths\n{\nGame citadel\n}\n}\n}\n",
    )
    .unwrap();
    let manager = crate::mod_manager::ModManager::for_test_game(game.path());
    (game, addons, manager)
  }

  fn imported_mod(mod_id: &str) -> super::super::downloads::ProfileImportMod {
    super::super::downloads::ProfileImportMod {
      mod_id: mod_id.into(),
      mod_name: "Restored mod".into(),
      download_files: Vec::new(),
      file_tree: None,
      is_map: false,
    }
  }

  fn vpks_in(folder: &std::path::Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(folder)
      .unwrap()
      .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
      .filter(|name| name.ends_with(".vpk"))
      .collect();
    names.sort();
    names
  }

  #[test]
  fn default_profile_import_installs_into_the_root_addons_folder() {
    let (_game, addons, mut manager) = test_game();
    std::fs::write(addons.join("42_restored.vpk"), b"downloaded").unwrap();

    let installed = install_imported_mod(&mut manager, &imported_mod("42"), "").unwrap();

    assert_eq!(installed.installed_vpks.len(), 1);
    assert_eq!(
      std::fs::read(addons.join(&installed.installed_vpks[0])).unwrap(),
      b"downloaded"
    );
  }

  #[test]
  fn an_import_replaces_the_variant_a_profile_has() {
    for enabled in [true, false] {
      let (game, addons, mut manager) = test_game();
      let mut manifest = ProfileVpkManifest::default();
      if enabled {
        std::fs::write(addons.join("pak01_dir.vpk"), b"variant-1").unwrap();
        manifest.mark_enabled(
          "42",
          vec!["pak01_dir.vpk".into()],
          vec!["variant1.vpk".into()],
          Some(0),
          ShardIndex::FIRST,
        );
      } else {
        std::fs::write(addons.join("42_variant1.vpk"), b"variant-1").unwrap();
        manifest.mark_disabled(
          "42",
          vec!["42_variant1.vpk".into()],
          vec!["variant1.vpk".into()],
        );
      }
      manifest.save(&addons).unwrap();
      std::fs::write(addons.join("42_variant3.vpk"), b"parked").unwrap();
      let prepared = game.path().join("variant2.vpk");
      std::fs::write(&prepared, b"variant-2").unwrap();

      let replaced =
        replace_imported_mod(&mut manager, &imported_mod("42"), "", &[prepared], None).unwrap();

      assert_eq!(
        vpks_in(&addons),
        replaced.installed_vpks,
        "enabled: {enabled}"
      );
      assert_eq!(
        std::fs::read(addons.join(&replaced.installed_vpks[0])).unwrap(),
        b"variant-2"
      );
      let manifest = ProfileVpkManifest::load(&addons).unwrap();
      let entry = &manifest.mods["42"];
      assert!(entry.enabled);
      assert_eq!(entry.current_vpks, replaced.installed_vpks);
      assert_eq!(entry.original_vpk_names, ["variant2.vpk"]);
    }
  }

  /// Switching writes the folder into gameinfo.gi, which only accepts ASCII
  /// names. A folder that fails that check can never be switched to.
  #[test]
  fn profile_folders_are_valid_gameinfo_search_paths() {
    for name in [
      "已导入配置 - 2026/10/20",
      "Профиль",
      "Perfil técnico",
      "Imported Profile - ٢٠/١٠/٢٠٢٦",
    ] {
      let folder = profile_folder_name("profile_1_abc", name);
      assert!(
        crate::mod_manager::shard::is_valid_search_path(
          &ShardIndex::FIRST.search_path(Some(&folder))
        ),
        "{name:?} produced {folder:?}"
      );
    }
  }

  /// The frontend reads the profile id back from the folder name; a trailing
  /// separator makes it treat the whole folder as a new id.
  #[test]
  fn a_name_with_nothing_to_keep_leaves_just_the_profile_id() {
    assert_eq!(profile_folder_name("profile_1_abc", "!!!"), "profile_1_abc");
    assert_eq!(
      profile_folder_name("profile_1_abc", "Профиль"),
      "profile_1_abc"
    );
  }
}
