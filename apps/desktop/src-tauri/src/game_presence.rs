use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

use crate::app_runtime::AppHandle;
use serde::Serialize;
use tauri::{Emitter, Manager};

pub(crate) use deadlock_discord_presence::GamePresenceWatcher;
use deadlock_discord_presence::{
  GameExitCallback, HeroDataStore, PresenceBuildConfig, PresencePhase, PresenceStatusCallback,
};

use crate::commands::state::MANAGER;
use crate::errors::Error;

pub(crate) type DiscordState = deadlock_discord_presence::DiscordPresenceState;

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq)]
enum Status {
  Inactive = 0,
  Waiting = 1,
  Connecting = 2,
  Connected = 3,
  Error = 4,
}

impl Status {
  fn as_str(self) -> &'static str {
    match self {
      Status::Inactive => "inactive",
      Status::Waiting => "waiting",
      Status::Connecting => "connecting",
      Status::Connected => "connected",
      Status::Error => "error",
    }
  }

  fn from_phase(phase: PresencePhase) -> Self {
    match phase {
      PresencePhase::Waiting => Status::Waiting,
      PresencePhase::Connecting => Status::Connecting,
      PresencePhase::Connected => Status::Connected,
      PresencePhase::Error => Status::Error,
    }
  }

  fn from_u8(value: u8) -> Self {
    match value {
      value if value == Status::Waiting as u8 => Status::Waiting,
      value if value == Status::Connecting as u8 => Status::Connecting,
      value if value == Status::Connected as u8 => Status::Connected,
      value if value == Status::Error as u8 => Status::Error,
      _ => Status::Inactive,
    }
  }
}

static STATUS: LazyLock<AtomicU8> = LazyLock::new(|| AtomicU8::new(Status::Inactive as u8));
// Each start gets a fresh stop flag so a mode-switch restart can stop the old loop
// without racing the new one (they hold different Arcs).
static CURRENT_RUNNING: LazyLock<Mutex<Option<Arc<AtomicBool>>>> =
  LazyLock::new(|| Mutex::new(None));
// Desired inputs deciding whether — and in which mode — the single watcher runs.
static PRESENCE_DESIRED: AtomicBool = AtomicBool::new(false);
static MONITORING_DESIRED: AtomicBool = AtomicBool::new(false);
// true = the running watcher has Discord Rich Presence active.
static CURRENT_PRESENCE_MODE: AtomicBool = AtomicBool::new(false);
// Serializes ensure_watcher so overlapping start/stop/restart requests (dev
// StrictMode, the presence + match-sync renderers) can't double-spawn watchers.
static COORDINATOR_LOCK: Mutex<()> = Mutex::new(());
static LATEST_PRESENCE_CONFIG: LazyLock<Mutex<Option<PresenceBuildConfig>>> =
  LazyLock::new(|| Mutex::new(None));

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamePresenceStatusDto {
  pub watcher_active: bool,
  pub phase: String,
}

pub fn snapshot() -> GamePresenceStatusDto {
  let status = Status::from_u8(STATUS.load(Ordering::Relaxed));

  GamePresenceStatusDto {
    watcher_active: status != Status::Inactive,
    phase: status.as_str().to_string(),
  }
}

pub(crate) fn is_running() -> bool {
  CURRENT_RUNNING
    .lock()
    .map(|guard| guard.is_some())
    .unwrap_or(false)
}

fn emit_status(app_handle: Option<&AppHandle>) {
  if let Some(handle) = app_handle {
    let payload = snapshot();
    let _ = handle.emit("game-presence-status", &payload);
  }
}

pub(crate) fn set_phase_emit(app_handle: Option<&AppHandle>, phase: PresencePhase) {
  STATUS.store(Status::from_phase(phase) as u8, Ordering::Relaxed);
  emit_status(app_handle);
}

fn stop_current(app_handle: Option<&AppHandle>) {
  if let Ok(mut current) = CURRENT_RUNNING.lock()
    && let Some(flag) = current.take()
  {
    flag.store(false, Ordering::Relaxed);
  }
  STATUS.store(Status::Inactive as u8, Ordering::Relaxed);
  emit_status(app_handle);
}

fn resolve_game_path() -> Option<std::path::PathBuf> {
  let mut mod_manager = MANAGER.lock().ok()?;
  mod_manager.find_game().ok()
}

