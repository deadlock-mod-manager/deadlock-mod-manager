#[derive(Debug, thiserror::Error)]
pub enum Error {
  #[error(transparent)]
  Io(#[from] std::io::Error),
  #[error("failed to parse as string: {0}")]
  Utf8(#[from] std::str::Utf8Error),
  #[error("Steam installation not found")]
  SteamNotFound,
  #[error("Game not found in any Steam library")]
  GameNotFound,
  #[error("Game path not set - initialize game first")]
  GamePathNotSet,
  #[error("Failed to parse game configuration: {0}")]
  GameConfigParse(String),
  #[error("Mod {0} is already installed")]
  #[allow(dead_code)]
  ModAlreadyInstalled(String),
  #[error("Mod file not found at path")]
  ModFileNotFound,
  #[error(transparent)]
  KeyValues(#[from] keyvalues_serde::Error),
  #[error(transparent)]
  Rar(#[from] unrar::error::UnrarError),
  #[error(transparent)]
  Zip(#[from] zip::result::ZipError),
  #[error("Mod is invalid")]
  ModInvalid(String),
  #[error("Game is running")]
  GameRunning,
  #[error("Game is not running")]
  GameNotRunning,
  #[error("Failed to launch game: {0}")]
  GameLaunchFailed(String),
  #[error("Failed to open folder: {0}")]
  FailedToOpenFolder(String),
  #[error("Failed to extract mod: {0}")]
  ModExtractionFailed(String),
  #[error("Invalid input: {0}")]
  InvalidInput(String),
  #[error("Backup operation failed: {0}")]
  BackupFailed(String),
  #[error("Backup integrity check failed: {0}")]
  BackupIntegrityFailed(String),
  #[error("gameinfo.gi validation failed: {0}")]
  GameInfoValidationFailed(String),
  #[error("External file modification detected: {0}")]
  ExternalModification(String),
  #[error("Unauthorized path access attempted: {0}")]
  UnauthorizedPath(String),
  #[error("JSON serialization/deserialization error: {0}")]
  Json(#[from] serde_json::Error),
  #[error("Invalid gameinfo.gi file")]
  InvalidGameInfo,
  #[error("Tauri error: {0}")]
  Tauri(#[from] tauri::Error),
}

impl serde::Serialize for Error {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    use serde::ser::SerializeStruct;
    let mut state = serializer.serialize_struct("Error", 2)?;

    // Map the error variant to the corresponding kind string
    let kind = match self {
      Error::Io(_) => "io",
      Error::Utf8(_) => "utf8",
      Error::SteamNotFound => "steamNotFound",
      Error::GameNotFound => "gameNotFound",
      Error::GamePathNotSet => "gamePathNotSet",
      Error::GameConfigParse(_) => "gameConfigParse",
      Error::ModAlreadyInstalled(_) => "modAlreadyInstalled",
      Error::ModFileNotFound => "modFileNotFound",
      Error::KeyValues(_) => "keyValues",
      Error::Rar(_) => "rar",
      Error::Zip(_) => "zip",
      Error::ModInvalid(_) => "modInvalid",
      Error::GameRunning => "gameRunning",
      Error::GameNotRunning => "gameNotRunning",
      Error::GameLaunchFailed(_) => "gameLaunchFailed",
      Error::FailedToOpenFolder(_) => "failedToOpenFolder",
      Error::ModExtractionFailed(_) => "modExtractionFailed",
      Error::InvalidInput(_) => "invalidInput",
      Error::BackupFailed(_) => "backupFailed",
      Error::BackupIntegrityFailed(_) => "backupIntegrityFailed",
      Error::GameInfoValidationFailed(_) => "gameInfoValidationFailed",
      Error::ExternalModification(_) => "externalModification",
      Error::UnauthorizedPath(_) => "unauthorizedPath",
      Error::Json(_) => "json",
      Error::InvalidGameInfo => "invalidGameInfo",
      Error::Tauri(_) => "tauri",
    };

    state.serialize_field("kind", kind)?;
    state.serialize_field("message", &self.to_string())?;
    state.end()
  }
}
