use std::{collections::BTreeMap, path::Path};

use windows::{
  Win32::{
    Foundation::{CloseHandle, HANDLE, VARIANT_TRUE, WAIT_ABANDONED, WAIT_OBJECT_0},
    NetworkManagement::WindowsFirewall::{
      INetFwPolicy2, INetFwRule, INetFwRules, NET_FW_ACTION_BLOCK, NET_FW_IP_PROTOCOL_UDP,
      NET_FW_PROFILE_TYPE2, NET_FW_PROFILE2_ALL, NET_FW_RULE_DIR_OUT, NetFwPolicy2, NetFwRule,
    },
    System::{
      Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
        CoUninitialize,
      },
      Ole::IEnumVARIANT,
      Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject},
      Variant::VT_DISPATCH,
    },
  },
  core::{BSTR, IUnknown, Interface, VARIANT, w},
};

use super::{RULE_PREFIX, parse_rule_name, rule_name};
use crate::{PickerError, types::FirewallRule};

const GROUP: &str = "Deadlock Mod Manager Server Picker";

struct MutationLock(HANDLE);
impl MutationLock {
  fn acquire() -> Result<Self, PickerError> {
    unsafe {
      let handle =
        CreateMutexW(None, false, w!("Global\\DMM.ServerPicker.Mutation.v1")).map_err(map_error)?;
      let status = WaitForSingleObject(handle, 0);
      if status != WAIT_OBJECT_0 && status != WAIT_ABANDONED {
        let _ = CloseHandle(handle);
        return Err(PickerError::Firewall(
          "Another Server Picker firewall operation is in progress.".into(),
        ));
      }
      Ok(Self(handle))
    }
  }
}
impl Drop for MutationLock {
  fn drop(&mut self) {
    unsafe {
      let _ = ReleaseMutex(self.0);
      let _ = CloseHandle(self.0);
    }
  }
}

struct Apartment;
impl Apartment {
  fn new() -> windows::core::Result<Self> {
    // Interfaces stay on the operation's blocking thread.
    unsafe {
      CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
    }
    Ok(Self)
  }
}
impl Drop for Apartment {
  fn drop(&mut self) {
    unsafe {
      CoUninitialize();
    }
  }
}

fn map_error(error: windows::core::Error) -> PickerError {
  PickerError::Firewall(error.to_string())
}

fn policy() -> windows::core::Result<INetFwPolicy2> {
  unsafe { CoCreateInstance(&NetFwPolicy2, None, CLSCTX_INPROC_SERVER) }
}

fn rule_from_variant(value: &VARIANT) -> windows::core::Result<INetFwRule> {
  // INetFwRules enumerates VT_DISPATCH values. IUnknown::try_from only accepts
  // VT_UNKNOWN; borrow the dispatch's IUnknown base while the VARIANT owns it.
  unsafe {
    let raw = value.as_raw().Anonymous.Anonymous;
    if raw.vt == VT_DISPATCH.0 {
      return IUnknown::from_raw_borrowed(&raw.Anonymous.pdispVal)
        .ok_or_else(|| windows::core::Error::from_hresult(windows::Win32::Foundation::E_POINTER))?
        .cast();
    }
  }
  IUnknown::try_from(value)?.cast()
}

fn collect_owned(rules: &INetFwRules) -> windows::core::Result<Vec<(String, INetFwRule)>> {
  let mut owned = Vec::new();
  unsafe {
    let enumeration: IEnumVARIANT = rules._NewEnum()?.cast()?;
    loop {
      let mut item = [VARIANT::default()];
      let mut fetched = 0;
      enumeration.Next(&mut item, &mut fetched).ok()?;
      if fetched == 0 {
        break;
      }
      let rule = rule_from_variant(&item[0])?;
      let name = rule.Name()?.to_string();
      if name.starts_with(RULE_PREFIX) && rule.Grouping()? == GROUP {
        owned.push((name, rule));
      }
    }
  }
  Ok(owned)
}

fn owned_rules(rules: &INetFwRules) -> windows::core::Result<BTreeMap<String, INetFwRule>> {
  let mut owned = BTreeMap::new();
  for (name, rule) in collect_owned(rules)? {
    if owned.insert(name, rule).is_some() {
      return Err(windows::core::Error::new(
        windows::Win32::Foundation::E_UNEXPECTED,
        "Duplicate owned firewall rules. Restore default routing before applying.",
      ));
    }
  }
  Ok(owned)
}

