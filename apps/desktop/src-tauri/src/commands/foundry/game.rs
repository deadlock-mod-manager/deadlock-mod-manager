//! Game- and app-directory lookups the Foundry needs, resolved through the mod
//! manager's existing Steam detection rather than a Foundry-specific search.

use std::path::{Path, PathBuf};

use crate::commands::state::MANAGER;
use crate::errors::Error;

/// The base game's `pak01_dir.vpk`, or `None` when Deadlock isn't installed.
/// Every default-hero and fallback asset lookup goes through this archive.
pub(crate) fn base_game_vpk_path() -> Result<Option<PathBuf>, Error> {
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
  let pak_path = game_path.join("game").join("citadel").join("pak01_dir.vpk");
  Ok(pak_path.exists().then_some(pak_path))
}

/// `<app_local_data>/foundry`: the root every editable skin workspace lives
/// under. Created lazily by the workspace module on first use.
pub(crate) fn foundry_workspace_root() -> Result<PathBuf, Error> {
  let manager = MANAGER
    .lock()
    .map_err(|e| Error::InvalidInput(format!("manager lock poisoned: {e}")))?;
  Ok(manager.get_app_local_data_path()?.join("foundry"))
}

/// Compare two paths by their canonical form, falling back to a literal compare
/// when a path can't be canonicalized (it may not exist yet).
pub(crate) fn paths_equal(left: &Path, right: &Path) -> bool {
  let left = std::fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
  let right = std::fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
  left == right
}
