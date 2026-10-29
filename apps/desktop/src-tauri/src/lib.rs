// Prevents additional console window on Windows in release
#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod addons_watcher;
pub mod app_runtime;
mod app_updates;
pub mod cli;
mod commands;
mod deep_link;
mod download_manager;
mod dropped_mod_file;
#[cfg(feature = "e2e-harness")]
mod e2e_faults;
mod errors;
mod flatpak;
mod forge_bridge;
mod game_guard;
mod game_presence;
mod game_session;
mod hero_detector;
mod ingest_tool;
mod install_sources;
mod live_bridge;
mod live_match;
mod logs;
#[cfg(feature = "match-sync")]
mod match_sync;
#[cfg(not(feature = "match-sync"))]
#[path = "match_sync/disabled.rs"]
mod match_sync;
mod mod_manager;
pub mod providers;
#[doc(hidden)]
pub use mod_manager::vdata_history::encode_history_index;
pub mod proxy;
mod reports;
pub mod runtime_environment;
mod state_file;
mod steam_user;
#[cfg_attr(target_os = "linux", path = "tray_linux.rs")]
mod tray;
mod updater_channel;
mod utils;
mod vpk_archive_cache;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  runtime_environment::initialize().expect("failed to initialize runtime environment");
  runtime_environment::configure_process();

  #[cfg(debug_assertions)]
  {
    if runtime_environment::current().e2e().is_none() {
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
  }

  let mut builder =
    tauri::Builder::<app_runtime::AppRuntime>::new().plugin(tauri_plugin_dialog::init());

  #[cfg(feature = "cef")]
  {
    builder = builder.runtime(app_runtime::cef_runtime());
  }

  #[cfg(all(debug_assertions, desktop, feature = "tauri-wry"))]
  {
    if runtime_environment::current().e2e().is_none() {
      builder = builder.plugin(
        tauri_plugin_mcp_bridge::Builder::new()
          .bind_address("127.0.0.1")
          .build(),
      );
    }
  }

  #[cfg(desktop)]
  {
    if runtime_environment::current().e2e().is_none() {
      builder = builder.plugin(tauri_plugin_single_instance::init(
        deep_link::on_second_instance,
      ));
    }
  }
  let mut context: tauri::Context<app_runtime::AppRuntime> = tauri::generate_context!();
  runtime_environment::apply_to_context(&mut context);
  updater_channel::apply_to_context(&mut context);

  let log_file_target = runtime_environment::current()
    .e2e()
    .map(|configuration| TargetKind::Folder {
      path: configuration.roots.app_logs.clone(),
      file_name: Some("deadlock-mod-manager".into()),
    })
    .unwrap_or(TargetKind::LogDir {
      file_name: Some("deadlock-mod-manager".into()),
    });

  let stdout_format = if cfg!(debug_assertions) && std::env::var_os("NO_COLOR").is_none() {
    logs::format::pretty
  } else {
    logs::format::plain
  };

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
        .clear_format()
        .clear_targets()
        .targets([
          Target::new(TargetKind::Stdout).format(stdout_format),
          Target::new(log_file_target).format(logs::format::plain),
        ])
        .max_file_size(1_000_000)
        .level(log::LevelFilter::Info)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
        .filter(|metadata| metadata.target() != "tracing")
        .build(),
    );

  #[cfg(feature = "e2e-harness")]
  {
    // tauri-plugin-wdio installs a fallback logger during setup. Register it
    // after the application logger so the plugin observes the existing logger
    // instead of preventing tauri-plugin-log from initializing.
    builder = builder.plugin(tauri_plugin_wdio::init());
    if std::env::var("WDIO_EMBEDDED_SERVER").as_deref() == Ok("true") {
      builder = builder.plugin(tauri_plugin_wdio_webdriver::init());
    }
  }

  builder
    .manage(game_presence::DiscordState::new())
    .manage(commands::remote_install::PendingPairing::default())
    .on_window_event(tray::handle_window_event)
    .setup(|app| {
      #[cfg(feature = "e2e-harness")]
      {
        let capability = tauri::ipc::CapabilityBuilder::new("e2e-wdio")
          .window("main")
          .permission("wdio:default")
          .permission_scoped(
            "fs:scope",
            {
              let app_data = &runtime_environment::current()
                .e2e()
                .expect("e2e-harness builds require an E2E configuration")
                .roots
                .app_data;
              vec![
                serde_json::json!({ "path": app_data }),
                serde_json::json!({ "path": app_data.join("**") }),
              ]
            },
            Vec::<serde_json::Value>::new(),
          )
          .permission_scoped(
            "http:default",
            runtime_environment::current()
              .e2e()
              .expect("e2e-harness builds require an E2E configuration")
              .endpoints
              .iter()
              .map(|endpoint| serde_json::json!({ "url": format!("{}/**", endpoint.origin) }))
              .collect(),
            Vec::<serde_json::Value>::new(),
          );
        let capability = if std::env::var("WDIO_EMBEDDED_SERVER").as_deref() == Ok("true") {
          capability.permission("wdio-webdriver:default")
        } else {
          capability
        };
        app.add_capability(capability)?;
      }

      let model_assets = commands::foundry::ModelAssets::open()?;
      app
        .asset_protocol_scope()
        .allow_directory(model_assets.directory(), false)?;
      app.manage(std::sync::Arc::new(model_assets));

      state_file::inspect(&app.path().resolve(
        runtime_environment::state_store_path(),
        tauri::path::BaseDirectory::AppData,
      )?);
      let _store = app.store(runtime_environment::state_store_path())?;
      if let Some(mods_store) = mod_manager::mods_store::custom_dir(app.handle()) {
        mod_manager::mods_store::allow_frontend_access(app.handle(), &mods_store);
      }
      if runtime_environment::current().e2e().is_none() {
        deep_link::setup(app)?;
      }

      let catalog_path =
        runtime_environment::app_local_data_dir(app.handle())?.join("gamebanana-catalog.db");
      let catalog_state = tauri::async_runtime::block_on(
        commands::gamebanana_catalog::GameBananaCatalogState::open(catalog_path),
      );
      app.manage(catalog_state);
      let app_data_dir = runtime_environment::app_local_data_dir(app.handle())?;
      mod_manager::perf_config::catalog::load_cached(&app_data_dir);
      mod_manager::perf_config::staging::cleanup_stale(&app_data_dir);
      app.manage(commands::policy::PolicyState::open(
        runtime_environment::app_local_data_dir(app.handle())?.join("policy-manifest-v1.json"),
      ));

      {
        let mut mod_manager = commands::state::MANAGER
          .lock()
          .map_err(|e| format!("Failed to acquire mod manager lock: {e}"))?;
        if let Some(configuration) = runtime_environment::current().e2e() {
          mod_manager.set_steam_path(configuration.roots.steam.clone())?;
          mod_manager.set_game_path(configuration.roots.game.clone())?;
        }
        mod_manager.set_app_handle(app.handle().clone());
      }
      game_session::init(app.handle().clone(), app_data_dir);

      log::info!("[App] Setup completed, starting application...");
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::game::find_game_path,
      commands::game::get_installed_build_id,
      commands::gamebanana_catalog::synchronize_gamebanana_catalog,
      commands::gamebanana_catalog::clear_gamebanana_catalog,
      commands::gamebanana_catalog::resolve_legacy_sound_ids,
      commands::gamebanana_catalog::query_gamebanana_catalog,
      commands::gamebanana_catalog::get_gamebanana_catalog_facets,
      commands::gamebanana_catalog::search_gamebanana_catalog_authors,
      commands::gamebanana_catalog::list_gamebanana_collections,
      commands::gamebanana_catalog::get_gamebanana_collection,
      commands::gamebanana_catalog::get_gamebanana_submission_detail,
      commands::gamebanana_catalog::get_gamebanana_submission_changelog,
      commands::gamebanana_catalog::get_gamebanana_submission_files,
      commands::gamebanana_catalog::get_gamebanana_submission_comments,
      commands::gamebanana_catalog::get_gamebanana_submission_changelog,
      commands::gamebanana_catalog::check_gamebanana_catalog_updates,
      commands::gamebanana_catalog::resolve_gamebanana_download_candidates,
      commands::gamebanana_catalog::inspect_gamebanana_catalog_state,
      commands::gamebanana_catalog::invalidate_gamebanana_catalog_state,
      commands::identity_migration::migrate_submission_identities,
      commands::policy::refresh_policy_manifest,
      commands::game::find_steam_path,
      commands::game::set_game_path,
      commands::game::set_steam_path,
      commands::game::clear_steam_path,
      commands::mods::get_mod_file_tree,
      commands::mods::install_mod,
      commands::game::stop_game,
      commands::game::start_game,
      commands::game::cancel_launch,
      commands::game::launch_game_direct,
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
      #[cfg(all(debug_assertions, feature = "match-sync"))]
      commands::match_sync::debug_reset_match_sync_config,
      commands::downloads::clear_download_cache,
      commands::downloads::get_download_cache_location,
      commands::downloads::set_download_cache_location,
      commands::vpk::clear_all_mods_data,
      commands::mods::uninstall_mod,
      commands::mods::purge_mod,
      commands::mods::reorder_mods,
      commands::mods::reorder_mods_by_remote_id,
      commands::mods::get_enabled_mod_vpk_files,
      commands::localization::analyze_localization_overlay,
      commands::localization::apply_localization_overlay,
      commands::localization::get_mod_compatibility_settings,
      commands::localization::set_mod_compatibility_for_mod,
      commands::localization::get_mod_health,
      commands::localization::check_mod_health,
      commands::localization::fix_mods,
      commands::localization::refresh_mod_fixes,
      commands::game::is_game_running,
      commands::game::set_game_file_guard,
      commands::game::allow_next_game_file_operation,
      commands::game_session::session_pending_reports,
      commands::game_session::session_acknowledge,
      commands::game_session::session_record_client_fingerprint,
      commands::game_session::session_set_enabled,
      commands::deep_link::parse_deep_link,
      commands::deep_link::get_deep_link_debug_info,
      commands::remote_install::get_remote_install_status,
      commands::remote_install::get_gamebanana_member,
      commands::remote_install::confirm_remote_install_pair,
      commands::remote_install::unpair_remote_install,
      commands::remote_install::poll_remote_install,
      commands::gameinfo::backup_gameinfo,
      commands::gameinfo::restore_gameinfo_backup,
      commands::gameinfo::reset_to_vanilla,
      commands::gameinfo::make_file_writable,
      commands::gameinfo::validate_gameinfo_patch,
      commands::gameinfo::get_gameinfo_status,
      commands::gameinfo::gameinfo_has_mod_paths,
      commands::gameinfo::open_gameinfo_editor,
      commands::app::set_language,
      commands::app::set_api_url,
      commands::app::get_runtime_bootstrap,
      commands::app::is_auto_update_disabled,
      commands::app::get_runtime_kind,
      commands::app::get_machine_uid,
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
      commands::foundry::foundry_analyze_vpk,
      commands::foundry::foundry_analyze_default_hero,
      commands::foundry::foundry_resolve_mod_vpk,
      commands::foundry::foundry_prepare_workspace,
      commands::foundry::foundry_build_workspace_vpk,
      commands::foundry::foundry_export_workspace,
      commands::foundry::foundry_replace_workspace_file,
      commands::foundry::foundry_paint_targets,
      commands::foundry::foundry_skin_palette,
      commands::foundry::foundry_paint_target,
      commands::foundry::foundry_model_parts,
      commands::foundry::foundry_paint_parts,
      commands::foundry::foundry_pattern_swatch,
      commands::foundry::foundry_release_archives,
      commands::foundry::foundry_revert_workspace_file,
      commands::foundry::foundry_adjust_sound,
      commands::foundry::foundry_decode_texture,
      commands::foundry::foundry_decode_cards,
      commands::foundry::foundry_decode_model,
      commands::foundry::foundry_cancel_model_decode,
      commands::foundry::foundry_release_model,
      commands::foundry::foundry_list_animations,
      commands::foundry::foundry_decode_animation,
      commands::foundry::foundry_decode_cloth,
      commands::foundry::foundry_decode_particles,
      commands::foundry::foundry_decode_ability_particles,
      commands::foundry::foundry_decode_sound,
      commands::reports::create_report,
      commands::reports::get_report_counts,
      commands::auth::store_auth_token,
      commands::auth::get_auth_token,
      commands::auth::clear_auth_token,
      commands::backups::create_addons_backup,
      commands::backups::estimate_update_backup_size,
      commands::backups::list_addons_backups,
      commands::backups::restore_addons_backup,
      commands::mod_folder_repair::repair_mod_folder,
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
      commands::mods::get_mod_available_options,
      commands::mods::swap_mod_options,
      commands::mods::fetch_missing_mod_variants,
      commands::mods::stage_download_archive,
      commands::mods::cancel_stage_download_archive,
      commands::mods::switch_mod_download_variant,
      commands::ingest::trigger_cache_scan,
      commands::ingest::start_cache_watcher,
      commands::ingest::stop_cache_watcher,
      commands::ingest::get_ingest_status,
      commands::ingest::initialize_ingest_tool,
      commands::forge::start_forge_bridge,
      commands::forge::stop_forge_bridge,
      commands::forge::place_forge_payload,
      commands::forge::finish_forge_install,
      commands::source_install::take_pending_source_installs,
      commands::source_install::resolve_source_install,
      commands::source_install::download_source_install,
      commands::source_install::place_source_install,
      commands::source_install::finish_source_install,
      game_presence::get_game_presence_status,
      game_presence::get_game_presence_heroes,
      game_presence::start_game_presence_watcher,
      game_presence::stop_game_presence_watcher,
      #[cfg(feature = "match-sync")]
      commands::match_sync::get_match_sync_status,
      #[cfg(feature = "match-sync")]
      commands::match_sync::get_local_match_history,
      #[cfg(feature = "match-sync")]
      commands::match_sync::set_match_sync_consent,
      #[cfg(feature = "match-sync")]
      commands::match_sync::set_match_sync_enabled,
      #[cfg(feature = "match-sync")]
      commands::match_sync::start_full_match_sync,
      #[cfg(feature = "match-sync")]
      commands::match_sync::cancel_full_match_sync,
      #[cfg(feature = "match-sync")]
      commands::match_sync::resume_match_sync_monitoring,
      commands::steam_user::get_steam_accounts,
      commands::live_match::get_live_match,
      commands::live_match::build_live_bridge,
      commands::live_match::live_bridge_status,
      commands::live_match::update_live_bridge,
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
      commands::profiles::get_profile_vpk_manifest,
      commands::conflicts::get_profile_conflicts,
      commands::conflicts::update_conflict_ignores,
      commands::profile_snapshot::get_profile_vpk_snapshot,
      commands::profile_snapshot::forget_orphaned_mods,
      commands::profile_snapshot::watch_addons_vpks,
      commands::profiles::hydrate_mods_from_manifest,
      commands::shards::get_shard_diagnostics,
      commands::shards::resync_profile_shards,
      commands::profiles::seed_profile_vpk_manifest_entries,
      commands::profiles::delete_profile_vpk,
      commands::profiles::show_profile_vpk_in_folder,
      commands::profiles::import_profile_batch,
      commands::mods::register_analyzed_mod,
      commands::mod_interchange::list_interchange_sources,
      commands::mod_interchange::read_interchange_source,
      commands::mod_interchange::get_interchange_ledger,
      commands::mod_interchange::get_interchange_profile_ledger,
      commands::mod_interchange::record_interchange_profile,
      commands::mod_interchange::identify_interchange_mods,
      commands::mod_interchange::relabel_interchange_mod,
      commands::mod_interchange::read_interchange_bundle,
      commands::mod_interchange::import_interchange_mods,
      commands::mod_interchange::export_interchange_bundle,
      commands::mods::batch_update_mods,
      commands::performance::perf_get_catalog,
      commands::performance::perf_refresh_catalog,
      commands::performance::perf_get_status,
      commands::performance::perf_resolve,
      commands::performance::perf_apply,
      commands::performance::perf_remove,
      commands::performance::perf_reapply,
      commands::performance::perf_sync,
      commands::performance::perf_analyze_import,
      commands::performance::perf_export,
      commands::performance::perf_search_convars,
      commands::performance::perf_get_convars,
      commands::performance::perf_discard_staging,
      commands::autoexec::get_autoexec_config,
      commands::autoexec::update_autoexec_config,
      commands::autoexec::open_autoexec_folder,
      commands::autoexec::open_autoexec_editor,
      commands::autoexec::apply_crosshair_to_autoexec,
      commands::autoexec::remove_crosshair_from_autoexec,
      commands::autoexec::disable_custom_crosshairs,
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
      commands::archive::copy_dropped_mod_file,
      commands::app::check_filesystem_writable,
      commands::server_browser::ping_servers,
      commands::deadworks_content::download_deadworks_content,
      commands::deadworks_content::preview_deadworks_content,
      commands::server_connect::resolve_connect_address,
      commands::server_connect::watch_server_connect,
      proxy::set_proxy_config,
      proxy::get_proxy_config,
      proxy::test_proxy_connection,
      updater_channel::get_update_channel,
      app_updates::check_app_update,
      updater_channel::set_update_channel,
      tray::set_tray_behavior,
      tray::hide_to_tray_on_close,
      #[cfg(feature = "e2e-harness")]
      commands::e2e::e2e_status
    ])
    .run(context)
    .expect("error while running tauri application");
}
