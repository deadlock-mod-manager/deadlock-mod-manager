use crate::errors::Error;
use log;
use std::path::PathBuf;

const DEADLOCK_APP_ID: u32 = 1422450;

/// Manages Steam integration and game path detection
pub struct SteamManager {
  steam_dir: Option<steamlocate::SteamDir>,
  game_path: Option<PathBuf>,
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
      let steam_dir = steamlocate::SteamDir::locate().map_err(|_| Error::SteamNotFound)?;
      log::info!("Steam path from steamlocate: {:?}", steam_dir.path());
      self.steam_dir = Some(steam_dir);
    }

    Ok(self.steam_dir.as_ref().unwrap())
  }

  /// Find the Deadlock game installation path
  pub fn find_game(&mut self) -> Result<&PathBuf, Error> {
    if self.game_path.is_none() {
      let steam_dir = self.find_steam()?;
      let (game, library) = steam_dir
        .find_app(DEADLOCK_APP_ID)
        .map_err(|_| Error::GameNotFound)?
        .ok_or(Error::GameNotFound)?;

      let game_path = library.resolve_app_dir(&game);
      if game_path.exists() {
        log::info!("Game path found: {game_path:?}");
        self.game_path = Some(game_path);
      } else {
        return Err(Error::GameNotFound);
      }
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
}

impl Default for SteamManager {
  fn default() -> Self {
    Self::new()
  }
}
