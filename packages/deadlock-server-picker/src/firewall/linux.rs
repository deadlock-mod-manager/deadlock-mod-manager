use std::{
  collections::BTreeMap,
  io::Write,
  path::{Path, PathBuf},
  process::{Command, Stdio},
};

use serde_json::{Value, json};

use super::{parse_rule_name, rule_name};
use crate::{
  PickerError,
  types::{FirewallRule, ServerPickerCapability},
};

const TABLE: &str = "dmm_server_picker";
const OWNER: &str = "Deadlock Mod Manager Server Picker v1";

fn nft_path() -> Option<PathBuf> {
  ["/usr/sbin/nft", "/sbin/nft", "/usr/bin/nft"]
    .into_iter()
    .map(PathBuf::from)
    .find(|path| path.is_file())
}

pub(super) fn capability() -> ServerPickerCapability {
  let reason = if std::env::var_os("FLATPAK_ID").is_some() || Path::new("/.flatpak-info").exists() {
    Some("Server Picker is unavailable inside Flatpak.".into())
  } else if !Path::new("/usr/bin/pkexec").is_file() {
    Some("Server Picker requires polkit (pkexec) for firewall authorization.".into())
  } else if nft_path().is_none() {
    Some("Server Picker requires nftables (nft).".into())
  } else {
    None
  };
  ServerPickerCapability {
    supported: reason.is_none(),
    reason,
    scope: "system".into(),
  }
}

