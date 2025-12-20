// Prevents additional console window on Windows in release
#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

pub mod cli;
mod commands;
mod deep_link;
mod discord_rpc;
mod download_manager;
mod errors;
mod ingest_tool;
mod mod_manager;
mod reports;
mod utils;

use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_store::StoreExt;

use crate::deep_link::{
  EVENT_AUTH_CALLBACK, EVENT_AUTH_ERROR, EVENT_DEEP_LINK_RECEIVED, EVENT_OIDC_CALLBACK,
  EVENT_OIDC_ERROR, PATH_LEGACY_AUTH_CALLBACK, PATH_OIDC_CALLBACK, SCHEME_PRIMARY,
  SCHEME_SECONDARY, SCHEME_SHORT, emit_to_main_window, is_deep_link, parse_query_params,
  strip_scheme, validate_mod_deep_link,
};

fn handle_deep_link_url(
  app_handle: &tauri::AppHandle,
  url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
  log::info!("[DeepLink] Processing deep link URL: {url}");

  let data_part = match strip_scheme(url) {
    Some(part) => part,
    None => {
      log::error!(
        "[DeepLink] Invalid deep link format - no matching scheme found. Expected: {}, {}, {}",
        SCHEME_PRIMARY,
        SCHEME_SECONDARY,
        SCHEME_SHORT
      );
      return Ok(());
    }
  };

  if data_part.starts_with(PATH_OIDC_CALLBACK) {
    if let Some(query_start) = data_part.find('?') {
      let query = &data_part[query_start + 1..];
      let params = parse_query_params(query);

      if let Some(code) = params.get("code") {
        let state = params.get("state").cloned();
        emit_to_main_window(
          app_handle,
          EVENT_OIDC_CALLBACK,
          serde_json::json!({ "code": code, "state": state }),
        )?;
        return Ok(());
      }

      if let Some(error) = params.get("error") {
        let error_description = params.get("error_description").cloned();
        log::error!("OIDC callback error: {error}");
        emit_to_main_window(
          app_handle,
          EVENT_OIDC_ERROR,
          serde_json::json!({ "error": error, "error_description": error_description }),
        )?;
        return Ok(());
      }
    }

    log::error!("OIDC callback deep link missing code or error parameter");
    return Ok(());
  }

  if data_part.starts_with(PATH_LEGACY_AUTH_CALLBACK) {
    if let Some(query_start) = data_part.find('?') {
      let query = &data_part[query_start + 1..];
      let params = parse_query_params(query);

      if let Some(token) = params.get("token") {
        emit_to_main_window(app_handle, EVENT_AUTH_CALLBACK, token)?;
        return Ok(());
      }

      if let Some(error) = params.get("error") {
        log::error!("Auth callback error: {error}");
        emit_to_main_window(app_handle, EVENT_AUTH_ERROR, error)?;
        return Ok(());
      }
    }

    log::error!("Auth callback deep link missing token or error parameter");
    return Ok(());
  }

  if let Some((download_url, mod_type, mod_id)) = validate_mod_deep_link(data_part) {
    let parsed_data = commands::DeepLinkData {
      download_url,
      mod_type,
      mod_id,
    };
    emit_to_main_window(app_handle, EVENT_DEEP_LINK_RECEIVED, parsed_data)?;
  } else {
    log::error!("Invalid mod installation deep link format");
  }

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
        log::warn!("Failed to load .env file: {e}");
      }
    } else {
      log::info!("Loaded environment variables from .env file");
    }
  }

  let mut builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _| {
      log::info!(
        "[DeepLink] Single instance callback triggered with argv: {:?}",
        argv
      );

      for arg in argv {
        if is_deep_link(&arg) {
          if let Err(e) = handle_deep_link_url(app, &arg) {
            log::error!("[DeepLink] Failed to handle deep link from single instance: {e}");
          }

          if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
            let _ = window.show();
            let _ = window.unminimize();
          } else {
            log::warn!("[DeepLink] Could not find main window to focus");
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
    .plugin(tauri_plugin_machine_uid::init());

  builder
    .manage(discord_rpc::DiscordState::new())
    .setup(|app| {
      let handle = app.app_handle();

      let _store = handle.store("state.json")?;

      log::info!("[DeepLink] Registering deep link protocols...");

      #[cfg(desktop)]
      {
        if let Err(e) = app
          .deep_link()
          .register(SCHEME_PRIMARY.trim_end_matches(':'))
        {
          log::error!("[DeepLink] Failed to register {}: {e}", SCHEME_PRIMARY);
        }
      }

      // Register all schemes on Linux and Windows (including debug mode)
      #[cfg(any(target_os = "linux", windows))]
      {
        if let Err(e) = app.deep_link().register_all() {
          log::error!("[DeepLink] Failed to register_all: {e}");
        }
      }

      // Handle deep links only for app startup (when launched by deep link)
      // The single instance handler will take care of deep links when app is already running
      let start_urls = app.deep_link().get_current()?;

      if let Some(urls) = start_urls {
        log::info!("[DeepLink] App started with deep link URLs: {:?}", urls);
        for url in urls {
          if let Err(e) = handle_deep_link_url(handle, url.as_ref()) {
            log::error!("[DeepLink] Failed to handle startup deep link: {e}");
          }
        }
      }

      log::info!("[App] Setup completed, starting application...");
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::find_game_path,
      commands::set_game_path,
      commands::get_mod_file_tree,
      commands::install_mod,
      commands::stop_game,
      commands::start_game,
      commands::show_in_folder,
      commands::show_mod_in_store,
      commands::show_mod_in_game,
      commands::clear_mods,
      commands::open_mods_folder,
      commands::open_game_folder,
      commands::uninstall_mod,
      commands::purge_mod,
      commands::reorder_mods,
      commands::reorder_mods_by_remote_id,
      commands::is_game_running,
      commands::parse_deep_link,
      commands::get_deep_link_debug_info,
      commands::backup_gameinfo,
      commands::restore_gameinfo_backup,
      commands::reset_to_vanilla,
      commands::validate_gameinfo_patch,
      commands::get_gameinfo_status,
      commands::open_gameinfo_editor,
      commands::set_language,
      commands::set_api_url,
      commands::is_auto_update_disabled,
      commands::extract_archive,
      commands::remove_mod_folder,
      commands::parse_vpk_file,
      commands::check_addons_exist,
      commands::analyze_local_addons,
      commands::create_report,
      commands::get_report_counts,
      commands::store_auth_token,
      commands::get_auth_token,
      commands::clear_auth_token,
      commands::create_addons_backup,
      commands::list_addons_backups,
      commands::restore_addons_backup,
      commands::delete_addons_backup,
      commands::get_addons_backup_info,
      commands::open_addons_backups_folder,
      commands::queue_download,
      commands::cancel_download,
      commands::get_download_status,
      commands::get_all_downloads,
      commands::replace_mod_vpks,
      commands::copy_selected_vpks_from_archive,
      commands::trigger_cache_scan,
      commands::start_cache_watcher,
      commands::stop_cache_watcher,
      commands::get_ingest_status,
      commands::initialize_ingest_tool,
      commands::set_discord_presence,
      commands::clear_discord_presence,
      commands::disconnect_discord,
      commands::create_profile_folder,
      commands::delete_profile_folder,
      commands::switch_profile,
      commands::list_profile_folders,
      commands::get_profile_installed_vpks,
      commands::import_profile_batch,
      commands::get_autoexec_config,
      commands::update_autoexec_config,
      commands::open_autoexec_folder,
      commands::open_autoexec_editor,
      commands::apply_crosshair_to_autoexec,
      commands::remove_crosshair_from_autoexec
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