fn spawn_watcher(app_handle: &AppHandle, presence_enabled: bool) {
  let Some(game_path) = resolve_game_path() else {
    log::warn!("[GamePresence] Cannot start watcher: game path not found");
    return;
  };
  let discord_presence = app_handle.state::<DiscordState>().inner().clone();
  let presence_config = LATEST_PRESENCE_CONFIG
    .lock()
    .ok()
    .and_then(|config| config.clone())
    .unwrap_or_default();

  let running = Arc::new(AtomicBool::new(true));
  if let Ok(mut current) = CURRENT_RUNNING.lock() {
    *current = Some(Arc::clone(&running));
  }
  CURRENT_PRESENCE_MODE.store(presence_enabled, Ordering::Relaxed);
  STATUS.store(Status::Waiting as u8, Ordering::Relaxed);
  emit_status(Some(app_handle));

  let status_app = app_handle.clone();
  let status_callback: PresenceStatusCallback =
    Arc::new(move |phase| set_phase_emit(Some(&status_app), phase));
  let exit_app = app_handle.clone();
  let exit_callback: GameExitCallback =
    Arc::new(move || crate::match_sync::on_game_exit(exit_app.clone()));
  let done_app = app_handle.clone();
  let done_flag = Arc::clone(&running);

  tokio::spawn(async move {
    let watcher = GamePresenceWatcher::new(
      game_path,
      running,
      discord_presence,
      Some(status_callback),
      presence_config,
    )
    .with_presence_enabled(presence_enabled)
    .with_game_exit_callback(exit_callback);
    watcher.run().await;

    // Only clear shared status if we are still the active watcher (not superseded
    // by a restart), otherwise we'd stomp the newer watcher's state.
    if let Ok(mut current) = CURRENT_RUNNING.lock()
      && current.as_ref().is_some_and(|flag| Arc::ptr_eq(flag, &done_flag))
    {
      current.take();
      STATUS.store(Status::Inactive as u8, Ordering::Relaxed);
      emit_status(Some(&done_app));
    }
  });
}

pub(crate) fn ensure_watcher(app_handle: &AppHandle) {
  let _guard = COORDINATOR_LOCK
    .lock()
    .unwrap_or_else(std::sync::PoisonError::into_inner);
  let presence = PRESENCE_DESIRED.load(Ordering::Relaxed);
  let monitoring = MONITORING_DESIRED.load(Ordering::Relaxed);

  if !presence && !monitoring {
    stop_current(Some(app_handle));
    return;
  }

  let running = is_running();
  let mode_matches = CURRENT_PRESENCE_MODE.load(Ordering::Relaxed) == presence;
  if running && mode_matches {
    return;
  }
  if running {
    stop_current(Some(app_handle));
  }
  spawn_watcher(app_handle, presence);
}

pub fn sync_monitoring_watcher(app_handle: &AppHandle) {
  MONITORING_DESIRED.store(
    crate::match_sync::should_monitor(app_handle),
    Ordering::Relaxed,
  );
  ensure_watcher(app_handle);
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamePresenceHeroDto {
  pub codename: String,
  pub name: String,
  pub hideout_text: String,
}

#[tauri::command]
pub async fn get_game_presence_status() -> Result<GamePresenceStatusDto, Error> {
  Ok(snapshot())
}

#[tauri::command]
pub async fn get_game_presence_heroes() -> Result<Vec<GamePresenceHeroDto>, Error> {
  let cache_dir = {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager
      .find_game()
      .ok()
      .map(|p| p.join("game").join("citadel"))
  };
  let cache_path = cache_dir
    .as_deref()
    .unwrap_or_else(|| std::path::Path::new("."));
  let mut hero_store = HeroDataStore::new(cache_path);
  hero_store.load().await;
  Ok(
    hero_store
      .heroes_detailed()
      .into_iter()
      .map(|(codename, name, hideout_text)| GamePresenceHeroDto {
        codename,
        name,
        hideout_text,
      })
      .collect(),
  )
}

#[tauri::command]
pub async fn start_game_presence_watcher(
  app_handle: AppHandle,
  presence_config: Option<PresenceBuildConfig>,
) -> Result<(), Error> {
  if let Some(config) = presence_config
    && let Ok(mut slot) = LATEST_PRESENCE_CONFIG.lock()
  {
    *slot = Some(config);
  }
  PRESENCE_DESIRED.store(true, Ordering::Relaxed);
  ensure_watcher(&app_handle);
  log::info!("Game presence watcher requested");
  Ok(())
}

#[tauri::command]
pub async fn stop_game_presence_watcher(app_handle: AppHandle) -> Result<(), Error> {
  PRESENCE_DESIRED.store(false, Ordering::Relaxed);
  ensure_watcher(&app_handle);
  log::info!("Game presence watcher stop requested");
  Ok(())
}
