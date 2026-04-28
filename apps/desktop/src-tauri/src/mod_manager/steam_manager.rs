use crate::errors::Error;
use log;
#[cfg(target_os = "linux")]
use std::path::Path;
use std::path::PathBuf;

const DEADLOCK_APP_ID: u32 = 1422450;

/// Manages Steam integration and game path detection
pub struct SteamManager {
  steam_dir: Option<steamlocate::SteamDir>,
  game_path: Option<PathBuf>,
}

fn push_unique_steam_dir(
  steam_dirs: &mut Vec<steamlocate::SteamDir>,
  steam_dir: steamlocate::SteamDir,
) {
  if steam_dirs
    .iter()
    .all(|candidate| candidate.path() != steam_dir.path())
  {
    steam_dirs.push(steam_dir);
  }
}

#[cfg(target_os = "linux")]
fn linux_steam_dir_candidates(home_dir: &Path) -> Vec<PathBuf> {
  vec![
    home_dir.join(".var/app/com.valvesoftware.Steam/data/Steam"),
    home_dir.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
    home_dir.join(".var/app/com.valvesoftware.Steam/.steam/steam"),
    home_dir.join(".var/app/com.valvesoftware.Steam/.steam/root"),
  ]
}

fn resolve_game_from_steam_dirs(
  steam_dirs: Vec<steamlocate::SteamDir>,
) -> Option<(steamlocate::SteamDir, PathBuf)> {
  let total_candidates = steam_dirs.len();

  for (index, steam_dir) in steam_dirs.into_iter().enumerate() {
    match steam_dir.find_app(DEADLOCK_APP_ID) {
      Ok(Some((game, library))) => {
        let game_path = library.resolve_app_dir(&game);
        if game_path.exists() {
          return Some((steam_dir, game_path));
        }
      }
      Ok(None) => {}
      Err(error) => {
        log::warn!(
          "Failed to inspect Steam directory candidate {}/{} at {:?} while locating Deadlock: {error}",
          index + 1,
          total_candidates,
          steam_dir.path()
        );
      }
    }
  }

  None
}

impl SteamManager {
  pub fn new() -> Self {
    Self {
      steam_dir: None,
      game_path: None,
    }
  }

  /// Find and locate Steam installation
  pub fn find_steam(&mut self) -> Result<&steamlocate::SteamDir, Error> {
    if self.steam_dir.is_none() {
      let steam_dir = self
        .candidate_steam_dirs()
        .into_iter()
        .next()
        .ok_or(Error::SteamNotFound)?;
      self.steam_dir = Some(steam_dir);
    }

    Ok(self.steam_dir.as_ref().unwrap())
  }

  /// Find the Deadlock game installation path
  pub fn find_game(&mut self) -> Result<&PathBuf, Error> {
    if self.game_path.is_none() {
      let (steam_dir, game_path) =
        resolve_game_from_steam_dirs(self.candidate_steam_dirs()).ok_or(Error::GameNotFound)?;

      log::info!("Game path found: {game_path:?}");
      self.steam_dir = Some(steam_dir);
      self.game_path = Some(game_path);
    }

    Ok(self.game_path.as_ref().unwrap())
  }

  /// Get the current game path if available
  pub fn get_game_path(&self) -> Option<&PathBuf> {
    self.game_path.as_ref()
  }

  /// Set the game path manually
  pub fn set_game_path(&mut self, path: PathBuf) -> Result<(), Error> {
    if !path.exists() {
      return Err(Error::GameNotFound);
    }

    let gameinfo_path = path.join("game").join("citadel").join("gameinfo.gi");
    if !gameinfo_path.exists() {
      return Err(Error::InvalidInput(
        "Invalid game path: gameinfo.gi not found in game/citadel directory".to_string(),
      ));
    }

    log::info!("Manually set game path to: {path:?}");
    self.game_path = Some(path);
    Ok(())
  }

  /// Get the current Steam directory if available
  pub fn get_steam_dir(&self) -> Option<&steamlocate::SteamDir> {
    self.steam_dir.as_ref()
  }

  /// Get the Steam executable path for launching games
  pub fn get_steam_executable(&self) -> Result<PathBuf, Error> {
    let steam_dir = self.get_steam_dir().ok_or(Error::SteamNotFound)?;

    #[cfg(target_os = "windows")]
    let steam_exe = steam_dir.path().join("steam.exe");

    #[cfg(target_os = "linux")]
    let steam_exe = steam_dir.path().join("steam.sh");

    #[cfg(target_os = "macos")]
    let steam_exe = steam_dir.path().join("steam");

    if steam_exe.exists() {
      Ok(steam_exe)
    } else {
      Err(Error::SteamNotFound)
    }
  }

  /// Launch Deadlock through Steam with optional arguments
  pub fn launch_game(&self, additional_args: &str) -> Result<(), Error> {
    let steam_uri = format!("steam://run/{DEADLOCK_APP_ID}//{additional_args}");
    log::info!("Launching game with URI: {steam_uri}");

    #[cfg(target_os = "windows")]
    {
      let steam_exe = self.get_steam_executable()?;
      std::process::Command::new(steam_exe)
        .arg(&steam_uri)
        .spawn()
        .map_err(|e| Error::GameLaunchFailed(e.to_string()))?;
    }

    #[cfg(target_os = "linux")]
    {
      std::process::Command::new("xdg-open")
        .arg(&steam_uri)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| Error::GameLaunchFailed(e.to_string()))?;
    }

