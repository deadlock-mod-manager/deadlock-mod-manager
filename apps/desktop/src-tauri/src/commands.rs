use std::sync::Mutex;

use crate::errors::Error;
use crate::mod_manager::{Mod, ModManager};
use std::process::Command;
use std::sync::LazyLock;

static MANAGER: LazyLock<Mutex<ModManager>> = LazyLock::new(|| Mutex::new(ModManager::new()));

#[tauri::command]
pub async fn find_game_path() -> Result<String, Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    match (mod_manager.find_steam(), mod_manager.find_game()) {
        (Ok(_), Ok(game_path)) => {
            log::info!("Found game at: {:?}", game_path);
            Ok(game_path.to_string_lossy().to_string())
        }
        (Err(e), _) => {
            log::error!("Failed to find Steam: {}", e);
            Err(e)
        }
        (_, Err(e)) => {
            log::error!("Failed to find game: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn install_mod(deadlock_mod: Mod) -> Result<Mod, Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.install_mod(deadlock_mod)
}

#[tauri::command]
pub async fn stop_game() -> Result<(), Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.stop_game()
}

#[tauri::command]
pub async fn start_game() -> Result<(), Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.run_game(vec![])
}

#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), Error> {
    #[cfg(target_os = "windows")]
    {
        match Command::new("explorer")
            .args(["/select,", &path]) // The comma after select is not a typo
            .spawn()
        {
            Ok(_) => Ok(()),
            Err(e) => Err(Error::FailedToOpenFolder(e.to_string())),
        }
    }
}
