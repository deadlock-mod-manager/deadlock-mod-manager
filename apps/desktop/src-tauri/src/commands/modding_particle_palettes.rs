use crate::{app_runtime::AppHandle, errors::Error};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Mutex};
use tauri::Manager;
use ts_rs::TS;

static PALETTES: Mutex<()> = Mutex::new(());
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingParticlePalette {
  pub id: String,
  pub name: String,
  pub colors: Vec<String>,
}
fn read(path: &Path) -> Result<Vec<ModdingParticlePalette>, Error> {
  match std::fs::read(path) {
    Ok(bytes) => {
      serde_json::from_slice(&bytes).map_err(|error| Error::InvalidInput(error.to_string()))
    }
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
    Err(error) => Err(error.into()),
  }
}
fn write(path: &Path, palettes: &[ModdingParticlePalette]) -> Result<(), Error> {
  super::modding_edits::write_atomic(
    path,
    &serde_json::to_vec(palettes).map_err(|error| Error::InvalidInput(error.to_string()))?,
  )
}
fn validate(palette: &ModdingParticlePalette) -> Result<(), Error> {
  if palette.id.is_empty()
    || palette.id.len() > 128
    || palette.name.trim().is_empty()
    || palette.name.len() > 128
    || palette.colors.len() > 64
    || palette.colors.iter().any(|color| {
      color.len() != 7
        || !color.starts_with('#')
        || !color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
    })
  {
    return Err(Error::InvalidInput(
      "Use a palette name up to 128 characters and up to 64 #RRGGBB colors".into(),
    ));
  }
  Ok(())
}
#[tauri::command]
pub fn get_modding_particle_palettes(app: AppHandle) -> Result<Vec<ModdingParticlePalette>, Error> {
  let _guard = PALETTES
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  read(
    &app
      .path()
      .app_config_dir()?
      .join("workbench-particle-palettes.json"),
  )
}
#[tauri::command]
pub fn save_modding_particle_palette(
  app: AppHandle,
  mut palette: ModdingParticlePalette,
) -> Result<(), Error> {
  validate(&palette)?;
  palette.name = palette.name.trim().to_owned();
  palette
    .colors
    .iter_mut()
    .for_each(|color| *color = color.to_ascii_lowercase());
  let mut seen = std::collections::BTreeSet::new();
  palette.colors.retain(|color| seen.insert(color.clone()));
  let _guard = PALETTES
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  let path = app
    .path()
    .app_config_dir()?
    .join("workbench-particle-palettes.json");
  let mut palettes = read(&path)?;
  if let Some(existing) = palettes
    .iter_mut()
    .find(|existing| existing.id == palette.id)
  {
    *existing = palette;
  } else {
    if palettes.len() >= 64 {
      return Err(Error::InvalidInput(
        "Keep up to 64 particle palettes".into(),
      ));
    }
    palettes.push(palette);
  }
  write(&path, &palettes)
}
#[tauri::command]
pub fn delete_modding_particle_palette(app: AppHandle, id: String) -> Result<(), Error> {
  let _guard = PALETTES
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  let path = app
    .path()
    .app_config_dir()?
    .join("workbench-particle-palettes.json");
  let mut palettes = read(&path)?;
  palettes.retain(|palette| palette.id != id);
  write(&path, &palettes)
}
