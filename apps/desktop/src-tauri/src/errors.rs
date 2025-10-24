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
  #[error("Failed to extract mod: {0}")]
  ModExtractionFailed(String),
  #[error("Invalid input: {0}")]
  InvalidInput(String),
  #[error("Unauthorized path access attempted: {0}")]
  UnauthorizedPath(String),
  #[error("Network error: {0}")]
  NetworkError(String),
  #[error("Tauri error: {0}")]
  Tauri(#[from] tauri::Error),
  #[error("Failed to create backup: {0}")]
  BackupCreationFailed(String),
  #[error("Failed to restore backup: {0}")]
  BackupRestoreFailed(String),
  #[error("Backup not found")]
  BackupNotFound,
  #[error("Download failed: {0}")]
  DownloadFailed(String),
  #[error("Download cancelled")]
  DownloadCancelled,
  #[error("File write failed: {0}")]
  FileWriteFailed(String),
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
      Error::ModFileNotFound => "modFileNotFound",
      Error::KeyValues(_) => "keyValues",
      Error::Rar(_) => "rar",
      Error::Zip(_) => "zip",
      Error::ModInvalid(_) => "modInvalid",
      Error::GameRunning => "gameRunning",
      Error::GameNotRunning => "gameNotRunning",
      Error::GameLaunchFailed(_) => "gameLaunchFailed",
      Error::ModExtractionFailed(_) => "modExtractionFailed",
      Error::InvalidInput(_) => "invalidInput",
      Error::UnauthorizedPath(_) => "unauthorizedPath",
      Error::NetworkError(_) => "networkError",
      Error::Tauri(_) => "tauri",
      Error::BackupCreationFailed(_) => "backupCreationFailed",
      Error::BackupRestoreFailed(_) => "backupRestoreFailed",
      Error::BackupNotFound => "backupNotFound",
      Error::DownloadFailed(_) => "downloadFailed",
      Error::DownloadCancelled => "downloadCancelled",
      Error::FileWriteFailed(_) => "fileWriteFailed",
    };

    state.serialize_field("kind", kind)?;
    state.serialize_field("message", &self.to_string())?;
    state.end()
  }
}
