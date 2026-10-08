//! Performance configs: community `gameinfo.gi` tuning applied as an overlay.
//!
//! A config is a list of [`types::ConfigEntry`] values. We never replace
//! gameinfo.gi: the overlay edits existing keys in place and injects new ConVars
//! in one marked block, so Valve's newer stock values, other tools' lines and our
//! own SearchPaths block all survive. Markers record the original values, which
//! makes removal possible from the file alone.
//!
//! The config the user chose is stored as a [`types::DesiredOverlay`] in the
//! app's data folder and re-applied on every launch, because Steam updates and
//! "Reset to Vanilla" replace the whole file.
//!
//! Module map:
//! - [`catalog`]: curated presets, convar metadata, stock history, rules.
//! - [`live`]: the parsed live file (values by path) with our overlay stripped.
//! - [`resolve`]: config + overrides + rules → what gets written and why.
//! - [`patch`]: marker grammar; strip and apply overlays; other tools' overlays.
//! - [`store`]: the persisted desired overlay.
//! - [`ops`]: status / apply / remove / re-apply on top of the above.
//! - [`formats`], [`analyze`], [`staging`], [`share`]: importing configs and
//!   exporting share codes.

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

use std::path::{Path, PathBuf};

pub fn gameinfo_path(game_path: &Path) -> PathBuf {
  game_path.join("game").join("citadel").join("gameinfo.gi")
}

/// The game's own version (`ClientVersion` in `game/citadel/steam.inf`), the
/// build number the catalog's stock history uses. Not Steam's build id.
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
