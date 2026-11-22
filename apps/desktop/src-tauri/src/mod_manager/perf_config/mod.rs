pub mod analyze;
pub mod catalog;
pub mod formats;
pub mod live;
pub mod ops;
pub mod patch;
pub mod resolve;
pub mod share;
pub mod staging;
pub mod store;
pub mod types;
pub mod video;

use std::path::{Path, PathBuf};

pub fn gameinfo_path(game_path: &Path) -> PathBuf {
  game_path.join("game").join("citadel").join("gameinfo.gi")
}

pub fn client_version(game_path: &Path) -> Option<u32> {
  let inf =
    std::fs::read_to_string(game_path.join("game").join("citadel").join("steam.inf")).ok()?;
  inf.lines().find_map(|line| {
    let (key, value) = line.split_once('=')?;
    if key.trim().eq_ignore_ascii_case("ClientVersion") {
      value.trim().parse().ok()
    } else {
      None
    }
  })
}
