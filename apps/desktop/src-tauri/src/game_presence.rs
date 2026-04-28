use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, LazyLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub(crate) use deadlock_discord_presence::GamePresenceWatcher;
use deadlock_discord_presence::PresencePhase;

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
static RUNNING: LazyLock<Arc<AtomicBool>> = LazyLock::new(|| Arc::new(AtomicBool::new(false)));

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
  Status::from_u8(STATUS.load(Ordering::Relaxed)) != Status::Inactive
}

pub(crate) fn running_handle() -> Arc<AtomicBool> {
  Arc::clone(&RUNNING)
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

pub(crate) fn mark_started(app_handle: &AppHandle) {
  RUNNING.store(true, Ordering::Relaxed);
  STATUS.store(Status::Waiting as u8, Ordering::Relaxed);
  emit_status(Some(app_handle));
}

pub(crate) fn mark_stopped(app_handle: Option<&AppHandle>) {
  RUNNING.store(false, Ordering::Relaxed);
  STATUS.store(Status::Inactive as u8, Ordering::Relaxed);
  emit_status(app_handle);
}
