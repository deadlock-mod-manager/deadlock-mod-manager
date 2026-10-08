//! The game-side half of a session's fingerprint: what gameinfo.gi mounted,
//! the performance config it carried, autoexec.cfg, launch arguments and the
//! game build. The frontend adds the profile and mod list.

use std::path::Path;

use sha2::{Digest, Sha256};

use super::types::{AddonPathFingerprint, PerfConfigFingerprint, SessionFingerprint};
use crate::mod_manager::autoexec_manager::{AutoexecManager, without_managed_sections};
use crate::mod_manager::perf_config::{self, patch};
use crate::mod_manager::steam_manager::installed_build_id;

const DIGEST_HEX_LEN: usize = 16;

pub fn capture(
  game_path: &Path,
  app_data_dir: &Path,
  launch_args: &[String],
) -> SessionFingerprint {
  let gameinfo = std::fs::read_to_string(perf_config::gameinfo_path(game_path)).unwrap_or_default();
  SessionFingerprint {
    client_version: perf_config::client_version(game_path),
    steam_build_id: installed_build_id(game_path).map(|build| build.to_string()),
    condebug: launch_args
      .iter()
      .any(|argument| argument.eq_ignore_ascii_case("-condebug")),
    launch_args: normalize_launch_args(launch_args),
    autoexec_hash: std::fs::read_to_string(AutoexecManager::new().get_autoexec_path(game_path))
      .ok()
      .map(|content| short_digest(without_managed_sections(&content).as_bytes())),
    addon_paths: addon_search_paths(&gameinfo)
      .into_iter()
      .map(|search_path| addon_path_fingerprint(game_path, search_path))
      .collect(),
    perf_config: perf_config_fingerprint(&gameinfo, app_data_dir),
    client: None,
  }
}

const IGNORED_FLAGS: [&str; 2] = ["-steam", "-condebug"];

/// Drops what says nothing about the user's setup: Steam's own `-steam`, a
/// server join's `+connect`/`+password` (which must not be stored either),
/// and what the app adds to its own launches, which a launch from Steam
/// lacks: `-condebug` (game presence, joins) and the `-exec autoexec` of its
/// autoexec option (autoexec.cfg itself is hashed).
pub fn normalize_launch_args(arguments: &[String]) -> Vec<String> {
  let mut normalized = Vec::new();
  let mut arguments = arguments.iter().peekable();
  while let Some(argument) = arguments.next() {
    let execs_autoexec = argument.eq_ignore_ascii_case("-exec")
      && arguments
        .peek()
        .is_some_and(|next| next.eq_ignore_ascii_case("autoexec"));
    if execs_autoexec
      || argument.eq_ignore_ascii_case("+connect")
      || argument.eq_ignore_ascii_case("+password")
    {
      arguments.next();
    } else if !argument.is_empty()
      && !IGNORED_FLAGS
        .iter()
        .any(|flag| argument.eq_ignore_ascii_case(flag))
    {
      normalized.push(argument.clone());
    }
  }
  normalized
}

/// `Game citadel/addons…` search paths, in file order, without duplicates.
pub fn addon_search_paths(gameinfo: &str) -> Vec<&str> {
  let mut paths: Vec<&str> = Vec::new();
  for line in gameinfo.lines() {
    let code = line.split("//").next().unwrap_or_default();
    let mut tokens = code.split_whitespace();
    let (Some(key), Some(value)) = (tokens.next(), tokens.next()) else {
      continue;
    };
    let value = value.trim_matches('"');
    if key.trim_matches('"').eq_ignore_ascii_case("Game")
      && value.starts_with("citadel/addons")
      && !paths.contains(&value)
    {
      paths.push(value);
    }
  }
  paths
}

fn addon_path_fingerprint(game_path: &Path, search_path: &str) -> AddonPathFingerprint {
  let directory = search_path
    .split('/')
    .fold(game_path.join("game"), |path, segment| path.join(segment));
  let mut vpks: Vec<(String, u64, u64)> = std::fs::read_dir(directory)
    .map(|entries| {
      entries
        .flatten()
        .filter_map(|entry| {
          let name = entry.file_name().to_string_lossy().into_owned();
          if !name.to_ascii_lowercase().ends_with(".vpk") {
            return None;
          }
          let metadata = entry.metadata().ok()?;
          let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |duration| duration.as_secs());
          Some((name, metadata.len(), modified))
        })
        .collect()
    })
    .unwrap_or_default();
  vpks.sort();

  let listing: String = vpks
    .iter()
    .map(|(name, size, modified)| format!("{name}|{size}|{modified}\n"))
    .collect();
  AddonPathFingerprint {
    path: search_path.to_string(),
    vpk_count: vpks.len() as u32,
    digest: short_digest(listing.as_bytes()),
  }
}

