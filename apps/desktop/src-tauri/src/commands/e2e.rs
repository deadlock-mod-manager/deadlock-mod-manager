use serde::Serialize;

use crate::runtime_environment::{E2eRoots, FixtureOnly, ServiceEndpoint};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct E2eStatus {
  schema_version: u32,
  run_id: String,
  case_id: String,
  attempt: u32,
  application_identity: String,
  runtime: &'static str,
  process_id: u32,
  roots: E2eRoots,
  endpoints: Vec<ServiceEndpoint>,
  network_mode: FixtureOnly,
}

#[tauri::command]
pub fn e2e_status() -> Result<E2eStatus, String> {
  let configuration = crate::runtime_environment::current()
    .e2e()
    .ok_or_else(|| "E2E runtime is not active".to_string())?;

  Ok(E2eStatus {
    schema_version: configuration.schema_version,
    run_id: configuration.run_id.clone(),
    case_id: configuration.case_id.clone(),
    attempt: configuration.attempt,
    application_identity: configuration.application_identity.clone(),
    runtime: if cfg!(feature = "cef") { "cef" } else { "wry" },
    process_id: std::process::id(),
    roots: configuration.roots.clone(),
    endpoints: configuration.endpoints.clone(),
    network_mode: configuration.network_mode,
  })
}
