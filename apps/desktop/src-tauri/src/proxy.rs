use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
  pub enabled: bool,
  pub protocol: ProxyProtocol,
  pub host: String,
  pub port: u16,
  pub auth_enabled: bool,
  pub username: String,
  pub password: String,
  pub no_proxy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProxyProtocol {
  Http,
  Https,
  Socks5,
}

impl ProxyProtocol {
  fn scheme(&self) -> &str {
    match self {
      ProxyProtocol::Http => "http",
      ProxyProtocol::Https => "https",
      ProxyProtocol::Socks5 => "socks5",
    }
  }
}

static PROXY_CONFIG: Mutex<Option<ProxyConfig>> = Mutex::new(None);

fn get_proxy_url(config: &ProxyConfig) -> String {
  format!("{}://{}:{}", config.protocol.scheme(), config.host, config.port)
}

fn apply_proxy(
  builder: reqwest::ClientBuilder,
  config: &ProxyConfig,
) -> Result<reqwest::ClientBuilder, Error> {
  let proxy_url = get_proxy_url(config);
  let mut proxy = reqwest::Proxy::all(&proxy_url)
    .map_err(|e| Error::Network(format!("Invalid proxy URL {proxy_url}: {e}")))?;

  if config.auth_enabled && !config.username.is_empty() {
    proxy = proxy.basic_auth(&config.username, &config.password);
  }

  if !config.no_proxy.is_empty() {
    proxy = proxy.no_proxy(reqwest::NoProxy::from_string(&config.no_proxy));
  }

  Ok(builder.proxy(proxy))
}

pub fn build_http_client<F>(configure: F) -> Result<reqwest::Client, Error>
where
  F: FnOnce(reqwest::ClientBuilder) -> reqwest::ClientBuilder,
{
  let config = PROXY_CONFIG
    .lock()
    .map_err(|e| Error::Network(format!("Failed to acquire proxy config lock: {e}")))?;

  let mut builder = reqwest::Client::builder();

  if let Some(ref cfg) = *config {
    if cfg.enabled && !cfg.host.is_empty() && cfg.port > 0 {
      builder = apply_proxy(builder, cfg)?;
    }
  }

  builder = configure(builder);

  builder
    .build()
    .map_err(|e| Error::Network(format!("Failed to build HTTP client: {e}")))
}

pub fn build_default_http_client() -> Result<reqwest::Client, Error> {
  build_http_client(|b| b)
}

#[tauri::command]
pub async fn set_proxy_config(config: Option<ProxyConfig>) -> Result<(), Error> {
  log::info!("Updating proxy configuration: {config:?}");
  let mut proxy = PROXY_CONFIG
    .lock()
    .map_err(|e| Error::Network(format!("Failed to acquire proxy config lock: {e}")))?;
  *proxy = config;
  Ok(())
}

#[tauri::command]
pub async fn get_proxy_config() -> Result<Option<ProxyConfig>, Error> {
  let proxy = PROXY_CONFIG
    .lock()
    .map_err(|e| Error::Network(format!("Failed to acquire proxy config lock: {e}")))?;
  Ok(proxy.clone())
}

#[tauri::command]
pub async fn test_proxy_connection(config: ProxyConfig) -> Result<String, Error> {
  let proxy_url = get_proxy_url(&config);
  log::info!("Testing proxy connection to {proxy_url}");

  let mut builder = reqwest::Client::builder()
    .connect_timeout(std::time::Duration::from_secs(10))
    .timeout(std::time::Duration::from_secs(15));

  builder = apply_proxy(builder, &config)?;

  let client = builder
    .build()
    .map_err(|e| Error::Network(format!("Failed to build test HTTP client: {e}")))?;

  let start = std::time::Instant::now();
  let response = client
    .head("https://api.deadlockmods.app/health")
    .send()
    .await
    .map_err(|e| Error::Network(format!("Proxy connection test failed: {e}")))?;

  let latency_ms = start.elapsed().as_millis();
  let status = response.status();

  log::info!("Proxy test result: status={status}, latency={latency_ms}ms");
  Ok(format!("{latency_ms}ms"))
}
