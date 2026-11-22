use std::path::{Path, PathBuf};

use crate::commands::state::MANAGER;
use crate::errors::Error;

pub(crate) fn base_game_vpk_path() -> Result<Option<PathBuf>, Error> {
  game_pak("citadel")
}

pub(crate) fn core_vpk_path() -> Result<Option<PathBuf>, Error> {
  game_pak("core")
}

fn game_pak(content: &str) -> Result<Option<PathBuf>, Error> {
  let mut manager = MANAGER
    .lock()
    .map_err(|e| Error::InvalidInput(format!("manager lock poisoned: {e}")))?;
  let game_path = manager
    .get_steam_manager()
    .get_game_path()
    .cloned()
    .or_else(|| manager.find_game().ok());
  let Some(game_path) = game_path else {
    return Ok(None);
  };
  let pak_path = game_path.join("game").join(content).join("pak01_dir.vpk");
  Ok(pak_path.exists().then_some(pak_path))
}

pub(crate) fn foundry_workspace_root() -> Result<PathBuf, Error> {
  let manager = MANAGER
    .lock()
    .map_err(|e| Error::InvalidInput(format!("manager lock poisoned: {e}")))?;
  Ok(manager.get_app_local_data_path()?.join("foundry"))
}

pub(crate) fn paths_equal(left: &Path, right: &Path) -> bool {
  let left = std::fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
  let right = std::fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
  left == right
}