fn query(binary: &Path, arguments: &[&str]) -> Result<Value, PickerError> {
  let output = Command::new(binary)
    .args(arguments)
    .env_clear()
    .env("LC_ALL", "C")
    .output()?;
  if !output.status.success() {
    return Err(PickerError::Firewall(format!(
      "Could not inspect nftables: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    )));
  }
  serde_json::from_slice(&output.stdout)
    .map_err(|error| PickerError::Firewall(format!("Invalid nftables response: {error}")))
}

fn table(binary: &Path) -> Result<Option<Value>, PickerError> {
  let tables = query(binary, &["-j", "list", "tables"])?;
  let exists = entries(&tables)?.iter().any(|item| {
    item.get("table").is_some_and(|table| {
      table.get("family").and_then(Value::as_str) == Some("inet")
        && table.get("name").and_then(Value::as_str) == Some(TABLE)
    })
  });
  if !exists {
    return Ok(None);
  }
  let result = query(binary, &["-j", "list", "table", "inet", TABLE])?;
  let owned = entries(&result)?.iter().any(|item| {
    item
      .get("table")
      .is_some_and(|table| table.get("comment").and_then(Value::as_str) == Some(OWNER))
  });
  if !owned {
    return Err(PickerError::Firewall("The Server Picker nftables table name is already used by another owner; no rules were changed.".into()));
  }
  Ok(Some(result))
}

fn entries(value: &Value) -> Result<&Vec<Value>, PickerError> {
  value
    .get("nftables")
    .and_then(Value::as_array)
    .ok_or_else(|| PickerError::Firewall("Missing nftables entries".into()))
}

fn expressions(rule: &FirewallRule) -> Value {
  let ports = if rule.port_start == rule.port_end {
    json!(rule.port_start)
  } else {
    json!({"range": [rule.port_start, rule.port_end]})
  };
  json!([
      {"match": {"op": "==", "left": {"payload": {"protocol": "ip", "field": "daddr"}}, "right": rule.address}},
      {"match": {"op": "==", "left": {"payload": {"protocol": "udp", "field": "dport"}}, "right": ports}},
      {"drop": null}
  ])
}

fn inspect(value: &Value) -> Result<BTreeMap<FirewallRule, u64>, PickerError> {
  let entries = entries(value)?;
  let chains: Vec<_> = entries
    .iter()
    .filter_map(|item| item.get("chain"))
    .collect();
  if chains.len() != 1
    || chains[0].get("name").and_then(Value::as_str) != Some("output")
    || chains[0].get("hook").and_then(Value::as_str) != Some("output")
    || chains[0].get("type").and_then(Value::as_str) != Some("filter")
    || chains[0].get("policy").and_then(Value::as_str) != Some("accept")
    || chains[0].get("prio").and_then(Value::as_i64) != Some(-10)
  {
    return Err(PickerError::Firewall(
      "Server Picker's firewall chain was modified. Restore default routing before applying."
        .into(),
    ));
  }
  let mut observed = BTreeMap::new();
  for native in entries.iter().filter_map(|item| item.get("rule")) {
    let rule = native.get("comment").and_then(Value::as_str).and_then(parse_rule_name)
            .ok_or_else(|| PickerError::Firewall("An unrecognized rule exists in Server Picker's table. Restore default routing before applying.".into()))?;
    if native.get("chain").and_then(Value::as_str) != Some("output")
      || native.get("expr") != Some(&expressions(&rule))
    {
      return Err(PickerError::Firewall(
        "A Server Picker firewall rule was modified. Restore default routing before applying."
          .into(),
      ));
    }
    let handle = native
      .get("handle")
      .and_then(Value::as_u64)
      .ok_or_else(|| PickerError::Firewall("Missing nftables rule handle".into()))?;
    if observed.insert(rule, handle).is_some() {
      return Err(PickerError::Firewall(
        "Duplicate Server Picker rules. Restore default routing before applying.".into(),
      ));
    }
  }
  Ok(observed)
}

fn transaction(existing: Option<&Value>, desired: &[FirewallRule]) -> Result<String, PickerError> {
  if desired.is_empty() {
    return Ok(if existing.is_some() {
      format!("delete table inet {TABLE}\n")
    } else {
      String::new()
    });
  }
  let before = existing.map(inspect).transpose()?.unwrap_or_default();
  let mut script = String::new();
  if existing.is_none() {
    script.push_str(&format!("add table inet {TABLE} {{ comment \"{OWNER}\"; }}\nadd chain inet {TABLE} output {{ type filter hook output priority -10; policy accept; }}\n"));
  }
  for (rule, handle) in &before {
    if !desired.contains(rule) {
      script.push_str(&format!(
        "delete rule inet {TABLE} output handle {handle}\n"
      ));
    }
  }
  for rule in desired {
    if !before.contains_key(rule) {
      let ports = if rule.port_start == rule.port_end {
        rule.port_start.to_string()
      } else {
        format!("{}-{}", rule.port_start, rule.port_end)
      };
      script.push_str(&format!(
        "add rule inet {TABLE} output ip daddr {} udp dport {ports} drop comment \"{}\"\n",
        rule.address,
        rule_name(rule)
      ));
    }
  }
  Ok(script)
}

pub(super) fn apply(desired: &[FirewallRule]) -> Result<Vec<FirewallRule>, PickerError> {
  let binary =
    nft_path().ok_or_else(|| PickerError::Firewall("nftables is not installed".into()))?;
  let existing = table(&binary)?;
  let script = transaction(existing.as_ref(), desired)?;
  if !script.is_empty() {
    // nft submits one atomic kernel transaction: failures preserve prior rules.
    let mut child = Command::new(&binary)
      .args(["-f", "-"])
      .env_clear()
      .env("LC_ALL", "C")
      .stdin(Stdio::piped())
      .stdout(Stdio::null())
      .stderr(Stdio::piped())
      .spawn()?;
    child
      .stdin
      .take()
      .ok_or_else(|| PickerError::Firewall("Could not open nftables input".into()))?
      .write_all(script.as_bytes())?;
    let output = child.wait_with_output()?;
    if !output.status.success() {
      return Err(PickerError::Firewall(format!(
        "nftables rejected the update; prior rules were preserved: {}",
        String::from_utf8_lossy(&output.stderr).trim()
      )));
    }
  }
  let observed: Vec<_> = table(&binary)?
    .as_ref()
    .map(inspect)
    .transpose()?
    .unwrap_or_default()
    .into_keys()
    .collect();
  let mut expected = desired.to_vec();
  expected.sort();
  if observed != expected {
    return Err(PickerError::Firewall(
      "Firewall state changed during verification. Restore default routing if needed.".into(),
    ));
  }
  Ok(observed)
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
  fn snapshot(rule: &FirewallRule) -> Value {
    json!({"nftables": [
        {"table": {"family": "inet", "name": TABLE, "comment": OWNER}},
        {"chain": {"name": "output", "hook": "output", "type": "filter", "policy": "accept", "prio": -10}},
        {"rule": {"chain": "output", "handle": 9, "comment": rule_name(rule), "expr": expressions(rule)}}
    ]})
  }

  #[test]
  fn identical_selection_produces_no_firewall_writes() {
    let rule = rule();
    assert!(
      transaction(Some(&snapshot(&rule)), &[rule])
        .unwrap()
        .is_empty()
    );
  }

  #[test]
  fn cleanup_is_confined_to_owned_table() {
    assert_eq!(
      transaction(Some(&snapshot(&rule())), &[]).unwrap(),
      format!("delete table inet {TABLE}\n")
    );
    assert!(transaction(None, &[]).unwrap().is_empty());
  }

  #[test]
  fn changed_selection_deletes_only_old_handle() {
    let old = rule();
    let mut new = old.clone();
    new.address = "155.133.230.2".into();
    let script = transaction(Some(&snapshot(&old)), &[new]).unwrap();
    assert!(script.contains("delete rule inet dmm_server_picker output handle 9"));
    assert!(!script.contains("flush"));
    assert!(!script.contains("delete table"));
  }

  /// Synthetic snapshots can't prove `inspect` accepts what nft really
  /// prints back. Run as root: `cargo test -- --ignored`.
  #[cfg(target_os = "linux")]
  #[test]
  #[ignore = "writes a real nftables table; needs root and nft"]
  fn real_nftables_round_trip() {
    let mut single = rule();
    single.address = "155.133.230.2".into();
    single.port_end = single.port_start;
    let mut desired = vec![rule(), single];
    desired.sort();
    assert_eq!(apply(&desired).unwrap(), desired);
    assert_eq!(apply(&desired).unwrap(), desired);
    assert_eq!(apply(&desired[..1]).unwrap(), desired[..1]);
    assert!(apply(&[]).unwrap().is_empty());
    assert!(table(&nft_path().unwrap()).unwrap().is_none());
  }

  #[test]
  fn forged_metadata_does_not_count_as_effective_restriction() {
    let mut value = snapshot(&rule());
    value["nftables"][2]["rule"]["expr"] = json!([{"accept": null}]);
    assert!(inspect(&value).is_err());
  }
}
