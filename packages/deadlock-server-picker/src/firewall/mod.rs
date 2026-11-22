use std::{net::Ipv4Addr, path::PathBuf};

use crate::{
  PickerError,
  types::{FirewallRule, ServerPickerCapability},
};

// Compile the nftables planner tests on Windows too; they never invoke nft.
#[cfg(any(target_os = "linux", test))]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod linux;
#[cfg(windows)]
mod windows;

pub(crate) const RULE_PREFIX: &str = "DMM.ServerPicker.v1.";
pub(crate) const MAX_RULES: usize = 4096;

#[derive(Default)]
pub struct FirewallBackend;

impl FirewallBackend {
  pub fn new() -> Self {
    Self
  }

  pub fn capability(&self) -> ServerPickerCapability {
    #[cfg(windows)]
    return ServerPickerCapability {
      supported: true,
      reason: None,
      scope: "application".into(),
    };
    #[cfg(target_os = "linux")]
    return linux::capability();
    #[cfg(not(any(windows, target_os = "linux")))]
    ServerPickerCapability {
      supported: false,
      reason: Some("Server Picker supports Windows and Linux.".into()),
      scope: "unsupported".into(),
    }
  }

  pub async fn observe(&self) -> Result<Vec<FirewallRule>, PickerError> {
    #[cfg(windows)]
    return tokio::task::spawn_blocking(windows::observe)
      .await
      .map_err(|error| PickerError::Firewall(error.to_string()))?;
    #[cfg(target_os = "linux")]
        return Err(PickerError::Firewall("Reading Linux firewall state requires authorization. Apply or restore to verify the current rules.".into()));
    #[cfg(not(any(windows, target_os = "linux")))]
    Err(PickerError::Firewall("Unsupported platform".into()))
  }

  pub async fn apply(
    &self,
    mut rules: Vec<FirewallRule>,
    game_executable: PathBuf,
  ) -> Result<Vec<FirewallRule>, PickerError> {
    normalize(&mut rules)?;
    crate::helper::execute(crate::helper::Request::Apply {
      rules,
      game_executable,
    })
    .await
  }

  pub async fn reset(&self) -> Result<Vec<FirewallRule>, PickerError> {
    crate::helper::execute(crate::helper::Request::Reset {}).await
  }
}

pub(crate) fn normalize(rules: &mut Vec<FirewallRule>) -> Result<(), PickerError> {
  if rules.len() > MAX_RULES {
    return Err(PickerError::Validation("Too many relay rules".into()));
  }
  for rule in rules.iter() {
    let address: Ipv4Addr = rule
      .address
      .parse()
      .map_err(|_| PickerError::Validation("Invalid relay address".into()))?;
    let first = address.octets()[0];
    if address.is_private()
      || address.is_loopback()
      || address.is_link_local()
      || address.is_broadcast()
      || first == 0
      || first >= 224
      || rule.port_start == 0
      || rule.port_start > rule.port_end
      || !crate::catalog::valid_location_id(&rule.location_id)
    {
      return Err(PickerError::Validation("Invalid public relay rule".into()));
    }
    if rule.address != address.to_string() {
      return Err(PickerError::Validation(
        "Relay address must be canonical".into(),
      ));
    }
  }
  rules.sort();
  rules.dedup();
  Ok(())
}

pub(crate) fn rule_name(rule: &FirewallRule) -> String {
  format!(
    "{RULE_PREFIX}{}.{}.{}-{}",
    rule.location_id, rule.address, rule.port_start, rule.port_end
  )
}

pub(crate) fn parse_rule_name(name: &str) -> Option<FirewallRule> {
  let rest = name.strip_prefix(RULE_PREFIX)?;
  let (location_id, endpoint) = rest.split_once('.')?;
  let (address, ports) = endpoint.rsplit_once('.')?;
  let (start, end) = ports.split_once('-')?;
  let mut rules = vec![FirewallRule {
    location_id: location_id.into(),
    address: address.into(),
    port_start: start.parse().ok()?,
    port_end: end.parse().ok()?,
  }];
  normalize(&mut rules).ok()?;
  rules.pop()
}

pub(crate) fn apply_privileged(
  rules: &[FirewallRule],
  game_executable: Option<&std::path::Path>,
) -> Result<Vec<FirewallRule>, PickerError> {
  #[cfg(windows)]
  return windows::apply(rules, game_executable);
  #[cfg(target_os = "linux")]
  {
    let _ = game_executable;
    linux::apply(rules)
  }
  #[cfg(not(any(windows, target_os = "linux")))]
  {
    let _ = (rules, game_executable);
    Err(PickerError::Firewall("Unsupported platform".into()))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  fn rule() -> FirewallRule {
    FirewallRule {
      location_id: "fra".into(),
      address: "155.133.230.1".into(),
      port_start: 27015,
      port_end: 27050,
    }
  }

  #[test]
  fn rejects_local_addresses_and_injected_metadata() {
    for address in [
      "127.0.0.1",
      "10.0.0.1",
      "192.168.1.1",
      "169.254.1.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "1.1.1.1; flush ruleset",
    ] {
      let mut item = rule();
      item.address = address.into();
      assert!(normalize(&mut vec![item]).is_err(), "{address}");
    }
    let mut item = rule();
    item.location_id = "x\nflush ruleset".into();
    assert!(normalize(&mut vec![item]).is_err());
  }

  #[test]
  fn duplicate_selection_has_one_rule_and_owned_names_round_trip() {
    let item = rule();
    let mut rules = vec![item.clone(), item.clone()];
    normalize(&mut rules).unwrap();
    assert_eq!(rules, vec![item.clone()]);
    assert_eq!(parse_rule_name(&rule_name(&item)), Some(item));
    assert!(parse_rule_name("unrelated firewall rule").is_none());
  }
}
