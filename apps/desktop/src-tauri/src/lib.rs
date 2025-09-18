// Prevents additional console window on Windows in release
#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod commands;
mod errors;
mod mod_manager;
mod utils;

#[cfg(test)]
mod tests;

use std::env;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_posthog::{init, PostHogConfig};
use tauri_plugin_store::StoreExt;

fn handle_deep_link_url(
  app_handle: &tauri::AppHandle,
  url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
  log::info!("Processing deep link URL: {}", url);

  // Parse the deep link manually here to avoid async issues
  let url = url.trim();

  // Remove the protocol prefix
  let data_part = if let Some(stripped) = url.strip_prefix("deadlock-mod-manager:") {
    stripped
  } else if let Some(stripped) = url.strip_prefix("deadlock-modmanager:") {
    stripped
  } else {
    log::error!("Invalid deep link format");
    return Ok(()); // Don't fail the whole app
  };

  // Split by comma to get the three parts
  let parts: Vec<&str> = data_part.split(',').collect();

  if parts.len() != 3 {
    log::error!("Deep link must contain exactly 3 parts separated by commas");
    return Ok(()); // Don't fail the whole app
  }

  let download_url = parts[0].to_string();
  let mod_type = parts[1].to_string();
  let mod_id = parts[2].to_string();

  // Validate that the download URL is from gamebanana
  if !download_url.contains("gamebanana.com") {
    log::error!("Download URL must be from gamebanana.com");
    return Ok(());
  }

  // Validate that mod_id is numeric
  if mod_id.parse::<u32>().is_err() {
    log::error!("Mod ID must be numeric");
    return Ok(());
  }

  let parsed_data = commands::DeepLinkData {
    download_url,
    mod_type,
    mod_id,
  };

  // Emit event to frontend with the parsed data
  if let Some(window) = app_handle.get_webview_window("main") {
    window.emit("deep-link-received", &parsed_data)?;
  }

  log::info!("Deep link event emitted successfully");
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(debug_assertions)]
  {
    if let Err(e) = dotenvy::dotenv() {
      if e.not_found() {
        log::debug!("No .env file found, continuing without it");
      } else {
        log::warn!("Failed to load .env file: {}", e);
      }
    } else {
      log::info!("Loaded environment variables from .env file");
    }
  }

  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      println!(
        "a new app instance was opened with {argv:?} and the deep link event was already triggered"
      );

      // Handle deep links passed through single instance
      for arg in argv {
        if arg.starts_with("deadlock-mod-manager:") || arg.starts_with("deadlock-modmanager:") {
          println!("Processing deep link from single instance: {}", arg);
          if let Err(e) = handle_deep_link_url(&app, &arg) {
            log::error!("Failed to handle deep link from single instance: {}", e);
          }

          // Bring window to focus when deep link is triggered
          if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
            let _ = window.show();
            let _ = window.unminimize();
          }
        }
      }
    }));
  }

  builder = builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_upload::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
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
    .plugin(init(PostHogConfig {
      api_key: env::var("POSTHOG_KEY").unwrap_or_default(),
      ..Default::default()
    }));

  builder
    .setup(|app| {
      let handle = app.app_handle();

      // Prepare store
      let _store = handle.store("state.json")?;

      #[cfg(desktop)]
      app.deep_link().register("deadlock-mod-manager")?;

      // Handle deep links only for app startup (when launched by deep link)
      // The single instance handler will take care of deep links when app is already running
      let start_urls = app.deep_link().get_current()?;
      if let Some(urls) = start_urls {
        // app was likely started by a deep link
        println!("App started with deep link URLs: {:?}", urls);
        for url in urls {
          if let Err(e) = handle_deep_link_url(&handle, &url.to_string()) {
            log::error!("Failed to handle startup deep link: {}", e);
          }
        }
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::find_game_path,
      commands::get_mod_file_tree,
      commands::install_mod,
      commands::stop_game,
      commands::start_game,
      commands::show_in_folder,
      commands::clear_mods,
      commands::open_mods_folder,
      commands::open_game_folder,
      commands::open_mods_store,
      commands::uninstall_mod,
      commands::purge_mod,
      commands::is_game_running,
      commands::parse_deep_link,
      commands::backup_gameinfo,
      commands::restore_gameinfo_backup,
      commands::reset_to_vanilla,
      commands::validate_gameinfo_patch,
      commands::get_gameinfo_status,
      commands::open_gameinfo_editor,
      commands::set_language,
      commands::extract_archive,
      commands::remove_mod_folder,
      // Addons System Commands
      commands::activate_mod,
      commands::deactivate_mod,
      commands::get_installed_mods_from_addons,
      commands::get_active_mods_from_addons
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
