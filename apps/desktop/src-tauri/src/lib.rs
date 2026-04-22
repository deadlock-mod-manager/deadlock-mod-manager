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
mod dropped_mod_file;
mod errors;
mod flatpak;
mod hero_detector;
mod ingest_tool;
mod logs;
mod mod_compression;
mod mod_manager;
pub mod proxy;
mod reports;
mod utils;

use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_store::StoreExt;

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
    builder = builder.plugin(tauri_plugin_single_instance::init(
      deep_link::on_second_instance,
    ));
  }
  let context = tauri::generate_context!();
  let (ota_plugin, context) = tauri_plugin_ota_updater::init(context);

  builder = builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_clipboard_manager::init())
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
        .max_file_size(1_000_000)
        .level(log::LevelFilter::Info)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
        .filter(|metadata| metadata.target() != "tracing")
        .build(),
    )
    .plugin(tauri_plugin_machine_uid::init())
    .plugin(ota_plugin);

  builder
    .manage(discord_rpc::DiscordState::new())
    .setup(|app| {
      let _store = app.store("state.json")?;
      deep_link::setup(app)?;

      {
        let mut mod_manager = commands::MANAGER
          .lock()
          .map_err(|e| format!("Failed to acquire mod manager lock: {e}"))?;
        mod_manager.set_app_handle(app.handle().clone());
      }

      {
        let mod_manager = commands::MANAGER
          .lock()
          .map_err(|e| format!("Failed to acquire mod manager lock: {e}"))?;
        if let Some(game_path) = mod_manager.get_steam_manager().get_game_path() {
          let addons = game_path.join("game").join("citadel").join("addons");
          mod_compression::service::cleanup_stale_compression_tmp_files(&addons);
          if let Ok(false) = mod_compression::service::validate_manifest_on_disk(&addons) {
            log::warn!(
              "Mod compression manifest is inconsistent with shard files on disk (default profile)"
            );
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
      commands::open_mods_data_folder,
      commands::install_mod_fonts,
      commands::discard_mod_fonts,
      commands::scan_and_stash_local_mod_fonts,
      #[cfg(debug_assertions)]
      commands::debug_trigger_font_install,
      #[cfg(debug_assertions)]
      commands::debug_queue_local_zip,
      commands::clear_download_cache,
      commands::clear_all_mods_data,
      commands::uninstall_mod,
      commands::purge_mod,
      mod_compression::commands::mod_compression_set_config,
      mod_compression::commands::mod_compression_rebuild,
      mod_compression::commands::mod_compression_disable,
      mod_compression::commands::mod_compression_cancel,
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
      flatpak::is_flatpak,
      flatpak::update_flatpak,
      commands::is_linux_gpu_optimization_active,
      commands::extract_archive,
      commands::remove_mod_folder,
      commands::parse_vpk_file,
      hero_detector::detect_mod_hero,
      hero_detector::detect_mod_heroes_batch,
      hero_detector::clear_vpk_entry_cache,
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
      commands::prune_addons_backups,
      commands::open_addons_backups_folder,
      commands::queue_download,
      commands::cancel_download,
      commands::pause_download,
      commands::resume_download,
      commands::get_download_status,
      commands::get_all_downloads,
      commands::replace_mod_vpks,
      commands::copy_selected_vpks_from_archive,
      commands::copy_local_mod_vpks,
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
      commands::create_server_addons_folder,
      commands::delete_server_addons_folder,
      commands::list_server_addons_folders,
      commands::apply_server_gameinfo,
      commands::restore_active_profile_gameinfo,
      commands::cleanup_stale_server_gameinfo,
      commands::download_custom_provider_mod,
      commands::get_profile_installed_vpks,
      commands::delete_profile_vpk,
      commands::show_profile_vpk_in_folder,
      commands::import_profile_batch,
      commands::register_analyzed_mod,
      commands::batch_update_mods,
      commands::get_autoexec_config,
      commands::update_autoexec_config,
      commands::open_autoexec_folder,
      commands::open_autoexec_editor,
      commands::apply_crosshair_to_autoexec,
      commands::remove_crosshair_from_autoexec,
      commands::add_map_command_to_autoexec,
      commands::remove_map_command_from_autoexec,
      commands::get_map_command_from_autoexec,
      commands::watch_console_log,
      commands::stop_watching_console_log,
      commands::get_log_info,
      commands::open_logs_folder,
      commands::open_log_file,
      commands::get_logs_for_ai,
      commands::get_crash_dumps_info,
      commands::open_crash_dumps_folder,
      commands::parse_crash_dump,
      commands::parse_latest_crash_dump,
      commands::open_latest_crash_dump_parsed,
      commands::read_dropped_mod_file,
      commands::check_filesystem_writable,
      commands::test_fileserver_latency,
      proxy::set_proxy_config,
      proxy::get_proxy_config,
      proxy::test_proxy_connection
    ])
    .run(context)
    .expect("error while running tauri application");
}