fn matches(
  rule: &INetFwRule,
  expected: &FirewallRule,
  executable: Option<&str>,
) -> windows::core::Result<bool> {
  unsafe {
    let address = rule.RemoteAddresses()?.to_string();
    let app = rule.ApplicationName()?.to_string();
    Ok(
      rule.Enabled()?.as_bool()
        && rule.Direction()? == NET_FW_RULE_DIR_OUT
        && rule.Action()? == NET_FW_ACTION_BLOCK
        && rule.Protocol()? == NET_FW_IP_PROTOCOL_UDP.0
        && rule.Profiles()? == NET_FW_PROFILE2_ALL.0
        && (address == expected.address
          || address == format!("{}/255.255.255.255", expected.address)
          || address == format!("{}/32", expected.address))
        && rule.RemotePorts()? == remote_ports(expected)
        && crate::helper::is_deadlock_executable_path(Path::new(&app))
        && Path::new(&app).is_file()
        && executable.is_none_or(|path| app.eq_ignore_ascii_case(path)),
    )
  }
}

fn remote_ports(rule: &FirewallRule) -> String {
  if rule.port_start == rule.port_end {
    rule.port_start.to_string()
  } else {
    format!("{}-{}", rule.port_start, rule.port_end)
  }
}

fn inspect(policy: &INetFwPolicy2) -> Result<Vec<FirewallRule>, PickerError> {
  let owned = owned_rules(&unsafe { policy.Rules() }.map_err(map_error)?).map_err(map_error)?;
  if !owned.is_empty() {
    unsafe {
      let active = policy.CurrentProfileTypes().map_err(map_error)?;
      for profile in [1, 2, 4] {
        if active & profile != 0
          && !policy
            .get_FirewallEnabled(NET_FW_PROFILE_TYPE2(profile))
            .map_err(map_error)?
            .as_bool()
        {
          return Err(PickerError::Firewall("Windows Firewall is disabled for an active network profile; relay restrictions are not enforced.".into()));
        }
      }
    }
  }
  let mut observed = Vec::new();
  for (name, rule) in owned {
    let Some(expected) = parse_rule_name(&name) else {
      return Err(PickerError::Firewall(
        "An owned firewall rule was modified. Apply or restore to repair it.".into(),
      ));
    };
    if !matches(&rule, &expected, None).map_err(map_error)? {
      return Err(PickerError::Firewall(
        "An owned firewall rule is disabled or was modified. Apply or restore to repair it.".into(),
      ));
    }
    observed.push(expected);
  }
  observed.sort();
  Ok(observed)
}

pub(super) fn observe() -> Result<Vec<FirewallRule>, PickerError> {
  let _apartment = Apartment::new().map_err(map_error)?;
  inspect(&policy().map_err(map_error)?)
}

fn build_rule(rule: &FirewallRule, executable: &str) -> windows::core::Result<INetFwRule> {
  unsafe {
    let native: INetFwRule = CoCreateInstance(&NetFwRule, None, CLSCTX_INPROC_SERVER)?;
    native.SetName(&BSTR::from(rule_name(rule)))?;
    native.SetGrouping(&BSTR::from(GROUP))?;
    native.SetDescription(&BSTR::from("Deadlock relay restriction managed by Deadlock Mod Manager. Restore default routing in Server Picker to remove."))?;
    native.SetApplicationName(&BSTR::from(executable))?;
    native.SetProtocol(NET_FW_IP_PROTOCOL_UDP.0)?;
    native.SetRemoteAddresses(&BSTR::from(&rule.address))?;
    native.SetRemotePorts(&BSTR::from(remote_ports(rule)))?;
    native.SetDirection(NET_FW_RULE_DIR_OUT)?;
    native.SetAction(NET_FW_ACTION_BLOCK)?;
    native.SetProfiles(NET_FW_PROFILE2_ALL.0)?;
    native.SetEnabled(VARIANT_TRUE)?;
    Ok(native)
  }
}

