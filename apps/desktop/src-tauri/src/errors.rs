#[derive(Debug, serde::Serialize)]
pub struct MissingLaunchMod {
  pub id: String,
  pub name: String,
}

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
  #[error("App handle not initialized")]
  AppHandleNotInitialized,
  #[error(
    "Failed to parse game configuration. Try resetting the gameinfo.gi to Vanilla in Settings → Game and restart the mod manager."
  )]
  GameConfigParse(String),
  #[error("Mod file not found at path")]
  ModFileNotFound,
  #[error(transparent)]
  KeyValues(#[from] Box<keyvalues_serde::Error>),
  #[error(transparent)]
  Rar(#[from] unrar::error::UnrarError),
  #[error(transparent)]
  Zip(#[from] zip::result::ZipError),
  #[error("Mod is invalid: {0}")]
  ModInvalid(String),
  #[error("Game is running")]
  GameRunning,
  #[error("Game is not running")]
  GameNotRunning,
  #[error("Failed to launch game: {0}")]
  GameLaunchFailed(String),
  #[error("Merged mod data must be reviewed before launching")]
  ModDataReviewRequired,
  #[error(
    "Cannot launch modded: files are missing for {}. Reinstall or disable these mods, then try again.",
    .0.iter().map(|mod_info| mod_info.name.as_str()).collect::<Vec<_>>().join(", ")
  )]
  MissingEnabledModFiles(Vec<MissingLaunchMod>),
  #[error("Failed to extract mod: {0}")]
  ModExtractionFailed(String),
  #[error("Invalid input: {0}")]
  InvalidInput(String),
  #[error("Unauthorized path access attempted: {0}")]
  UnauthorizedPath(String),
  #[error("Network error: {0}")]
  Network(String),
  #[error("GameBanana rate limit reached; retry in {retry_after_secs} seconds")]
  ProviderRateLimited { retry_after_secs: u64 },
  #[error("GameBanana refused automatic requests")]
  ProviderRefused,
  #[error("GameBanana is unavailable: {0}")]
  ProviderUnavailable(String),
  #[error("GameBanana returned an invalid response: {0}")]
  ProviderInvalidResponse(String),
  #[error("GameBanana response exceeded the {limit}-byte safety limit")]
  ProviderResponseTooLarge { limit: usize },
  #[error("GameBanana request was cancelled")]
  ProviderCancelled,
  #[error("Catalog error: {0}")]
  Catalog(String),
  #[error("Performance config error: {0}")]
  PerformanceConfig(String),
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
  #[error("Failed to read autoexec config: {0}")]
  AutoexecReadFailed(String),
  #[error("Failed to write autoexec config: {0}")]
  AutoexecWriteFailed(String),
  #[error("Failed to reset persisted crosshair settings: {0}")]
  CrosshairConfigResetFailed(String),
  #[error(
    "Operation failed and rollback was incomplete — VPK files may be in an inconsistent state: {0}"
  )]
  RollbackFailed(String),
  #[error("Background task failed: {0}")]
  BackgroundTaskFailed(String),
  #[error("VPK files are in use and cannot be deleted: {0}")]
  VpkInUse(String),
  // subcode is a stable machine-readable tag (e.g. "consentRequired") so the
  // frontend can branch/localize without parsing the English message.
  #[error("Match sync error: {message}")]
  MatchSync {
    subcode: &'static str,
    message: String,
  },
}

impl Error {
  pub fn io_context(action: &str, path: &std::path::Path, error: std::io::Error) -> Self {
    Self::Io(std::io::Error::new(
      error.kind(),
      format!("Could not {action} {}: {error}", path.display()),
    ))
  }
}

impl From<diesel::result::Error> for Error {
  fn from(error: diesel::result::Error) -> Self {
    Self::Catalog(error.to_string())
  }
}

impl serde::Serialize for Error {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    use serde::ser::SerializeStruct;
    let field_count = if matches!(self, Error::MissingEnabledModFiles(_)) {
      4
    } else {
      3
    };
    let mut state = serializer.serialize_struct("Error", field_count)?;

