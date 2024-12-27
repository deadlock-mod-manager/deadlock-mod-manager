// Prevents additional console window on Windows in release
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod errors;
mod mod_manager;
mod utils;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("deadlock-mod-manager".into()),
                    }),
                ])
                .max_file_size(1_000_000) // 1MB
                .level(log::LevelFilter::Info)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .filter(|metadata| metadata.target() != "tracing")
                .build(),
        )
        .setup(|app| {
            let handle = app.app_handle();

            #[cfg(desktop)]
            let _ = handle.plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}));

            // Prepare store
            let _store = handle.store("state.json")?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::find_game_path,
            commands::install_mod,
            commands::stop_game,
            commands::start_game,
            commands::show_in_folder,
            commands::clear_mods,
            commands::open_mods_folder,
            commands::open_game_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
