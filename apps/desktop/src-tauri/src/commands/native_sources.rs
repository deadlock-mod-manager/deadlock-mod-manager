use crate::errors::Error;
use crate::providers::native_sources::links::{self, LINKS_ALLOW_LOCAL_NETWORK};
use crate::providers::native_sources::{
  NativeSourceLink, NativeSourceLinkTarget, NativeSourceListing, NativeSourceManager,
  NativeSourceMod, NativeSourceRelease, NativeSourceSummary,
};
use tauri::State;

#[tauri::command]
pub async fn preview_native_source(
  state: State<'_, NativeSourceManager>,
  descriptor_url: String,
  allow_local_network: Option<bool>,
) -> Result<NativeSourceSummary, Error> {
  let mut preview = state
    .preview(&descriptor_url, allow_local_network.unwrap_or(false))
    .await?;
  // Additional declared media origins have not been accepted at preview time.
  preview.descriptor.icon_url = None;
  Ok(preview)
}

#[tauri::command]
pub async fn add_native_source(
  state: State<'_, NativeSourceManager>,
  descriptor_url: String,
  allow_local_network: Option<bool>,
  preview_token: String,
) -> Result<NativeSourceSummary, Error> {
  state
    .add_reviewed(
      &descriptor_url,
      allow_local_network.unwrap_or(false),
      &preview_token,
    )
    .await
}

#[tauri::command]
pub async fn list_native_sources(
  state: State<'_, NativeSourceManager>,
) -> Result<Vec<NativeSourceSummary>, Error> {
  state.list().await
}

#[tauri::command]
pub async fn set_native_source_enabled(
  state: State<'_, NativeSourceManager>,
  source_key: String,
  enabled: bool,
) -> Result<NativeSourceSummary, Error> {
  state.set_enabled(&source_key, enabled).await
}

#[tauri::command]
pub async fn remove_native_source(
  state: State<'_, NativeSourceManager>,
  source_key: String,
) -> Result<(), Error> {
  state.remove(&source_key).await
}

#[tauri::command]
pub async fn refresh_native_source(
  state: State<'_, NativeSourceManager>,
  source_key: String,
) -> Result<NativeSourceSummary, Error> {
  state.refresh(&source_key).await
}

#[tauri::command]
pub async fn query_native_source(
  state: State<'_, NativeSourceManager>,
  source_key: String,
  query: Option<String>,
) -> Result<Vec<NativeSourceListing>, Error> {
  state
    .query(&source_key, query.as_deref().unwrap_or(""))
    .await
}

#[tauri::command]
pub async fn get_native_source_detail(
  state: State<'_, NativeSourceManager>,
  source_key: String,
  listing_id: String,
) -> Result<NativeSourceListing, Error> {
  state.detail(&source_key, &listing_id).await
}

#[tauri::command]
pub async fn get_native_source_mod(
  state: State<'_, NativeSourceManager>,
  remote_id: String,
) -> Result<NativeSourceMod, Error> {
  state.mod_by_remote_id(&remote_id).await
}

#[tauri::command]
pub async fn get_native_source_release_history(
  state: State<'_, NativeSourceManager>,
  remote_id: String,
) -> Result<Vec<NativeSourceRelease>, Error> {
  state.release_history(&remote_id).await
}

/// Hands the window every source link that arrived since it last asked.
#[tauri::command]
pub fn take_pending_native_source_links() -> Vec<NativeSourceLink> {
  links::take_pending()
}

/// Rechecks the link the renderer sends back, then finds its listing.
#[tauri::command]
pub async fn resolve_native_source_link(
  state: State<'_, NativeSourceManager>,
  descriptor_url: String,
  source_id: String,
  listing_id: String,
  release_id: Option<String>,
  artifact_id: Option<String>,
) -> Result<NativeSourceLinkTarget, Error> {
  let link = links::install_link(
    &descriptor_url,
    &source_id,
    &listing_id,
    release_id.as_deref(),
    artifact_id.as_deref(),
    LINKS_ALLOW_LOCAL_NETWORK,
  )?;
  state.resolve_link(&link).await
}