fn perf_config_fingerprint(gameinfo: &str, app_data_dir: &Path) -> Option<PerfConfigFingerprint> {
  let overlay = patch::read_overlay(gameinfo)?;
  let desired = perf_config::store::load(app_data_dir)
    .filter(|desired| desired.request.config_id == overlay.config_id);
  Some(PerfConfigFingerprint {
    name: desired.as_ref().map(|desired| desired.request.name.clone()),
    applied_at: desired.as_ref().map(|desired| desired.applied_at.clone()),
    setting_count: desired.as_ref().map(|desired| desired.counts.applies),
    config_id: overlay.config_id,
    rev: overlay.rev,
  })
}

fn short_digest(bytes: &[u8]) -> String {
  let digest = Sha256::digest(bytes);
  let mut hex = hex::encode(digest);
  hex.truncate(DIGEST_HEX_LEN);
  hex
}

#[cfg(test)]
mod tests {
  use super::*;

  const GAMEINFO: &str = "\"GameInfo\"\n{\n  FileSystem\n  {\n    SearchPaths\n    {\n      // Deadlock Mod Manager - Start\n      Game                citadel/addons/profile_default\n      Game                citadel/addons2/profile_default\n      Game  \"citadel/addons/profile_default\"\n      // Game citadel/addons/disabled\n      Mod                 citadel\n      // Deadlock Mod Manager - End\n      Write               citadel\n      Game                citadel\n      Game                core\n    }\n  }\n  ConVars\n  {\n    // ==== Deadlock Mod Manager · Performance BEGIN (config=preset:optilock-potato rev=0123456789ab) ====\n    \"r_ssao\"   \"0\"\n    // ==== Deadlock Mod Manager · Performance END ====\n  }\n}\n";

  fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
  }

  #[test]
  fn lists_mounted_addon_paths_only() {
    assert_eq!(
      addon_search_paths(GAMEINFO),
      vec![
        "citadel/addons/profile_default",
        "citadel/addons2/profile_default"
      ]
    );
    assert!(addon_search_paths("Game citadel\nGame core\n").is_empty());
  }

  #[test]
  fn keeps_only_the_users_launch_options() {
    assert_eq!(
      normalize_launch_args(&strings(&[
        "-steam",
        "-console",
        "+connect",
        "1.2.3.4:27015",
        "+password",
        "hunter2",
        "-condebug",
        "-exec",
        "autoexec",
        "+exec",
        "autoexec",
        "-exec",
        "practice",
        "-dx11",
      ])),
      strings(&[
        "-console", "+exec", "autoexec", "-exec", "practice", "-dx11"
      ])
    );
  }

  #[test]
  fn captures_addons_autoexec_and_build() {
    let game = tempfile::tempdir().unwrap();
    let app_data = tempfile::tempdir().unwrap();
    let citadel = game.path().join("game").join("citadel");
    let profile = citadel.join("addons").join("profile_default");
    std::fs::create_dir_all(&profile).unwrap();
    std::fs::create_dir_all(citadel.join("cfg")).unwrap();
    std::fs::write(citadel.join("gameinfo.gi"), GAMEINFO).unwrap();
    std::fs::write(citadel.join("steam.inf"), "ClientVersion=6417\n").unwrap();
    std::fs::write(citadel.join("cfg").join("autoexec.cfg"), "fps_max 240\n").unwrap();
    std::fs::write(profile.join("pak01_dir.vpk"), b"one").unwrap();
    std::fs::write(profile.join("readme.txt"), b"ignored").unwrap();

    let first = capture(game.path(), app_data.path(), &strings(&["-condebug"]));

    assert_eq!(first.client_version, Some(6417));
    assert!(first.condebug);
    assert!(first.autoexec_hash.is_some());
    assert_eq!(first.addon_paths.len(), 2);
    assert_eq!(first.addon_paths[0].vpk_count, 1);
    assert_eq!(first.addon_paths[1].vpk_count, 0);
    assert_eq!(
      first
        .perf_config
        .as_ref()
        .map(|config| config.config_id.as_str()),
      Some("preset:optilock-potato")
    );

    std::fs::write(profile.join("pak02_dir.vpk"), b"two").unwrap();
    std::fs::write(citadel.join("cfg").join("autoexec.cfg"), "fps_max 0\n").unwrap();
    let second = capture(game.path(), app_data.path(), &[]);

    assert_ne!(first.addon_paths[0].digest, second.addon_paths[0].digest);
    assert_eq!(first.addon_paths[1].digest, second.addon_paths[1].digest);
    assert_ne!(first.autoexec_hash, second.autoexec_hash);
    assert!(!second.condebug);
  }
}
