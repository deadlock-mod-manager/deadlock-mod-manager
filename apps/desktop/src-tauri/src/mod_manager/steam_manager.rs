use crate::errors::Error;
use crate::mod_manager::steam_uri_launcher::{SteamUriLaunchRequest, redacted_steam_uri};
use log;
#[cfg(target_os = "linux")]
use std::path::Path;
use std::path::PathBuf;

const DEADLOCK_APP_ID: u32 = 1422450;

#[cfg(target_os = "linux")]
fn flatpak_game_launch_args(additional_args: &str) -> String {
  let additional_args = additional_args.trim();
  if additional_args
    .split_ascii_whitespace()
    .any(|argument| argument == "-condebug")
  {
    return additional_args.to_string();
  }

  if additional_args.is_empty() {
    "-condebug".to_string()
  } else {
    format!("{additional_args} -condebug")
  }
}

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

  pub fn set_steam_dir(&mut self, path: PathBuf) -> Result<(), Error> {
    if !path.exists() {
      return Err(Error::InvalidInput(
        "Invalid Steam path: directory does not exist".to_string(),
      ));
    }

    // steamlocate's from_dir only checks that the path is a directory.
    if !path.join("steamapps").is_dir() {
      return Err(Error::InvalidInput(
        "Invalid Steam path: not a valid Steam installation directory".to_string(),
      ));
    }

    let steam_dir = steamlocate::SteamDir::from_dir(&path).map_err(|_| {
      Error::InvalidInput(
        "Invalid Steam path: not a valid Steam installation directory".to_string(),
      )
    })?;

    log::info!("Manually set Steam path to: {path:?}");
    self.steam_dir = Some(steam_dir);
    Ok(())
  }

  pub fn clear_steam_dir(&mut self) {
    self.steam_dir = None;
  }

  pub fn get_steam_path(&self) -> Option<PathBuf> {
    self
      .steam_dir
      .as_ref()
      .map(|steam_dir| steam_dir.path().to_path_buf())
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

  #[cfg(target_os = "linux")]
  fn linux_uri_launch_request(
    &self,
    steam_uri: &str,
    running_in_flatpak: bool,
  ) -> SteamUriLaunchRequest {
    if running_in_flatpak {
      log::info!("Launching Steam URI through the Flatpak portal");
      return SteamUriLaunchRequest::portal(PathBuf::from("xdg-open"), steam_uri.to_string());
    }

    match self.get_steam_executable() {
      Ok(steam_exe) => {
        log::info!(
          "Launching via Steam executable directly: {}",
          steam_exe.display()
        );
        SteamUriLaunchRequest::direct(steam_exe, steam_uri.to_string())
      }
      Err(_) => {
        log::info!("No Steam executable found, falling back to xdg-open");
        SteamUriLaunchRequest::portal(PathBuf::from("xdg-open"), steam_uri.to_string())
      }
    }
  }

  /// Prepare a request to launch Deadlock through Steam with optional arguments.
  pub fn game_launch_request(&self, additional_args: &str) -> Result<SteamUriLaunchRequest, Error> {
    #[cfg(target_os = "linux")]
    let additional_args = if crate::flatpak::running_in_flatpak() {
      // Flatpak cannot see the host's process table, so console.log is the
      // startup signal used to distinguish a running game from a false launch.
      flatpak_game_launch_args(additional_args)
    } else {
      additional_args.to_string()
    };

    #[cfg(not(target_os = "linux"))]
    let additional_args = additional_args.to_string();

    let steam_uri = format!("steam://run/{DEADLOCK_APP_ID}//{additional_args}");
    self.uri_launch_request(&steam_uri)
  }

  /// Hand a `steam://` URI to the Steam client.
  ///
  /// `steam://connect/<ip:port>` is the only join path Steam treats as
  /// first-class: it launches the game when it is closed and hands the
  /// address to an already running client, which `steam://run//+connect`
  /// cannot do.
  pub fn uri_launch_request(&self, steam_uri: &str) -> Result<SteamUriLaunchRequest, Error> {
    log::info!("Opening Steam URI: {}", redacted_steam_uri(steam_uri));

    #[cfg(target_os = "windows")]
    {
      let steam_exe = self.get_steam_executable()?;
      Ok(SteamUriLaunchRequest::direct(
        steam_exe,
        steam_uri.to_string(),
      ))
    }

    #[cfg(target_os = "linux")]
    {
      Ok(self.linux_uri_launch_request(steam_uri, crate::flatpak::running_in_flatpak()))
    }

    #[cfg(target_os = "macos")]
    {
      Ok(SteamUriLaunchRequest::direct(
        PathBuf::from("open"),
        steam_uri.to_string(),
      ))
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    Err(Error::GameLaunchFailed(
      "Steam URI launching is unsupported on this platform".to_string(),
    ))
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

  #[test]
  fn set_steam_dir_accepts_valid_steam_installation() {
    let (_temp_dir, steam_dir) = temp_steam_dir("Steam", false);
    let steam_path = steam_dir.path().to_path_buf();
    let mut manager = SteamManager::new();

    manager
      .set_steam_dir(steam_path.clone())
      .expect("expected valid Steam directory to be accepted");

    assert_eq!(manager.get_steam_path(), Some(steam_path));
  }

  #[test]
  fn set_steam_dir_rejects_invalid_directory() {
    let temp_dir = tempfile::tempdir().unwrap();
    let mut manager = SteamManager::new();

    let result = manager.set_steam_dir(temp_dir.path().to_path_buf());
    assert!(result.is_err());
  }

  #[test]
  fn resolve_uri_launcher_prefers_the_steam_executable_on_native_linux() {
    let (temp_dir, steam_dir) = temp_steam_dir("Steam", false);
    let steam_sh = steam_dir.path().join("steam.sh");
    fs::write(&steam_sh, "").unwrap();
    let mut manager = SteamManager::new();
    manager
      .set_steam_dir(temp_dir.path().join("Steam"))
      .unwrap();

    let request = manager.linux_uri_launch_request("steam://run/1422450//", false);
    assert_eq!(request.program(), steam_sh);
    assert!(!request.uses_portal_timeout());
  }

  #[test]
  fn resolve_uri_launcher_falls_back_to_xdg_open_without_a_steam_executable() {
    let manager = SteamManager::new();

    let request = manager.linux_uri_launch_request("steam://run/1422450//", false);
    assert_eq!(request.program(), Path::new("xdg-open"));
    assert!(request.uses_portal_timeout());
  }

  #[test]
  fn resolve_uri_launcher_uses_xdg_open_inside_flatpak() {
    let (temp_dir, steam_dir) = temp_steam_dir("Steam", false);
    fs::write(steam_dir.path().join("steam.sh"), "").unwrap();
    let mut manager = SteamManager::new();
    manager
      .set_steam_dir(temp_dir.path().join("Steam"))
      .unwrap();

    let request = manager.linux_uri_launch_request("steam://run/1422450//", true);
    assert_eq!(request.program(), Path::new("xdg-open"));
    assert!(request.uses_portal_timeout());
  }

  #[test]
  fn flatpak_launch_args_include_console_logging_for_startup_confirmation() {
    assert_eq!(flatpak_game_launch_args(""), "-condebug");
    assert_eq!(
      flatpak_game_launch_args("-novid +exec autoexec"),
      "-novid +exec autoexec -condebug"
    );
    assert_eq!(
      flatpak_game_launch_args("-novid -condebug"),
      "-novid -condebug"
    );
    assert_eq!(
      flatpak_game_launch_args("-condebuglog"),
      "-condebuglog -condebug"
    );
  }
}
