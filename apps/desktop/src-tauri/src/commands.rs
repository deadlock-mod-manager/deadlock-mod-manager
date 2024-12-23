use std::sync::Mutex;

use crate::mod_manager::{ModManager, Mod};
use std::sync::LazyLock;
use crate::errors::Error;
static MANAGER: LazyLock<Mutex<ModManager>> = LazyLock::new(|| Mutex::new(ModManager::new()));

#[tauri::command]
pub async fn find_game_path() -> Result<String, Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    match (mod_manager.find_steam(), mod_manager.find_game()) {
        (Ok(_), Ok(game_path)) => {
            println!("Found game at: {:?}", game_path);
            Ok(game_path.to_string_lossy().to_string())
        }
        (Err(e), _) => Err(e),
        (_, Err(e)) => Err(e)
    }
}

#[tauri::command]
pub async fn install_mod(deadlock_mod: Mod) -> Result<Mod, Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.install_mod(deadlock_mod)
}