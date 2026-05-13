use crate::errors::Error;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub async fn store_auth_token(app_handle: AppHandle, token: String) -> Result<(), Error> {
  log::info!("Storing authentication token");

  let store = app_handle
    .store("state.json")
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {e}")))?;

  store.set("auth_token", serde_json::json!(token));

  store
    .save()
    .map_err(|e| Error::InvalidInput(format!("Failed to save store: {e}")))?;

  Ok(())
}

#[tauri::command]
pub async fn get_auth_token(app_handle: AppHandle) -> Result<Option<String>, Error> {
  log::debug!("Retrieving authentication token");

  let store = app_handle
    .store("state.json")
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {e}")))?;

  let token = store.get("auth_token");

  match token {
    Some(value) => {
      if let Some(token_str) = value.as_str() {
        Ok(Some(token_str.to_string()))
      } else {
        Ok(None)
      }
    }
    None => Ok(None),
  }
}

#[tauri::command]
pub async fn clear_auth_token(app_handle: AppHandle) -> Result<(), Error> {
  log::info!("Clearing authentication token");

  let store = app_handle
    .store("state.json")
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {e}")))?;

  let _ = store.delete("auth_token");

  store
    .save()
    .map_err(|e| Error::InvalidInput(format!("Failed to save store: {e}")))?;

  Ok(())
}
