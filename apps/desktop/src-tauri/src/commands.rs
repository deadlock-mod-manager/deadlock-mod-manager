use std::sync::Mutex;

use crate::mod_manager::{ModManager, Mod};
use std::sync::LazyLock;

static MANAGER: LazyLock<Mutex<ModManager>> = LazyLock::new(|| Mutex::new(ModManager::new()));

#[tauri::command]
pub fn find_game_path() -> Result<String, String> {
    let mut mod_manager = MANAGER.lock().unwrap();
    match (mod_manager.find_steam(), mod_manager.find_game()) {
        (Ok(_), Ok(game_path)) => {
            println!("Found game at: {:?}", game_path);
            Ok(game_path.to_string_lossy().to_string())
        }
        (Err(e), _) => Err(format!("Failed to find Steam: {}", e)),
        (_, Err(e)) => Err(format!("Failed to find game: {}", e))
    }
}

#[tauri::command]
pub fn install_mod(deadlock_mod: Mod) -> Result<String, String> {
    let mut mod_manager = MANAGER.lock().unwrap();
    match mod_manager.install_mod(deadlock_mod) {
        Ok(_) => Ok("Mod installed successfully".to_string()),
        Err(e) => Err(format!("Failed to install mod: {}", e))
    }
}