    #[cfg(target_os = "macos")]
    {
      std::process::Command::new("open")
        .arg(&steam_uri)
        .spawn()
        .map_err(|e| Error::GameLaunchFailed(e.to_string()))?;
    }

    Ok(())
  }

  fn candidate_steam_dirs(&self) -> Vec<steamlocate::SteamDir> {
    let mut steam_dirs = Vec::new();

    if let Some(steam_dir) = self.steam_dir.clone() {
      push_unique_steam_dir(&mut steam_dirs, steam_dir);
    }

    if let Ok(steam_dir) = steamlocate::SteamDir::locate() {
      log::info!("Steam path from steamlocate: {:?}", steam_dir.path());
      push_unique_steam_dir(&mut steam_dirs, steam_dir);
    }

    #[cfg(target_os = "linux")]
    if let Some(home_dir) = std::env::var_os("HOME").map(PathBuf::from) {
      for candidate in linux_steam_dir_candidates(&home_dir) {
        if let Ok(steam_dir) = steamlocate::SteamDir::from_dir(&candidate) {
          log::info!(
            "Steam fallback candidate path found: {:?}",
            steam_dir.path()
          );
          push_unique_steam_dir(&mut steam_dirs, steam_dir);
        }
      }
    }

    steam_dirs
  }
}

impl Default for SteamManager {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  const DEADLOCK_INSTALL_DIR: &str = "Deadlock";

  fn create_steam_dir(base_path: &Path, has_deadlock: bool) {
    let steamapps_path = base_path.join("steamapps");
    fs::create_dir_all(steamapps_path.join("common")).unwrap();

    let apps_section = if has_deadlock {
      format!("\"{DEADLOCK_APP_ID}\"\t\t\"0\"")
    } else {
      String::new()
    };

    fs::write(
      steamapps_path.join("libraryfolders.vdf"),
      format!(
        "\"libraryfolders\"\n{{\n\t\"0\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t\t\"label\"\t\t\"\"\n\t\t\"contentid\"\t\t\"1\"\n\t\t\"totalsize\"\t\t\"0\"\n\t\t\"apps\"\n\t\t{{\n\t\t\t{}\n\t\t}}\n\t}}\n}}\n",
        base_path.display(),
        apps_section
      ),
    )
    .unwrap();

    if has_deadlock {
      fs::write(
        steamapps_path.join(format!("appmanifest_{DEADLOCK_APP_ID}.acf")),
        format!(
          "\"AppState\"\n{{\n\t\"appid\"\t\t\"{DEADLOCK_APP_ID}\"\n\t\"name\"\t\t\"Deadlock\"\n\t\"installdir\"\t\t\"{DEADLOCK_INSTALL_DIR}\"\n}}\n"
        ),
      )
      .unwrap();

      fs::create_dir_all(steamapps_path.join("common").join(DEADLOCK_INSTALL_DIR)).unwrap();
    }
  }

  fn temp_steam_dir(relative_path: &str, has_deadlock: bool) -> (TempDir, steamlocate::SteamDir) {
    let temp_dir = tempfile::tempdir().unwrap();
    let steam_path = temp_dir.path().join(relative_path);
    create_steam_dir(&steam_path, has_deadlock);

    (
      temp_dir,
      steamlocate::SteamDir::from_dir(&steam_path).unwrap(),
    )
  }

  #[test]
  fn linux_candidates_include_flatpak_data_steam_path() {
    let candidates = linux_steam_dir_candidates(Path::new("/home/tester"));

    assert!(
      candidates.contains(&PathBuf::from(
        "/home/tester/.var/app/com.valvesoftware.Steam/data/Steam"
      )),
      "expected Flatpak Steam data path fallback to be included"
    );
    assert!(
      candidates.contains(&PathBuf::from(
        "/home/tester/.var/app/com.valvesoftware.Steam/.local/share/Steam"
      )),
      "expected Flatpak Steam .local/share fallback to be included"
    );
    assert!(
      candidates.contains(&PathBuf::from(
        "/home/tester/.var/app/com.valvesoftware.Steam/.steam/steam"
      )),
      "expected Flatpak Steam .steam/steam fallback to be included"
    );
    assert!(
      candidates.contains(&PathBuf::from(
        "/home/tester/.var/app/com.valvesoftware.Steam/.steam/root"
      )),
      "expected Flatpak Steam .steam/root fallback to be included"
    );
  }

  #[test]
  fn resolve_game_from_steam_dirs_finds_deadlock_in_fallback_directory() {
    let (_primary_temp_dir, primary_steam_dir) = temp_steam_dir(".local/share/Steam", false);
    let (_flatpak_temp_dir, flatpak_steam_dir) =
      temp_steam_dir(".var/app/com.valvesoftware.Steam/data/Steam", true);

    let resolved = resolve_game_from_steam_dirs(vec![primary_steam_dir, flatpak_steam_dir])
      .expect("expected Deadlock to be found in fallback Steam directory");

    assert!(
      resolved
        .0
        .path()
        .ends_with(".var/app/com.valvesoftware.Steam/data/Steam")
    );
    assert!(
      resolved
        .1
        .ends_with(".var/app/com.valvesoftware.Steam/data/Steam/steamapps/common/Deadlock")
    );
  }
}
