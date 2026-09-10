use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;
use thiserror::Error;

use crate::app_runtime::AppHandle;

pub const E2E_CONFIG_ENV: &str = "DMM_E2E_CONFIG";
const E2E_IDENTITY_PREFIX: &str = "dev.stormix.deadlock-mod-manager.e2e.";

static RUNTIME_ENVIRONMENT: OnceLock<RuntimeEnvironment> = OnceLock::new();

#[derive(Debug, Clone)]
pub enum RuntimeEnvironment {
  Production,
  E2e(E2eConfiguration),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct E2eConfiguration {
  pub schema_version: u32,
  pub run_id: String,
  pub case_id: String,
  pub attempt: u32,
  pub application_identity: String,
  pub roots: E2eRoots,
  pub endpoints: Vec<ServiceEndpoint>,
  pub network_mode: FixtureOnly,
  pub integrations: IntegrationPolicy,
  pub ui: UiConfiguration,
  pub control: ControlConfiguration,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct E2eRoots {
  pub world: PathBuf,
  pub game: PathBuf,
  pub steam: PathBuf,
  pub steam_http_cache: PathBuf,
  pub app_data: PathBuf,
  pub app_config: PathBuf,
  pub app_cache: PathBuf,
  pub app_logs: PathBuf,
  pub webview_data: PathBuf,
  pub temporary: PathBuf,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum ServiceName {
  Gamebanana,
  Downloads,
  DmmApi,
  Auth,
  DeadlockApi,
  Assets,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServiceEndpoint {
  pub service: ServiceName,
  pub origin: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IntegrationPolicy {
  pub updater: UpdaterPolicy,
  pub steam_discovery: FixtureOnly,
  pub game_launch: RecordOnly,
  pub presence: DisabledOnly,
  pub ingestion: DisabledOnly,
  pub match_sync: DisabledOnly,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdaterPolicy {
  Disabled,
  Fixture,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FixtureOnly {
  Fixture,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RecordOnly {
  Record,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DisabledOnly {
  Disabled,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UiConfiguration {
  pub language: String,
  pub width: u32,
  pub height: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ControlConfiguration {
  pub endpoint: String,
  pub token_file: PathBuf,
}

#[derive(Debug, Error)]
pub enum RuntimeEnvironmentError {
  #[error("{E2E_CONFIG_ENV} is required in an e2e-harness build")]
  MissingConfiguration,
  #[error("{E2E_CONFIG_ENV} cannot activate E2E mode in a production build")]
  UnsupportedConfiguration,
  #[error("failed to read E2E configuration '{path}': {source}")]
  ReadConfiguration {
    path: PathBuf,
    source: std::io::Error,
  },
  #[error("failed to parse E2E configuration '{path}': {source}")]
  ParseConfiguration {
    path: PathBuf,
    source: serde_json::Error,
  },
  #[error("invalid E2E configuration: {0}")]
  InvalidConfiguration(String),
  #[error("runtime environment was initialized more than once with a different value")]
  AlreadyInitialized,
}

impl E2eConfiguration {
  pub fn from_file(path: &Path) -> Result<Self, RuntimeEnvironmentError> {
    let contents = std::fs::read_to_string(path).map_err(|source| {
      RuntimeEnvironmentError::ReadConfiguration {
        path: path.to_path_buf(),
        source,
      }
    })?;
    let configuration = serde_json::from_str::<Self>(&contents).map_err(|source| {
      RuntimeEnvironmentError::ParseConfiguration {
        path: path.to_path_buf(),
        source,
      }
    })?;
    configuration.validate(path)?;
    Ok(configuration)
  }

  fn validate(&self, config_path: &Path) -> Result<(), RuntimeEnvironmentError> {
    if self.schema_version != 1 {
      return invalid(format!(
        "unsupported schemaVersion {}; expected 1",
        self.schema_version
      ));
    }
    validate_id("runId", &self.run_id)?;
    validate_id("caseId", &self.case_id)?;
    if self.attempt == 0 {
      return invalid("attempt must be greater than zero");
    }
    if !self.application_identity.starts_with(E2E_IDENTITY_PREFIX)
      || !self
        .application_identity
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-'))
    {
      return invalid(format!(
        "applicationIdentity must start with '{E2E_IDENTITY_PREFIX}' and contain only ASCII letters, digits, dots, or hyphens"
      ));
    }
    if !(320..=8192).contains(&self.ui.width) || !(240..=8192).contains(&self.ui.height) {
      return invalid("ui dimensions must be between 320x240 and 8192x8192");
    }
    validate_id("ui.language", &self.ui.language)?;
    if self.control.endpoint.trim().is_empty() {
      return invalid("control.endpoint must not be empty");
    }
    validate_loopback_url("control.endpoint", &self.control.endpoint, true)?;
    let world = canonical_directory("roots.world", &self.roots.world)?;
    for (name, path) in self.roots.named_paths().into_iter().skip(1) {
      let canonical = canonical_directory(name, path)?;
      ensure_contained(name, &canonical, &world)?;
    }

    let token_file = canonical_file("control.tokenFile", &self.control.token_file)?;
    ensure_contained("control.tokenFile", &token_file, &world)?;
    let config_file = canonical_file("configuration file", config_path)?;
    ensure_contained("configuration file", &config_file, &world)?;

    let expected_services = [
      ServiceName::Gamebanana,
      ServiceName::Downloads,
      ServiceName::DmmApi,
      ServiceName::Auth,
      ServiceName::DeadlockApi,
      ServiceName::Assets,
    ];
    let mut observed = HashSet::new();
    for endpoint in &self.endpoints {
      if !observed.insert(endpoint.service) {
        return invalid(format!("duplicate endpoint for {:?}", endpoint.service));
      }
      validate_loopback_origin(&endpoint.origin)?;
    }
    if observed.len() != expected_services.len()
      || expected_services
        .iter()
        .any(|service| !observed.contains(service))
    {
      return invalid("endpoints must define each supported service exactly once");
    }

    Ok(())
  }

  pub fn state_store_path(&self) -> PathBuf {
    self.roots.app_data.join("state.json")
  }

  #[cfg(feature = "e2e-harness")]
  pub fn permits_download_url(&self, url: &reqwest::Url) -> bool {
    url.username().is_empty()
      && url.password().is_none()
      && self.endpoints.iter().any(|endpoint| {
        reqwest::Url::parse(&endpoint.origin).is_ok_and(|origin| origin.origin() == url.origin())
      })
  }

  pub fn endpoint(&self, service: ServiceName) -> &str {
    self
      .endpoints
      .iter()
      .find(|endpoint| endpoint.service == service)
      .map(|endpoint| endpoint.origin.as_str())
      .expect("validated E2E configuration has every endpoint")
  }
}

impl E2eRoots {
  fn named_paths(&self) -> [(&'static str, &Path); 10] {
    [
      ("roots.world", &self.world),
      ("roots.game", &self.game),
      ("roots.steam", &self.steam),
      ("roots.steamHttpCache", &self.steam_http_cache),
      ("roots.appData", &self.app_data),
      ("roots.appConfig", &self.app_config),
      ("roots.appCache", &self.app_cache),
      ("roots.appLogs", &self.app_logs),
      ("roots.webviewData", &self.webview_data),
      ("roots.temporary", &self.temporary),
    ]
  }
}

impl RuntimeEnvironment {
  pub fn e2e(&self) -> Option<&E2eConfiguration> {
    match self {
      Self::Production => None,
      Self::E2e(configuration) => Some(configuration),
    }
  }
}

pub fn initialize() -> Result<&'static RuntimeEnvironment, RuntimeEnvironmentError> {
  if let Some(existing) = RUNTIME_ENVIRONMENT.get() {
    return Ok(existing);
  }
  let environment = environment_from_process()?;
  RUNTIME_ENVIRONMENT
    .set(environment)
    .map_err(|_| RuntimeEnvironmentError::AlreadyInitialized)?;
  Ok(
    RUNTIME_ENVIRONMENT
      .get()
      .expect("runtime environment was just initialized"),
  )
}

pub fn current() -> &'static RuntimeEnvironment {
  RUNTIME_ENVIRONMENT
    .get()
    .expect("runtime environment must be initialized before application setup")
}

pub fn is_e2e_active() -> bool {
  matches!(RUNTIME_ENVIRONMENT.get(), Some(RuntimeEnvironment::E2e(_)))
}

pub fn records_game_launches() -> bool {
  RUNTIME_ENVIRONMENT
    .get()
    .and_then(RuntimeEnvironment::e2e)
    .is_some()
}

pub fn ensure_e2e_managed_path(path: &Path) -> Result<(), String> {
  let Some(configuration) = RUNTIME_ENVIRONMENT.get().and_then(RuntimeEnvironment::e2e) else {
    return Ok(());
  };
  let candidate = path
    .canonicalize()
    .map_err(|error| format!("failed to resolve E2E path '{}': {error}", path.display()))?;
  let world = configuration
    .roots
    .world
    .canonicalize()
    .map_err(|error| format!("failed to resolve E2E world: {error}"))?;
  if candidate.starts_with(&world) {
    Ok(())
  } else {
    Err(format!(
      "E2E path '{}' resolves outside the owned world",
      path.display()
    ))
  }
}

pub fn record_game_launch(program: &Path, uri: &str) -> Result<(), std::io::Error> {
  let Some(configuration) = current().e2e() else {
    return Ok(());
  };
  let artifacts = configuration.roots.world.join("artifacts");
  std::fs::create_dir_all(&artifacts)?;
  let mut journal = std::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(artifacts.join("game-launches.ndjson"))?;
  let record = serde_json::json!({
    "atUnixMs": std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap_or_default()
      .as_millis(),
    "program": program.to_string_lossy(),
    "uri": uri,
  });
  serde_json::to_writer(&mut journal, &record).map_err(std::io::Error::other)?;
  journal.write_all(b"\n")
}

pub fn configure_process() {
  let Some(configuration) = current().e2e() else {
    return;
  };

  // Startup calls this before Tauri or any application worker threads exist.
  // These process-local overrides keep Rust temporary files and WebView2 data
  // inside the disposable world inherited by child processes.
  unsafe {
    std::env::set_var("TMP", &configuration.roots.temporary);
    std::env::set_var("TEMP", &configuration.roots.temporary);
    #[cfg(target_os = "windows")]
    std::env::set_var(
      "WEBVIEW2_USER_DATA_FOLDER",
      &configuration.roots.webview_data,
    );
  }
}

pub fn apply_to_context(context: &mut tauri::Context<crate::app_runtime::AppRuntime>) {
  let Some(configuration) = current().e2e() else {
    return;
  };

  context.config_mut().identifier = configuration.application_identity.clone();
  context.config_mut().app.with_global_tauri = true;
  for window in &mut context.config_mut().app.windows {
    if window.label == "main" {
      window.width = configuration.ui.width as f64;
      window.height = configuration.ui.height as f64;
    }
  }
}

pub fn state_store_path() -> PathBuf {
  current()
    .e2e()
    .map(E2eConfiguration::state_store_path)
    .unwrap_or_else(|| PathBuf::from("state.json"))
}

pub fn app_local_data_dir(app_handle: &AppHandle) -> Result<PathBuf, tauri::Error> {
  match current().e2e() {
    Some(configuration) => Ok(configuration.roots.app_data.clone()),
    None => app_handle.path().app_local_data_dir(),
  }
}

pub fn app_log_dir(app_handle: &AppHandle) -> Result<PathBuf, tauri::Error> {
  match current().e2e() {
    Some(configuration) => Ok(configuration.roots.app_logs.clone()),
    None => app_handle.path().app_log_dir(),
  }
}

pub fn app_config_dir(identifier: &str) -> Option<PathBuf> {
  current()
    .e2e()
    .map(|configuration| configuration.roots.app_config.clone())
    .or_else(|| dirs::config_dir().map(|directory| directory.join(identifier)))
}

fn environment_from_process() -> Result<RuntimeEnvironment, RuntimeEnvironmentError> {
  let config_path = std::env::var_os(E2E_CONFIG_ENV).map(PathBuf::from);
  #[cfg(feature = "e2e-harness")]
  {
    let path = config_path.ok_or(RuntimeEnvironmentError::MissingConfiguration)?;
    return Ok(RuntimeEnvironment::E2e(E2eConfiguration::from_file(&path)?));
  }
  #[cfg(not(feature = "e2e-harness"))]
  {
    if config_path.is_some() {
      return Err(RuntimeEnvironmentError::UnsupportedConfiguration);
    }
    Ok(RuntimeEnvironment::Production)
  }
}

fn validate_id(name: &str, value: &str) -> Result<(), RuntimeEnvironmentError> {
  if value.is_empty()
    || value.len() > 80
    || !value
      .chars()
      .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
  {
    return invalid(format!(
      "{name} must contain 1-80 ASCII letters, digits, hyphens, or underscores"
    ));
  }
  Ok(())
}

fn canonical_directory(name: &str, path: &Path) -> Result<PathBuf, RuntimeEnvironmentError> {
  if !path.is_absolute() || !path.is_dir() {
    return invalid(format!("{name} must be an existing absolute directory"));
  }
  path.canonicalize().map_err(|error| {
    RuntimeEnvironmentError::InvalidConfiguration(format!("failed to resolve {name}: {error}"))
  })
}

fn canonical_file(name: &str, path: &Path) -> Result<PathBuf, RuntimeEnvironmentError> {
  if !path.is_absolute() || !path.is_file() {
    return invalid(format!("{name} must be an existing absolute file"));
  }
  path.canonicalize().map_err(|error| {
    RuntimeEnvironmentError::InvalidConfiguration(format!("failed to resolve {name}: {error}"))
  })
}

fn ensure_contained(
  name: &str,
  candidate: &Path,
  world: &Path,
) -> Result<(), RuntimeEnvironmentError> {
  if candidate == world || candidate.starts_with(world) {
    Ok(())
  } else {
    invalid(format!("{name} resolves outside roots.world"))
  }
}

fn validate_loopback_origin(origin: &str) -> Result<(), RuntimeEnvironmentError> {
  validate_loopback_url("service origin", origin, false)
}

fn validate_loopback_url(
  name: &str,
  value: &str,
  allow_path: bool,
) -> Result<(), RuntimeEnvironmentError> {
  let parsed = reqwest::Url::parse(value).map_err(|error| {
    RuntimeEnvironmentError::InvalidConfiguration(format!("invalid {name} '{value}': {error}"))
  })?;
  if !matches!(parsed.scheme(), "http" | "https")
    || (!allow_path && parsed.path() != "/")
    || parsed.query().is_some()
    || parsed.fragment().is_some()
    || !parsed.username().is_empty()
    || parsed.password().is_some()
    || !matches!(parsed.host_str(), Some("127.0.0.1" | "::1" | "localhost"))
  {
    return invalid(format!(
      "{name} '{value}' must be a loopback HTTP(S) URL without a query or fragment"
    ));
  }
  Ok(())
}

fn invalid<T>(message: impl Into<String>) -> Result<T, RuntimeEnvironmentError> {
  Err(RuntimeEnvironmentError::InvalidConfiguration(
    message.into(),
  ))
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;
  use tempfile::TempDir;

  struct TestWorld {
    _directory: TempDir,
    config_path: PathBuf,
  }

  fn test_world(mut mutate: impl FnMut(&mut serde_json::Value)) -> TestWorld {
    let directory = tempfile::tempdir().unwrap();
    let world = directory.path().join("world");
    let path_names = [
      "game",
      "steam",
      "steam-http-cache",
      "app-data",
      "app-config",
      "app-cache",
      "app-logs",
      "webview-data",
      "temporary",
    ];
    std::fs::create_dir_all(&world).unwrap();
    for path_name in path_names {
      std::fs::create_dir_all(world.join(path_name)).unwrap();
    }
    let token_file = world.join("control.token");
    std::fs::write(&token_file, "test-token").unwrap();
    let config_path = world.join("e2e-config.json");
    let endpoints = [
      "gamebanana",
      "downloads",
      "dmmApi",
      "auth",
      "deadlockApi",
      "assets",
    ]
    .into_iter()
    .map(|service| json!({ "service": service, "origin": "http://127.0.0.1:43199" }))
    .collect::<Vec<_>>();
    let mut configuration = json!({
      "schemaVersion": 1,
      "runId": "run-01",
      "caseId": "about-smoke",
      "attempt": 1,
      "applicationIdentity": "dev.stormix.deadlock-mod-manager.e2e.run-01",
      "roots": {
        "world": world,
        "game": world.join("game"),
        "steam": world.join("steam"),
        "steamHttpCache": world.join("steam-http-cache"),
        "appData": world.join("app-data"),
        "appConfig": world.join("app-config"),
        "appCache": world.join("app-cache"),
        "appLogs": world.join("app-logs"),
        "webviewData": world.join("webview-data"),
        "temporary": world.join("temporary")
      },
      "endpoints": endpoints,
      "networkMode": "fixture",
      "integrations": {
        "updater": "disabled",
        "steamDiscovery": "fixture",
        "gameLaunch": "record",
        "presence": "disabled",
        "ingestion": "disabled",
        "matchSync": "disabled"
      },
      "ui": { "language": "en", "width": 1280, "height": 800 },
      "control": { "endpoint": "http://127.0.0.1:43199/__control", "tokenFile": token_file }
    });
    mutate(&mut configuration);
    std::fs::write(
      &config_path,
      serde_json::to_vec_pretty(&configuration).unwrap(),
    )
    .unwrap();
    TestWorld {
      _directory: directory,
      config_path,
    }
  }

  #[test]
  fn valid_configuration_resolves_every_root_inside_world() {
    let world = test_world(|_| {});
    let configuration = E2eConfiguration::from_file(&world.config_path).unwrap();

    assert_eq!(configuration.schema_version, 1);
    assert!(configuration
      .state_store_path()
      .ends_with("app-data/state.json"));
    assert_eq!(
      configuration.endpoint(ServiceName::DmmApi),
      "http://127.0.0.1:43199"
    );
  }

  #[cfg(feature = "e2e-harness")]
  #[test]
  fn download_urls_must_match_a_configured_fixture_origin() {
    let world = test_world(|_| {});
    let configuration = E2eConfiguration::from_file(&world.config_path).unwrap();
    assert!(
      configuration.permits_download_url(
        &reqwest::Url::parse("http://127.0.0.1:43199/files/mod.vpk").unwrap()
      )
    );
    for value in [
      "http://127.0.0.1:43200/files/mod.vpk",
      "https://127.0.0.1:43199/files/mod.vpk",
      "http://user:password@127.0.0.1:43199/files/mod.vpk",
      "https://gamebanana.com/mod.vpk",
    ] {
      assert!(
        !configuration.permits_download_url(&reqwest::Url::parse(value).unwrap()),
        "accepted {value}"
      );
    }
  }

  #[test]
  fn root_outside_world_is_rejected() {
    let outside = tempfile::tempdir().unwrap();
    let world = test_world(|configuration| {
      configuration["roots"]["appLogs"] = json!(outside.path());
    });

    let error = E2eConfiguration::from_file(&world.config_path).unwrap_err();
    assert!(error
      .to_string()
      .contains("roots.appLogs resolves outside roots.world"));
  }

  #[test]
  fn duplicate_service_is_rejected() {
    let world = test_world(|configuration| {
      configuration["endpoints"][1]["service"] = json!("gamebanana");
    });

    let error = E2eConfiguration::from_file(&world.config_path).unwrap_err();
    assert!(error.to_string().contains("duplicate endpoint"));
  }

  #[test]
  fn non_loopback_service_is_rejected() {
    let world = test_world(|configuration| {
      configuration["endpoints"][0]["origin"] = json!("https://gamebanana.com");
    });

    let error = E2eConfiguration::from_file(&world.config_path).unwrap_err();
    assert!(error.to_string().contains("must be a loopback HTTP(S) URL"));
  }

  #[test]
  fn unsafe_e2e_policies_are_rejected() {
    let world = test_world(|configuration| {
      configuration["integrations"]["gameLaunch"] = json!("native");
    });

    let error = E2eConfiguration::from_file(&world.config_path).unwrap_err();
    assert!(error.to_string().contains("unknown variant `native`"));
  }

  #[test]
  fn configuration_file_outside_world_is_rejected() {
    let world = test_world(|_| {});
    let outside = tempfile::tempdir().unwrap();
    let outside_config = outside.path().join("e2e-config.json");
    std::fs::copy(&world.config_path, &outside_config).unwrap();

    let error = E2eConfiguration::from_file(&outside_config).unwrap_err();
    assert!(error
      .to_string()
      .contains("configuration file resolves outside roots.world"));
  }
}
