use crate::errors::Error;
use serde::Serialize;
use std::time::Duration;
use ts_rs::TS;

/// Windows' TCP receive-window auto-tuning level (`MSFT_NetTCPSetting.AutoTuningLevelLocal`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum TcpAutoTuningLevel {
  Disabled,
  HighlyRestricted,
  Restricted,
  Normal,
  Experimental,
}

fn autotuning_level(value: u32) -> Option<TcpAutoTuningLevel> {
  match value {
    0 => Some(TcpAutoTuningLevel::Disabled),
    1 => Some(TcpAutoTuningLevel::HighlyRestricted),
    2 => Some(TcpAutoTuningLevel::Restricted),
    3 => Some(TcpAutoTuningLevel::Normal),
    4 => Some(TcpAutoTuningLevel::Experimental),
    _ => None,
  }
}

const AUTO_TUNING_READ_LIMIT: Duration = Duration::from_secs(10);

/// Reads the setting and never changes it. `None` off Windows, or when it
/// can't be read in time, which the diagnostics treat as nothing to show.
#[tauri::command]
pub async fn get_tcp_autotuning_level() -> Result<Option<TcpAutoTuningLevel>, Error> {
  let read = tokio::task::spawn_blocking(read_autotuning_value);
  let value = match tokio::time::timeout(AUTO_TUNING_READ_LIMIT, read).await {
    Ok(joined) => joined.map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?,
    Err(_) => Err("WMI did not answer in time".to_string()),
  };
  Ok(match value {
    Ok(value) => value.and_then(autotuning_level),
    Err(error) => {
      log::warn!("Could not read the TCP auto-tuning level: {error}");
      None
    }
  })
}

fn read_autotuning_value() -> Result<Option<u32>, String> {
  // E2E worlds never read the host's setting; a case injects the CIM value.
  #[cfg(feature = "e2e-harness")]
  if let Some(configuration) = crate::runtime_environment::current().e2e() {
    let injected = configuration
      .roots
      .world
      .join("fixtures")
      .join("tcp-autotuning-level");
    return match std::fs::read_to_string(injected) {
      Ok(value) => value
        .trim()
        .parse()
        .map(Some)
        .map_err(|error| format!("invalid injected level: {error}")),
      Err(_) => Ok(None),
    };
  }
  read_cim_autotuning_value()
}

#[cfg(windows)]
fn read_cim_autotuning_value() -> Result<Option<u32>, String> {
  use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
    CoSetProxyBlanket, CoUninitialize, EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL,
    RPC_C_IMP_LEVEL_IMPERSONATE,
  };
  use windows::Win32::System::Wmi::{
    IWbemClassObject, IWbemLocator, WBEM_FLAG_FORWARD_ONLY, WBEM_FLAG_RETURN_IMMEDIATELY,
    WBEM_GENERIC_FLAG_TYPE, WbemLocator,
  };
  use windows::core::{BSTR, VARIANT, w};

  let query = || -> windows::core::Result<Option<u32>> {
    // SAFETY: plain COM calls on interfaces this closure owns; nothing outlives it.
    unsafe {
      let locator: IWbemLocator = CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER)?;
      let services = locator.ConnectServer(
        &BSTR::from("ROOT\\StandardCimv2"),
        &BSTR::new(),
        &BSTR::new(),
        &BSTR::new(),
        0,
        &BSTR::new(),
        None,
      )?;
      // Without impersonation the provider refuses the query (WBEM_E_ACCESS_DENIED).
      // 10 and 0 are RPC_C_AUTHN_WINNT and RPC_C_AUTHZ_NONE.
      CoSetProxyBlanket(
        &services,
        10,
        0,
        None,
        RPC_C_AUTHN_LEVEL_CALL,
        RPC_C_IMP_LEVEL_IMPERSONATE,
        None,
        EOAC_NONE,
      )?;
      let rows = services.ExecQuery(
        &BSTR::from("WQL"),
        &BSTR::from(
          "SELECT AutoTuningLevelLocal FROM MSFT_NetTCPSetting WHERE SettingName = 'Internet'",
        ),
        WBEM_GENERIC_FLAG_TYPE(WBEM_FLAG_FORWARD_ONLY.0 | WBEM_FLAG_RETURN_IMMEDIATELY.0),
        None,
      )?;
      let mut row: [Option<IWbemClassObject>; 1] = [None];
      let mut returned = 0;
      // In milliseconds; no row by then reads as no setting.
      rows.Next(5_000, &mut row, &mut returned).ok()?;
      let Some(row) = row[0].take() else {
        return Ok(None);
      };
      let mut value = VARIANT::default();
      row.Get(w!("AutoTuningLevelLocal"), 0, &mut value, None, None)?;
      Ok(u32::try_from(&value).ok())
    }
  };

  // SAFETY: initialization is balanced below, on the same blocking thread.
  let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
  let result = query().map_err(|error| error.to_string());
  if initialized {
    unsafe { CoUninitialize() };
  }
  result
}

#[cfg(not(windows))]
fn read_cim_autotuning_value() -> Result<Option<u32>, String> {
  Ok(None)
}

#[cfg(test)]
mod tests {
  use super::*;

  // Reads this machine's real setting, read-only: `cargo test -- --ignored`.
  #[cfg(windows)]
  #[test]
  #[ignore = "reads the host's TCP settings"]
  fn reads_the_hosts_autotuning_level() {
    let value = read_cim_autotuning_value().unwrap();
    assert!(value.and_then(autotuning_level).is_some(), "{value:?}");
  }

  #[test]
  fn maps_every_cim_autotuning_level() {
    use TcpAutoTuningLevel::*;
    assert_eq!(
      (0..=5).map(autotuning_level).collect::<Vec<_>>(),
      vec![
        Some(Disabled),
        Some(HighlyRestricted),
        Some(Restricted),
        Some(Normal),
        Some(Experimental),
        None,
      ]
    );
  }
}
