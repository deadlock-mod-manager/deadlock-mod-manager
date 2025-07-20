use std::sync::Mutex;

use crate::errors::Error;
use crate::mod_manager::{Mod, ModManager};
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
pub async fn start_game(vanilla: bool, additional_args: String) -> Result<(), Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    log::info!(
        "Starting game with args: {:?} (vanilla: {:?})",
        additional_args,
        vanilla
    );
    mod_manager.run_game(vanilla, additional_args)
}

#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), Error> {
    crate::utils::show_in_folder_windows(&path)
}

#[tauri::command]
pub async fn clear_mods() -> Result<(), Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.clear_mods()
}

#[tauri::command]
pub async fn open_mods_folder() -> Result<(), Error> {
    let mod_manager = MANAGER.lock().unwrap();
    mod_manager.open_mods_folder()
}

#[tauri::command]
pub async fn open_game_folder() -> Result<(), Error> {
    let mod_manager = MANAGER.lock().unwrap();
    mod_manager.open_game_folder()
}

#[tauri::command]
pub async fn open_mods_store() -> Result<(), Error> {
    let mod_manager = MANAGER.lock().unwrap();
    mod_manager.open_mods_store()
}

#[tauri::command]
pub async fn uninstall_mod(mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.uninstall_mod(mod_id, vpks)
}

#[tauri::command]
pub async fn purge_mod(mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.purge_mod(mod_id, vpks)
}

#[tauri::command]
pub async fn is_game_running() -> Result<bool, Error> {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.is_game_running()
}
