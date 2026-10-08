//! The clean-shutdown lines Deadlock prints to `game/citadel/console.log` when
//! it quits normally. The log only exists with `-condebug`, and the next
//! launch truncates it.

use std::path::Path;

pub use deadlock_discord_presence::console_log_path;

const TAIL_BYTES: u64 = 8 * 1024;

/// engine2.dll prints these as the last lines of a normal quit
/// (`ShutdownSource2Logging` is the very last).
const SHUTDOWN_MARKERS: [&str; 2] = ["ShutdownSource2Logging", "Source2Shutdown"];

fn has_shutdown_marker(tail: &str) -> bool {
  SHUTDOWN_MARKERS.iter().any(|marker| tail.contains(marker))
}

/// `None` when the log is missing; `Some(false)` when it ends without the
/// shutdown lines.
pub fn ended_cleanly(path: &Path) -> Option<bool> {
  super::read_tail(path, TAIL_BYTES).map(|tail| has_shutdown_marker(&tail))
}

#[cfg(test)]
mod tests {
  use super::*;

  const CLEAN_TAIL: &str = "[HostStateManager] Host activate: Quitting\r\nDispatching EventAppShutdown_t {\r\nMainLoop returning\r\nSource2Shutdown\r\nShutdownSource2Logging\r\n";

  #[test]
  fn detects_the_shutdown_lines() {
    assert!(has_shutdown_marker(CLEAN_TAIL));
    assert!(has_shutdown_marker("...\nSource2Shutdown\n"));
  }

  #[test]
  fn a_log_that_stops_mid_game_is_not_clean() {
    assert!(!has_shutdown_marker(
      "[Client] CL:  Connected to '127.0.0.1:27015'\n[Server] SV:  Spawn Server: dl_midtown\n"
    ));
  }

  #[test]
  fn reads_only_the_end_of_a_long_log() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("console.log");
    let filler = "x".repeat(64 * 1024);

    std::fs::write(&path, format!("ShutdownSource2Logging\n{filler}\n")).unwrap();
    assert_eq!(ended_cleanly(&path), Some(false));

    std::fs::write(&path, format!("{filler}\n{CLEAN_TAIL}")).unwrap();
    assert_eq!(ended_cleanly(&path), Some(true));

    assert_eq!(ended_cleanly(&dir.path().join("missing.log")), None);
  }
}
