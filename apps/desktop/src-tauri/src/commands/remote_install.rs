use crate::app_runtime::AppHandle;
use crate::commands::deep_link::DeepLinkData;
use crate::deep_link::validate_mod_deep_link;
use crate::errors::Error;
use crate::providers::gamebanana::{ApiResponse, GameBananaClient};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_store::StoreExt;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

const STORE_KEY: &str = "gamebanana_remote_install";

/// Kept in the Rust-owned store entry, so the key never reaches the webview.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pairing {
  pub member_id: u32,
  pub secret_key: String,
}

/// A pair link waiting for the user to confirm it in the app.
#[derive(Default)]
pub struct PendingPairing(pub Mutex<Option<Pairing>>);

#[derive(Debug, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct GameBananaMember {
  pub name: String,
  pub avatar_url: Option<String>,
  pub profile_url: String,
}

fn load_pairing(app_handle: &AppHandle) -> Result<Option<Pairing>, Error> {
  let store = app_handle
    .store(crate::runtime_environment::state_store_path())
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {e}")))?;
  Ok(
    store
      .get(STORE_KEY)
      .and_then(|value| serde_json::from_value(value).ok()),
  )
}

fn save_pairing(app_handle: &AppHandle, pairing: Option<&Pairing>) -> Result<(), Error> {
  let store = app_handle
    .store(crate::runtime_environment::state_store_path())
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {e}")))?;

  match pairing {
    Some(pairing) => store.set(STORE_KEY, serde_json::json!(pairing)),
    None => {
      store.delete(STORE_KEY);
    }
  }

  store
    .save()
    .map_err(|e| Error::InvalidInput(format!("Failed to save store: {e}")))
}

#[tauri::command]
pub async fn get_remote_install_status(app_handle: AppHandle) -> Result<Option<u32>, Error> {
  Ok(load_pairing(&app_handle)?.map(|pairing| pairing.member_id))
}

#[tauri::command]
pub async fn confirm_remote_install_pair(
  app_handle: AppHandle,
  pending: State<'_, PendingPairing>,
) -> Result<(), Error> {
  let pairing = pending
    .0
    .lock()
    .map_err(|_| Error::InvalidInput("Remote Install pairing state is unavailable".to_string()))?
    .take()
    .ok_or_else(|| Error::InvalidInput("No Remote Install pairing to confirm".to_string()))?;
  save_pairing(&app_handle, Some(&pairing))?;
  log::info!(
    "Paired GameBanana Remote Install for member {}",
    pairing.member_id
  );
  Ok(())
}

#[tauri::command]
pub async fn unpair_remote_install(app_handle: AppHandle) -> Result<(), Error> {
  save_pairing(&app_handle, None)?;
  log::info!("Unpaired GameBanana Remote Install");
  Ok(())
}

/// A member's public GameBanana profile, shown before pairing and in Settings.
#[tauri::command]
pub async fn get_gamebanana_member(member_id: u32) -> Result<GameBananaMember, Error> {
  let profile = GameBananaClient::new()?
    .member_profile(member_id, &CancellationToken::new())
    .await?;

  Ok(GameBananaMember {
    name: profile.name,
    avatar_url: profile.avatar_url.filter(|url| !url.is_empty()),
    profile_url: profile.profile_url,
  })
}

/// Fetches the member's queue. Invalid entries are skipped so one bad item
/// does not hold back the rest of the batch.
#[tauri::command]
pub async fn poll_remote_install(app_handle: AppHandle) -> Result<Vec<DeepLinkData>, Error> {
  let Some(pairing) = load_pairing(&app_handle)? else {
    return Ok(Vec::new());
  };

  let response = GameBananaClient::new()?
    .remote_install_queue(
      pairing.member_id,
      &pairing.secret_key,
      &CancellationToken::new(),
    )
    .await?;

  let entries = match response {
    ApiResponse::Ok(entries) => entries.unwrap_or_default(),
    ApiResponse::Rejected { code } => {
      return Err(Error::ProviderInvalidResponse(format!(
        "Remote Install rejected the pairing ({code})"
      )));
    }
  };

  let items: Vec<DeepLinkData> = entries
    .iter()
    .filter_map(|entry| {
      let parsed = validate_mod_deep_link(entry);
      if parsed.is_none() {
        log::warn!("Skipping invalid Remote Install entry");
      }
      parsed
    })
    .map(|(download_url, mod_type, mod_id)| DeepLinkData {
      download_url,
      mod_type,
      mod_id,
    })
    .collect();

  if !items.is_empty() {
    log::info!("Retrieved {} Remote Install item(s)", items.len());
  }

  Ok(items)
}