    // Map the error variant to the corresponding kind string
    let kind = match self {
      Error::Io(_) => "io",
      Error::Utf8(_) => "utf8",
      Error::SteamNotFound => "steamNotFound",
      Error::GameNotFound => "gameNotFound",
      Error::GamePathNotSet => "gamePathNotSet",
      Error::AppHandleNotInitialized => "appHandleNotInitialized",
      Error::GameConfigParse(_) => "gameConfigParse",
      Error::ModFileNotFound => "modFileNotFound",
      Error::KeyValues(_) => "keyValues",
      Error::Rar(_) => "rar",
      Error::Zip(_) => "zip",
      Error::ModInvalid(_) => "modInvalid",
      Error::GameRunning => "gameRunning",
      Error::GameNotRunning => "gameNotRunning",
      Error::GameLaunchFailed(_) => "gameLaunchFailed",
      Error::ModDataReviewRequired => "modDataReviewRequired",
      Error::MissingEnabledModFiles(_) => "missingEnabledModFiles",
      Error::ModExtractionFailed(_) => "modExtractionFailed",
      Error::InvalidInput(_) => "invalidInput",
      Error::UnauthorizedPath(_) => "unauthorizedPath",
      Error::Network(_) => "networkError",
      Error::ProviderRateLimited { .. } => "providerRateLimited",
      Error::ProviderRefused => "providerRefused",
      Error::ProviderUnavailable(_) => "providerUnavailable",
      Error::ProviderInvalidResponse(_) => "providerInvalidResponse",
      Error::ProviderResponseTooLarge { .. } => "providerResponseTooLarge",
      Error::ProviderCancelled => "providerCancelled",
      Error::Catalog(_) => "catalogError",
      Error::PerformanceConfig(_) => "performanceConfig",
      Error::Tauri(_) => "tauri",
      Error::BackupCreationFailed(_) => "backupCreationFailed",
      Error::BackupRestoreFailed(_) => "backupRestoreFailed",
      Error::BackupNotFound => "backupNotFound",
      Error::DownloadFailed(_) => "downloadFailed",
      Error::DownloadCancelled => "downloadCancelled",
      Error::FileWriteFailed(_) => "fileWriteFailed",
      Error::AutoexecReadFailed(_) => "autoexecReadFailed",
      Error::AutoexecWriteFailed(_) => "autoexecWriteFailed",
      Error::CrosshairConfigResetFailed(_) => "crosshairConfigResetFailed",
      Error::RollbackFailed(_) => "rollbackFailed",
      Error::BackgroundTaskFailed(_) => "backgroundTaskFailed",
      Error::VpkInUse(_) => "vpkInUse",
      Error::MatchSync { .. } => "matchSync",
    };
    let match_sync_kind: Option<&str> = match self {
      Error::MatchSync { subcode, .. } => Some(subcode),
      _ => None,
    };

    state.serialize_field("kind", kind)?;
    state.serialize_field("message", &self.to_string())?;
    state.serialize_field("matchSyncKind", &match_sync_kind)?;
    if let Error::MissingEnabledModFiles(mods) = self {
      state.serialize_field("affectedMods", mods)?;
    }
    state.end()
  }
}

#[cfg(test)]
mod tests {
  use super::{Error, MissingLaunchMod};

  #[test]
  fn missing_enabled_mod_files_serializes_affected_mods() {
    let error = Error::MissingEnabledModFiles(vec![MissingLaunchMod {
      id: "42".into(),
      name: "Fixture skin".into(),
    }]);
    let json = serde_json::to_value(&error).unwrap();
    assert_eq!(json["kind"], "missingEnabledModFiles");
    assert_eq!(
      json["affectedMods"],
      serde_json::json!([{ "id": "42", "name": "Fixture skin" }])
    );
    assert_eq!(
      json["message"],
      "Cannot launch modded: files are missing for Fixture skin. Reinstall or disable these mods, then try again."
    );
    assert!(json["matchSyncKind"].is_null());
  }

  #[test]
  fn contextual_file_errors_keep_io_kind_and_name_the_path() {
    let error = Error::io_context(
      "read compatibility input",
      std::path::Path::new("missing-mod.vpk"),
      std::io::Error::from(std::io::ErrorKind::NotFound),
    );
    let Error::Io(source) = &error else {
      panic!("expected an IO error")
    };
    assert_eq!(source.kind(), std::io::ErrorKind::NotFound);
    let json = serde_json::to_value(&error).unwrap();
    assert_eq!(json["kind"], "io");
    assert!(
      json["message"]
        .as_str()
        .unwrap()
        .contains("read compatibility input missing-mod.vpk")
    );
  }

  #[test]
  fn match_sync_error_serializes_its_subcode() {
    let err = Error::MatchSync {
      subcode: "consentRequired",
      message: "Consent has not been accepted".into(),
    };
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["kind"], "matchSync");
    assert_eq!(json["matchSyncKind"], "consentRequired");
    assert_eq!(
      json["message"],
      "Match sync error: Consent has not been accepted"
    );
  }

  #[test]
  fn other_errors_have_no_match_sync_subcode() {
    let err = Error::GameNotFound;
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["kind"], "gameNotFound");
    assert!(json["matchSyncKind"].is_null());
  }

  #[test]
  fn provider_errors_have_stable_serialized_kinds() {
    let cases = [
      (
        Error::ProviderRateLimited {
          retry_after_secs: 30,
        },
        "providerRateLimited",
      ),
      (Error::ProviderRefused, "providerRefused"),
      (
        Error::ProviderUnavailable("offline".into()),
        "providerUnavailable",
      ),
      (
        Error::ProviderInvalidResponse("bad json".into()),
        "providerInvalidResponse",
      ),
      (
        Error::ProviderResponseTooLarge { limit: 1024 },
        "providerResponseTooLarge",
      ),
      (Error::ProviderCancelled, "providerCancelled"),
      (
        Error::Catalog("database unavailable".into()),
        "catalogError",
      ),
    ];

    for (error, expected_kind) in cases {
      let json = serde_json::to_value(error).unwrap();
      assert_eq!(json["kind"], expected_kind);
    }
  }

  #[test]
  fn mod_data_review_error_has_a_stable_kind() {
    let json = serde_json::to_value(Error::ModDataReviewRequired).unwrap();
    assert_eq!(json["kind"], "modDataReviewRequired");
  }
}
