use std::sync::Mutex;

use serde::Deserialize;
use tauri::AppHandle;
use vpkmerger::CancelToken;

use crate::commands::MANAGER;
use crate::errors::Error;
use crate::mod_compression::service;
use crate::mod_compression::state;
use crate::mod_manager::file_tree::ModFileTree;
use crate::mod_manager::mod_repository::Mod;

static ACTIVE_CANCEL: Mutex<Option<CancelToken>> = Mutex::new(None);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressionModInput {
  pub id: String,
  pub name: String,
  #[serde(default)]
  pub is_map: bool,
  #[serde(default)]
  pub installed_vpks: Vec<String>,
  #[serde(default)]
  pub file_tree: Option<ModFileTree>,
  #[serde(default)]
  pub install_order: Option<u32>,
  #[serde(default)]
  pub original_vpk_names: Vec<String>,
  #[serde(default)]
  pub uses_compression: bool,
}

impl From<CompressionModInput> for Mod {
  fn from(m: CompressionModInput) -> Self {
    Mod {
      id: m.id,
      name: m.name,
      is_map: m.is_map,
      installed_vpks: m.installed_vpks,
      file_tree: m.file_tree,
      install_order: m.install_order,
      original_vpk_names: m.original_vpk_names,
      uses_compression: m.uses_compression,
    }
  }
}

#[tauri::command]
pub async fn mod_compression_set_config(
  enabled: bool,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  log::info!(
    "mod_compression_set_config: enabled={enabled}, profile={profile_folder:?}"
  );
  state::set_compression_enabled(enabled, profile_folder);
  Ok(())
}

fn sync_mods_into_repository(
  manager: &mut crate::mod_manager::ModManager,
  mods: Vec<CompressionModInput>,
) {
  let count = mods.len();
  for m in mods {
    manager.get_mod_repository_mut().add_mod(m.into());
  }
  log::info!(
    "mod_compression: synced {} mod(s) from frontend into backend repository",
    count
  );
}

#[tauri::command]
pub async fn mod_compression_rebuild(
  app: AppHandle,
  profile_folder: Option<String>,
  mods: Vec<CompressionModInput>,
) -> Result<(), Error> {
  log::info!(
    "mod_compression_rebuild invoked: profile={profile_folder:?}, mods={}",
    mods.len()
  );
  let token = CancelToken::new();
  {
    let mut g = ACTIVE_CANCEL
      .lock()
      .map_err(|_| Error::InvalidInput("compression lock".into()))?;
    *g = Some(token.clone());
  }
  let app2 = app.clone();
  let pf = profile_folder.clone();
  let result = tauri::async_runtime::spawn_blocking(move || {
    let mut manager = MANAGER
      .lock()
      .map_err(|_| Error::InvalidInput("manager lock".into()))?;
    sync_mods_into_repository(&mut manager, mods);
    service::rebuild_compressed_addon(&app2, &mut manager, pf, &token)
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
  {
    let mut g = ACTIVE_CANCEL
      .lock()
      .map_err(|_| Error::InvalidInput("compression lock".into()))?;
    *g = None;
  }
  result
}

#[tauri::command]
pub async fn mod_compression_disable(
  app: AppHandle,
  profile_folder: Option<String>,
  mods: Vec<CompressionModInput>,
) -> Result<(), Error> {
  log::info!(
    "mod_compression_disable invoked: profile={profile_folder:?}, mods={}",
    mods.len()
  );
  let token = CancelToken::new();
  {
    let mut g = ACTIVE_CANCEL
      .lock()
      .map_err(|_| Error::InvalidInput("compression lock".into()))?;
    *g = Some(token.clone());
  }
  let app2 = app.clone();
  let pf = profile_folder.clone();
  let result = tauri::async_runtime::spawn_blocking(move || {
    let mut manager = MANAGER
      .lock()
      .map_err(|_| Error::InvalidInput("manager lock".into()))?;
    sync_mods_into_repository(&mut manager, mods);
    service::disable_compressed_addon(&app2, &mut manager, pf, &token)
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
  {
    let mut g = ACTIVE_CANCEL
      .lock()
      .map_err(|_| Error::InvalidInput("compression lock".into()))?;
    *g = None;
  }
  result
}

#[tauri::command]
pub fn mod_compression_cancel() -> Result<(), Error> {
  if let Ok(mut g) = ACTIVE_CANCEL.lock()
    && let Some(t) = g.take()
  {
    t.cancel();
  }
  Ok(())
}