pub(super) fn apply(
  desired: &[FirewallRule],
  executable: Option<&Path>,
) -> Result<Vec<FirewallRule>, PickerError> {
  let _lock = MutationLock::acquire()?;
  let _apartment = Apartment::new().map_err(map_error)?;
  let policy = policy().map_err(map_error)?;
  let rules = unsafe { policy.Rules() }.map_err(map_error)?;
  if desired.is_empty() {
    // Enumerate after each pass: Windows permits duplicate display names,
    // and recovery must still remove them without relying on the catalog.
    let mut remaining = collect_owned(&rules).map_err(map_error)?;
    while !remaining.is_empty() {
      let count = remaining.len();
      let names: std::collections::BTreeSet<_> =
        remaining.into_iter().map(|(name, _)| name).collect();
      for name in names {
        unsafe {
          rules.Remove(&BSTR::from(name)).map_err(map_error)?;
        }
      }
      remaining = collect_owned(&rules).map_err(map_error)?;
      if remaining.len() >= count {
        return Err(PickerError::Firewall(
          "Some owned rules could not be removed. Restore default routing again.".into(),
        ));
      }
    }
    return Ok(Vec::new());
  }
  let before = owned_rules(&rules).map_err(map_error)?;
  // Firewall application matching expects an ordinary absolute path.
  let Some(executable) = executable.map(|path| {
    path
      .to_string_lossy()
      .trim_start_matches(r"\\?\")
      .to_owned()
  }) else {
    return Err(PickerError::Validation(
      "Deadlock executable is required".into(),
    ));
  };
  let wanted: BTreeMap<_, _> = desired.iter().map(|rule| (rule_name(rule), rule)).collect();
  let mut remove = Vec::new();
  let mut add = Vec::new();
  for (name, existing) in &before {
    if !wanted
      .get(name)
      .is_some_and(|desired| matches(existing, desired, Some(executable.as_str())).unwrap_or(false))
    {
      remove.push(name.clone());
    }
  }
  for (name, desired) in &wanted {
    if !before.contains_key(name) || remove.contains(name) {
      if !before.contains_key(name) && unsafe { rules.Item(&BSTR::from(name)) }.is_ok() {
        return Err(PickerError::Firewall(
          "A relay rule name is already used by another firewall owner; no rules were changed."
            .into(),
        ));
      }
      add.push((
        name.clone(),
        build_rule(desired, &executable).map_err(map_error)?,
      ));
    }
  }
  if remove.is_empty() && add.is_empty() {
    return inspect(&policy);
  }
  let mut removed = Vec::new();
  let mut added = Vec::new();
  let outcome = (|| -> Result<Vec<FirewallRule>, PickerError> {
    for name in &remove {
      unsafe {
        rules.Remove(&BSTR::from(name)).map_err(map_error)?;
      }
      removed.push(name);
    }
    for (name, rule) in &add {
      unsafe {
        rules.Add(rule).map_err(map_error)?;
      }
      added.push(name);
    }
    let observed = inspect(&policy)?;
    let mut expected = desired.to_vec();
    expected.sort();
    if observed != expected {
      return Err(PickerError::Firewall(
        "Firewall rules changed during verification".into(),
      ));
    }
    Ok(observed)
  })();
  outcome.map_err(|error| {
    let mut rollback_failed = false;
    for name in added {
      rollback_failed |= unsafe { rules.Remove(&BSTR::from(name)) }.is_err();
    }
    for name in removed {
      if let Some(rule) = before.get(name) {
        rollback_failed |= unsafe { rules.Add(rule) }.is_err();
      }
    }
    PickerError::Firewall(format!(
      "{error}. {}",
      if rollback_failed {
        "Rollback was incomplete. Restore default routing to remove remaining DMM rules."
      } else {
        "The previous rules were restored."
      }
    ))
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_dispatch_variants_returned_by_firewall_enumeration() {
    let _apartment = Apartment::new().unwrap();
    let native: INetFwRule =
      unsafe { CoCreateInstance(&NetFwRule, None, CLSCTX_INPROC_SERVER).unwrap() };
    let dispatch: windows::Win32::System::Com::IDispatch = native.cast().unwrap();
    let variant = unsafe {
      let mut raw = *VARIANT::default().as_raw();
      raw.Anonymous.Anonymous.vt = VT_DISPATCH.0;
      raw.Anonymous.Anonymous.Anonymous.pdispVal = dispatch.into_raw();
      VARIANT::from_raw(raw)
    };
    assert!(IUnknown::try_from(&variant).is_err());
    assert!(rule_from_variant(&variant).is_ok());
    assert!(rule_from_variant(&VARIANT::from(BSTR::from("not a firewall rule"))).is_err());
  }

  #[test]
  fn unsaved_native_rule_checks_destination_application_and_enabled_state() {
    let _apartment = Apartment::new().unwrap();
    let directory = tempfile::tempdir().unwrap();
    let executable = directory.path().join("game/bin/win64/deadlock.exe");
    std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
    std::fs::write(&executable, []).unwrap();
    let expected = FirewallRule {
      location_id: "fra".into(),
      address: "155.133.230.1".into(),
      port_start: 27015,
      port_end: 27050,
    };
    // Creating an unattached COM rule does not add it to the firewall.
    let native = build_rule(&expected, &executable.to_string_lossy()).unwrap();
    assert!(matches(&native, &expected, Some(&executable.to_string_lossy())).unwrap());
    let mut other_endpoint = expected.clone();
    other_endpoint.address = "155.133.230.2".into();
    assert!(!matches(&native, &other_endpoint, None).unwrap());
    unsafe {
      native
        .SetEnabled(windows::Win32::Foundation::VARIANT_FALSE)
        .unwrap();
    }
    assert!(!matches(&native, &expected, None).unwrap());
    unsafe {
      native.SetEnabled(VARIANT_TRUE).unwrap();
      native
        .SetApplicationName(&BSTR::from(
          directory
            .path()
            .join("steam.exe")
            .to_string_lossy()
            .as_ref(),
        ))
        .unwrap();
    }
    assert!(!matches(&native, &expected, None).unwrap());
  }
}
