// Prevents additional console window on Windows in release
#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

pub mod cli;
mod commands;
mod deep_link;
mod download_manager;
mod dropped_mod_file;
mod errors;
mod flatpak;
mod game_presence;
mod hero_detector;
mod ingest_tool;
mod logs;
mod mod_manager;
pub mod proxy;
mod reports;
mod updater_channel;
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
  let mut context = tauri::generate_context!();
  updater_channel::apply_to_context(&mut context);
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
    .manage(game_presence::DiscordState::new())
    .setup(|app| {
      let _store = app.store("state.json")?;
      deep_link::setup(app)?;

      {
        let mut mod_manager = commands::state::MANAGER
          .lock()
          .map_err(|e| format!("Failed to acquire mod manager lock: {e}"))?;
        mod_manager.set_app_handle(app.handle().clone());
      }

      log::info!("[App] Setup completed, starting application...");
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::game::find_game_path,
      commands::game::set_game_path,
      commands::mods::get_mod_file_tree,
      commands::mods::install_mod,
      commands::game::stop_game,
      commands::game::start_game,
      commands::folders::show_in_folder,
      commands::folders::show_mod_in_store,
      commands::folders::show_mod_in_game,
      commands::mods::clear_mods,
      commands::folders::open_mods_folder,
      commands::folders::open_game_folder,
      commands::folders::open_mods_data_folder,
      commands::fonts::install_mod_fonts,
      commands::fonts::discard_mod_fonts,
      commands::fonts::scan_and_stash_local_mod_fonts,
      #[cfg(debug_assertions)]
      commands::fonts::debug_trigger_font_install,
      #[cfg(debug_assertions)]
      commands::downloads::debug_queue_local_zip,
      commands::downloads::clear_download_cache,
      commands::vpk::clear_all_mods_data,
      commands::mods::uninstall_mod,
      commands::mods::purge_mod,
      commands::mods::reorder_mods,
      commands::mods::reorder_mods_by_remote_id,
      commands::game::is_game_running,
      commands::deep_link::parse_deep_link,
      commands::deep_link::get_deep_link_debug_info,
      commands::gameinfo::backup_gameinfo,
      commands::gameinfo::restore_gameinfo_backup,
      commands::gameinfo::reset_to_vanilla,
      commands::gameinfo::validate_gameinfo_patch,
      commands::gameinfo::get_gameinfo_status,
      commands::gameinfo::open_gameinfo_editor,
      commands::app::set_language,
      commands::app::set_api_url,
      commands::app::is_auto_update_disabled,
      flatpak::is_flatpak,
      flatpak::update_flatpak,
      commands::app::is_linux_gpu_optimization_active,
      commands::archive::extract_archive,
      commands::folders::remove_mod_folder,
      commands::vpk::parse_vpk_file,
      hero_detector::detect_mod_hero,
      hero_detector::detect_mod_heroes_batch,
      hero_detector::clear_vpk_entry_cache,
      commands::vpk::check_addons_exist,
      commands::vpk::analyze_local_addons,
      commands::reports::create_report,
      commands::reports::get_report_counts,
      commands::auth::store_auth_token,
      commands::auth::get_auth_token,
      commands::auth::clear_auth_token,
      commands::backups::create_addons_backup,
      commands::backups::list_addons_backups,
      commands::backups::restore_addons_backup,
      commands::backups::delete_addons_backup,
      commands::backups::get_addons_backup_info,
      commands::backups::prune_addons_backups,
      commands::backups::open_addons_backups_folder,
      commands::downloads::queue_download,
      commands::downloads::cancel_download,
      commands::downloads::pause_download,
      commands::downloads::resume_download,
      commands::downloads::get_download_status,
      commands::downloads::get_all_downloads,
      commands::archive::replace_mod_vpks,
      commands::archive::copy_selected_vpks_from_archive,
      commands::archive::copy_local_mod_vpks,
      commands::ingest::trigger_cache_scan,
      commands::ingest::start_cache_watcher,
      commands::ingest::stop_cache_watcher,
      commands::ingest::get_ingest_status,
      commands::ingest::initialize_ingest_tool,
      game_presence::get_game_presence_status,
      game_presence::get_game_presence_heroes,
      game_presence::start_game_presence_watcher,
      game_presence::stop_game_presence_watcher,
      commands::profiles::create_profile_folder,
      commands::profiles::delete_profile_folder,
      commands::profiles::switch_profile,
      commands::profiles::list_profile_folders,
      commands::server_profiles::create_server_addons_folder,
      commands::server_profiles::delete_server_addons_folder,
      commands::server_profiles::list_server_addons_folders,
      commands::server_profiles::apply_server_gameinfo,
      commands::server_profiles::restore_active_profile_gameinfo,
      commands::server_profiles::cleanup_stale_server_gameinfo,
      commands::downloads::download_custom_provider_mod,
      commands::profiles::get_profile_installed_vpks,
      commands::profiles::delete_profile_vpk,
      commands::profiles::show_profile_vpk_in_folder,
      commands::profiles::import_profile_batch,
      commands::mods::register_analyzed_mod,
      commands::mods::batch_update_mods,
      commands::autoexec::get_autoexec_config,
      commands::autoexec::update_autoexec_config,
      commands::autoexec::open_autoexec_folder,
      commands::autoexec::open_autoexec_editor,
      commands::autoexec::apply_crosshair_to_autoexec,
      commands::autoexec::remove_crosshair_from_autoexec,
      commands::autoexec::add_map_command_to_autoexec,
      commands::autoexec::remove_map_command_from_autoexec,
      commands::autoexec::get_map_command_from_autoexec,
      commands::logs::watch_console_log,
      commands::logs::stop_watching_console_log,
      commands::logs::get_log_info,
      commands::logs::open_logs_folder,
      commands::logs::open_log_file,
      commands::logs::get_logs_for_ai,
      commands::logs::get_crash_dumps_info,
      commands::logs::open_crash_dumps_folder,
      commands::logs::parse_crash_dump,
      commands::logs::parse_latest_crash_dump,
      commands::logs::open_latest_crash_dump_parsed,
      commands::archive::read_dropped_mod_file,
      commands::app::check_filesystem_writable,
      commands::downloads::test_fileserver_latency,
      proxy::set_proxy_config,
      proxy::get_proxy_config,
      proxy::test_proxy_connection,
      updater_channel::get_update_channel,
      updater_channel::set_update_channel
    ])
    .run(context)
    .expect("error while running tauri application");
}
