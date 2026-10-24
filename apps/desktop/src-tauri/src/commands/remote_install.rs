use crate::app_runtime::AppHandle;
use crate::commands::deep_link::DeepLinkData;
use crate::deep_link::{is_valid_remote_install_key, validate_mod_deep_link};
use crate::errors::Error;
use crate::providers::gamebanana::{ApiResponse, GameBananaClient};
use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

const STORE_KEY: &str = "gamebanana_remote_install";

/// Kept in the Rust-owned store entry, so the key never lands in the persisted UI state.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pairing {
  member_id: u32,
  secret_key: String,
}

#[derive(Debug, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct RemoteInstallStatus {
  pub member_id: Option<u32>,
}

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
pub async fn get_remote_install_status(
  app_handle: AppHandle,
) -> Result<RemoteInstallStatus, Error> {
  Ok(RemoteInstallStatus {
    member_id: load_pairing(&app_handle)?.map(|pairing| pairing.member_id),
  })
}

#[tauri::command]
pub async fn pair_remote_install(
  app_handle: AppHandle,
  member_id: u32,
  secret_key: String,
) -> Result<RemoteInstallStatus, Error> {
  if !is_valid_remote_install_key(&secret_key) {
    return Err(Error::InvalidInput(
      "Invalid Remote Install key".to_string(),
    ));
  }

  save_pairing(
    &app_handle,
    Some(&Pairing {
      member_id,
      secret_key,
    }),
  )?;
  log::info!("Paired GameBanana Remote Install for member {member_id}");

  Ok(RemoteInstallStatus {
    member_id: Some(member_id),
  })
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
