// Whether Deadlock is running, from its process and console log.

use std::sync::Mutex;

use deadlock_discord_presence::{console_log_path, is_game_running};
use deadlock_match_sync::game_check::GameRunningCheck;

pub struct SysGameRunningCheck {
  sys: Mutex<sysinfo::System>,
}

impl SysGameRunningCheck {
  pub fn new() -> Self {
    Self {
      sys: Mutex::new(sysinfo::System::new()),
    }
  }
}

impl GameRunningCheck for SysGameRunningCheck {
  fn is_game_running(&self) -> bool {
    let Some(game_path) = crate::game_presence::resolve_game_path() else {
      return false;
    };
    let log_path = console_log_path(&game_path);
    let mut sys = self.sys.lock().unwrap_or_else(|e| e.into_inner());
    is_game_running(&mut sys, &log_path)
  }
}
