use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerPickerRelay {
  pub address: String,
  pub port_start: u16,
  pub port_end: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ServerPickerLocation {
  pub id: String,
  pub name: String,
  pub region: String,
  pub country_code: Option<String>,
  pub relays: Vec<ServerPickerRelay>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ServerPickerCatalog {
  pub revision: String,
  #[ts(type = "number")]
  pub fetched_at: u64,
  pub locations: Vec<ServerPickerLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ServerPickerCapability {
  pub supported: bool,
  pub reason: Option<String>,
  pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ServerPickerPreset {
  pub id: String,
  pub name: String,
  pub blocked_locations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ServerPickerLatency {
  pub location_id: String,
  pub latency_ms: Option<f64>,
  #[ts(type = "number")]
  pub measured_at: u64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ServerPickerState {
  pub catalog: Option<ServerPickerCatalog>,
  pub capability: ServerPickerCapability,
  pub blocked_locations: Vec<String>,
  pub observed_blocked_locations: Vec<String>,
  pub observation_known: bool,
  pub has_restrictions: bool,
  pub presets: Vec<ServerPickerPreset>,
  pub latencies: Vec<ServerPickerLatency>,
  pub rules_match: bool,
  pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct FirewallRule {
  pub location_id: String,
  pub address: String,
  pub port_start: u16,
  pub port_end: u16,
}
