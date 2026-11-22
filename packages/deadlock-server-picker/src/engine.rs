use std::{
  collections::{BTreeMap, BTreeSet},
  path::PathBuf,
  sync::Mutex as StdMutex,
  time::Duration,
};

use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::{
  FirewallRule, PickerError, ServerPickerCatalog, ServerPickerLatency, ServerPickerPreset,
  ServerPickerState, catalog,
  firewall::FirewallBackend,
  persistence::{self, Preferences},
  probe,
};

struct Inner {
  catalog: Option<ServerPickerCatalog>,
  preferences: Preferences,
  latencies: Vec<ServerPickerLatency>,
  preferred_relays: BTreeMap<String, String>,
  warning: Option<String>,
  /// Rules the elevated helper read back after this process's last apply or
  /// reset. Linux can't read nftables unprivileged, so without this every
  /// refresh would report "not verified" right after a verified apply.
  verified_rules: Option<Vec<FirewallRule>>,
}

/// Owns preferences and serializes mutations. The host supplies only its storage
/// directory and the resolved game executable when applying restrictions.
pub struct ServerPicker {
  directory: PathBuf,
  client: reqwest::Client,
  firewall: FirewallBackend,
  inner: Mutex<Inner>,
  operation: Mutex<()>,
  refresh: Mutex<()>,
  probes: Mutex<()>,
  cancellation: StdMutex<CancellationToken>,
}

impl ServerPicker {
  pub fn new(directory: PathBuf) -> Result<Self, PickerError> {
    // Corrupt saved data must never prevent offline restoration of owned rules.
    let mut warning = None;
    let preferences =
      persistence::read::<Preferences>(&directory.join("preferences.json"), 256 * 1024)
        .and_then(|saved| {
          saved
            .map(|saved| saved.validate().map(|()| saved))
            .transpose()
        })
        .unwrap_or_else(|error| {
          warning = Some(error.to_string());
          None
        })
        .unwrap_or_default();
    let catalog = persistence::read::<ServerPickerCatalog>(
      &directory.join("catalog.json"),
      catalog::MAX_CATALOG_BYTES,
    )
    .and_then(|saved| {
      saved
        .map(|saved| catalog::validate_catalog(&saved).map(|()| saved))
        .transpose()
    })
    .unwrap_or_else(|error| {
      warning = Some(error.to_string());
      None
    });
    let client = reqwest::Client::builder()
      .timeout(Duration::from_secs(15))
      .https_only(true)
      .redirect(reqwest::redirect::Policy::none())
      .build()
      .map_err(|error| PickerError::Catalog(error.to_string()))?;
    Ok(Self {
      directory,
      client,
      firewall: FirewallBackend::new(),
      inner: Mutex::new(Inner {
        catalog,
        preferences,
        latencies: Vec::new(),
        preferred_relays: BTreeMap::new(),
        warning,
        verified_rules: None,
      }),
      operation: Mutex::new(()),
      refresh: Mutex::new(()),
      probes: Mutex::new(()),
      cancellation: StdMutex::new(CancellationToken::new()),
    })
  }

  pub async fn state(&self) -> Result<ServerPickerState, PickerError> {
    let _operation = self.operation.lock().await;
    let mut observed = self.firewall.observe().await;
    if observed.is_err()
      && let Some(rules) = self.inner.lock().await.verified_rules.clone()
    {
      observed = Ok(rules);
    }
    Ok(self.snapshot(observed).await)
  }

  async fn snapshot(&self, observed: Result<Vec<FirewallRule>, PickerError>) -> ServerPickerState {
    let inner = self.inner.lock().await;
    let mut warning = inner.warning.clone();
    let (observation_known, rules) = match observed {
      Ok(rules) => (true, rules),
      Err(error) => {
        warning = Some(error.to_string());
        (false, Vec::new())
      }
    };
    let mut partially_blocked = false;
    let observed_blocked_locations = rules
      .iter()
      .map(|rule| rule.location_id.clone())
      .collect::<BTreeSet<_>>()
      .into_iter()
      .filter(|id| {
        let complete = inner
          .catalog
          .as_ref()
          .and_then(|catalog| catalog::rules_for_locations(catalog, std::slice::from_ref(id)).ok())
          .is_some_and(|expected| expected.iter().all(|rule| rules.contains(rule)));
        partially_blocked |= !complete;
        complete
      })
      .collect();
    if partially_blocked {
      warning = Some("Some owned firewall rules cover only part of a location or an obsolete location. Apply your selection again or restore default routing.".into());
    }
    if inner.preferences.operation_pending {
      warning = Some("A previous firewall operation did not finish. Review the current restrictions or restore default routing.".into());
    }
    let desired = match &inner.catalog {
      Some(catalog) => {
        catalog::rules_for_locations(catalog, &inner.preferences.blocked_locations).ok()
      }
      None if inner.preferences.blocked_locations.is_empty() => Some(Vec::new()),
      None => None,
    };
    let rules_match = observation_known
      && !inner.preferences.operation_pending
      && desired.is_some_and(|desired| rule_set(&desired) == rule_set(&rules));
    ServerPickerState {
      catalog: inner.catalog.clone(),
      capability: self.firewall.capability(),
      blocked_locations: inner.preferences.blocked_locations.clone(),
      observed_blocked_locations,
      observation_known,
      has_restrictions: !rules.is_empty(),
      presets: inner.preferences.presets.clone(),
      latencies: inner.latencies.clone(),
      rules_match,
      warning,
    }
  }

  pub async fn refresh(&self) -> Result<ServerPickerState, PickerError> {
    let requested_at = crate::now_ms();
    let refresh = self.refresh.lock().await;
    let already_refreshed = self
      .inner
      .lock()
      .await
      .catalog
      .as_ref()
      .is_some_and(|catalog| catalog.fetched_at >= requested_at);
    if !already_refreshed {
      let catalog = catalog::fetch_catalog(&self.client).await?;
      persistence::write(&self.directory.join("catalog.json"), &catalog)?;
      self.inner.lock().await.catalog = Some(catalog);
    }
    drop(refresh);
    self.state().await
  }

  pub async fn apply(
    &self,
    blocked_locations: Vec<String>,
    game_executable: PathBuf,
  ) -> Result<ServerPickerState, PickerError> {
    persistence::validate_selection(&blocked_locations)?;
    let _operation = self.operation.lock().await;
    let blocked_locations = normalize_selection(blocked_locations);
    let rules = {
      let mut inner = self.inner.lock().await;
      let catalog = inner.catalog.as_ref().ok_or_else(|| {
        PickerError::Catalog("Refresh the relay catalog before applying restrictions".into())
      })?;
      let rules = catalog::rules_for_locations(catalog, &blocked_locations)?;
      let mut pending = inner.preferences.clone();
      pending.operation_pending = true;
      self.write_preferences(&pending)?;
      inner.preferences = pending;
      inner.verified_rules = None;
      rules
    };
    let observed = self.firewall.apply(rules.clone(), game_executable).await?;
    if rule_set(&observed) != rule_set(&rules) {
      return Err(PickerError::Firewall("The firewall did not apply all requested restrictions. Refresh or restore default routing.".into()));
    }
    {
      let mut inner = self.inner.lock().await;
      let mut preferences = inner.preferences.clone();
      preferences.blocked_locations = blocked_locations;
      preferences.operation_pending = false;
      self.write_preferences(&preferences)?;
      inner.preferences = preferences;
      inner.warning = None;
      inner.verified_rules = Some(observed.clone());
    }
    Ok(self.snapshot(Ok(observed)).await)
  }

  /// Requires neither the catalog nor intact preferences; ownership is resolved
  /// from the platform firewall itself.
  pub async fn reset(&self) -> Result<ServerPickerState, PickerError> {
    let _operation = self.operation.lock().await;
    self.inner.lock().await.verified_rules = None;
    let observed = match self.firewall.observe().await {
      Ok(rules) if rules.is_empty() => rules,
      _ => self.firewall.reset().await?,
    };
    if !observed.is_empty() {
      return Err(PickerError::Firewall(
        "Some server picker restrictions could not be removed".into(),
      ));
    }
    {
      let mut inner = self.inner.lock().await;
      let mut preferences = inner.preferences.clone();
      preferences.blocked_locations.clear();
      preferences.operation_pending = false;
      self.write_preferences(&preferences)?;
      inner.preferences = preferences;
      inner.warning = None;
      inner.verified_rules = Some(Vec::new());
    }
    Ok(self.snapshot(Ok(observed)).await)
  }

  pub async fn save_preset(
    &self,
    name: String,
    blocked_locations: Vec<String>,
  ) -> Result<Vec<ServerPickerPreset>, PickerError> {
    persistence::validate_selection(&blocked_locations)?;
    let name = name.trim();
    if !persistence::valid_preset_name(name) {
      return Err(PickerError::Validation(
        "Preset names must contain 1–100 characters".into(),
      ));
    }
    // Presets are local preferences and must remain editable while a
    // separate firewall operation waits for system authorization.
    let mut inner = self.inner.lock().await;
    let mut preferences = inner.preferences.clone();
    let selection = normalize_selection(blocked_locations);
    if let Some(preset) = preferences
      .presets
      .iter_mut()
      .find(|preset| preset.name.eq_ignore_ascii_case(name))
    {
      preset.name = name.into();
      preset.blocked_locations = selection;
    } else {
      preferences.presets.push(ServerPickerPreset {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.into(),
        blocked_locations: selection,
      });
    }
    preferences.validate()?;
    self.write_preferences(&preferences)?;
    inner.preferences = preferences;
    Ok(inner.preferences.presets.clone())
  }

  pub async fn delete_preset(&self, id: String) -> Result<Vec<ServerPickerPreset>, PickerError> {
    let mut inner = self.inner.lock().await;
    let mut preferences = inner.preferences.clone();
    preferences.presets.retain(|preset| preset.id != id);
    self.write_preferences(&preferences)?;
    inner.preferences = preferences;
    Ok(inner.preferences.presets.clone())
  }

  pub fn cancel_probe(&self) {
    self
      .cancellation
      .lock()
      .unwrap_or_else(|error| error.into_inner())
      .cancel();
  }

  pub async fn probe(&self) -> Result<Vec<ServerPickerLatency>, PickerError> {
    let cancellation = CancellationToken::new();
    {
      let mut active = self
        .cancellation
        .lock()
        .unwrap_or_else(|error| error.into_inner());
      active.cancel();
      *active = cancellation.clone();
    }
    let _probes = self.probes.lock().await;
    if cancellation.is_cancelled() {
      return Err(PickerError::Cancelled);
    }
    let (catalog, preferred) = {
      let inner = self.inner.lock().await;
      (
        inner.catalog.clone().ok_or_else(|| {
          PickerError::Catalog("Refresh the relay catalog before measuring latency".into())
        })?,
        inner.preferred_relays.clone(),
      )
    };
    let results = probe::sweep(&catalog, &preferred, &cancellation).await;
    if cancellation.is_cancelled() {
      return Err(PickerError::Cancelled);
    }
    let mut inner = self.inner.lock().await;
    inner.preferred_relays.clear();
    inner.latencies.clear();
    for (latency, relay) in results {
      if let Some(relay) = relay {
        inner
          .preferred_relays
          .insert(latency.location_id.clone(), relay);
      }
      inner.latencies.push(latency);
    }
    inner
      .latencies
      .sort_by(|left, right| left.location_id.cmp(&right.location_id));
    Ok(inner.latencies.clone())
  }

  fn write_preferences(&self, preferences: &Preferences) -> Result<(), PickerError> {
    persistence::write(&self.directory.join("preferences.json"), preferences)
  }
}

fn normalize_selection(mut selection: Vec<String>) -> Vec<String> {
  selection.sort();
  selection.dedup();
  selection
}

fn rule_set(rules: &[FirewallRule]) -> BTreeSet<&FirewallRule> {
  rules.iter().collect()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn probe_future_can_run_on_the_hosts_multithreaded_executor() {
    fn require_send<T: Send>(_future: T) {}
    let dir = tempfile::tempdir().unwrap();
    let picker = ServerPicker::new(dir.path().to_owned()).unwrap();
    require_send(picker.probe());
  }

  #[tokio::test]
  async fn presets_persist_without_waiting_for_a_firewall_operation() {
    let dir = tempfile::tempdir().unwrap();
    let picker = ServerPicker::new(dir.path().to_owned()).unwrap();
    let operation = picker.operation.lock().await;
    {
      let mut inner = picker.inner.lock().await;
      inner.preferences.operation_pending = true;
      inner.preferences.blocked_locations = vec!["ams".into()];
    }
    let saved = tokio::time::timeout(
      Duration::from_secs(2),
      picker.save_preset(
        " Europe ".into(),
        vec!["fra".into(), "ams".into(), "fra".into()],
      ),
    )
    .await
    .expect("saving a preset must not wait for the firewall")
    .unwrap();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].name, "Europe");
    assert_eq!(saved[0].blocked_locations, ["ams", "fra"]);
    let id = saved[0].id.clone();
    let updated = tokio::time::timeout(
      Duration::from_secs(2),
      picker.save_preset("EUROPE".into(), vec!["fra".into()]),
    )
    .await
    .expect("updating a preset must not wait for the firewall")
    .unwrap();
    assert_eq!(updated.len(), 1);
    assert_eq!(updated[0].id, id);
    assert_eq!(updated[0].blocked_locations, ["fra"]);

    let restarted = ServerPicker::new(dir.path().to_owned()).unwrap();
    {
      let inner = restarted.inner.lock().await;
      assert!(inner.preferences.operation_pending);
      assert_eq!(inner.preferences.blocked_locations, ["ams"]);
      assert_eq!(inner.preferences.presets[0].id, id);
      assert_eq!(inner.preferences.presets[0].name, "EUROPE");
      assert_eq!(inner.preferences.presets[0].blocked_locations, ["fra"]);
    }
    let deleted = tokio::time::timeout(Duration::from_secs(2), picker.delete_preset(id))
      .await
      .expect("deleting a preset must not wait for the firewall")
      .unwrap();
    assert!(deleted.is_empty());
    drop(operation);
    let restarted = ServerPicker::new(dir.path().to_owned()).unwrap();
    let inner = restarted.inner.lock().await;
    assert!(inner.preferences.presets.is_empty());
    assert!(inner.preferences.operation_pending);
    assert_eq!(inner.preferences.blocked_locations, ["ams"]);
  }

  fn catalog_fixture() -> ServerPickerCatalog {
    ServerPickerCatalog {
      revision: "1".into(),
      fetched_at: crate::now_ms(),
      locations: vec![crate::ServerPickerLocation {
        id: "ams".into(),
        name: "Amsterdam".into(),
        region: "europe".into(),
        country_code: Some("NL".into()),
        relays: vec![
          crate::ServerPickerRelay {
            address: "155.133.248.36".into(),
            port_start: 27015,
            port_end: 27050,
          },
          crate::ServerPickerRelay {
            address: "155.133.248.37".into(),
            port_start: 27015,
            port_end: 27050,
          },
        ],
      }],
    }
  }

  #[tokio::test]
  async fn partial_rules_are_not_reported_as_a_fully_blocked_location() {
    let dir = tempfile::tempdir().unwrap();
    let catalog = catalog_fixture();
    let rules = catalog::rules_for_locations(&catalog, &["ams".into()]).unwrap();
    let picker = ServerPicker::new(dir.path().to_owned()).unwrap();
    {
      let mut inner = picker.inner.lock().await;
      inner.catalog = Some(catalog);
      inner.preferences.blocked_locations = vec!["ams".into()];
    }
    let partial = picker.snapshot(Ok(vec![rules[0].clone()])).await;
    assert!(partial.observation_known);
    assert!(partial.has_restrictions);
    assert!(partial.observed_blocked_locations.is_empty());
    assert!(!partial.rules_match);
    assert!(partial.warning.is_some());
    let complete = picker.snapshot(Ok(rules)).await;
    assert!(complete.rules_match);
    assert_eq!(complete.observed_blocked_locations, ["ams"]);
    assert!(complete.warning.is_none());
  }

  #[tokio::test]
  async fn unavailable_observation_is_not_default_routing_or_a_match() {
    let dir = tempfile::tempdir().unwrap();
    let picker = ServerPicker::new(dir.path().to_owned()).unwrap();
    let state = picker
      .snapshot(Err(PickerError::Firewall("Read denied".into())))
      .await;
    assert!(!state.observation_known);
    assert!(!state.rules_match);
    assert_eq!(state.warning.as_deref(), Some("Read denied"));
    let default_routing = picker.snapshot(Ok(Vec::new())).await;
    assert!(default_routing.observation_known);
    assert!(default_routing.rules_match);
    assert!(!default_routing.has_restrictions);
  }

  #[tokio::test]
  async fn unfinished_operation_survives_restart_without_claiming_success() {
    let dir = tempfile::tempdir().unwrap();
    persistence::write(
      &dir.path().join("preferences.json"),
      &Preferences {
        blocked_locations: Vec::new(),
        operation_pending: true,
        presets: Vec::new(),
      },
    )
    .unwrap();
    let picker = ServerPicker::new(dir.path().to_owned()).unwrap();
    let state = picker.snapshot(Ok(Vec::new())).await;
    assert!(state.blocked_locations.is_empty());
    assert!(!state.rules_match);
    assert!(state.warning.is_some());
  }

  #[test]
  fn corrupted_preferences_do_not_prevent_constructing_cleanup_service() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("preferences.json"), b"invalid json").unwrap();
    let picker = ServerPicker::new(dir.path().to_owned()).unwrap();
    let inner = picker.inner.try_lock().unwrap();
    assert!(inner.warning.is_some());
    assert!(inner.preferences.blocked_locations.is_empty());
  }

  #[tokio::test]
  async fn cancellation_before_network_activity_does_not_change_latency_cache() {
    let dir = tempfile::tempdir().unwrap();
    let picker = ServerPicker::new(dir.path().to_owned()).unwrap();
    let gate = picker.probes.lock().await;
    let future = picker.probe();
    tokio::pin!(future);
    tokio::select! {
        result = &mut future => panic!("probe unexpectedly completed: {result:?}"),
        _ = tokio::task::yield_now() => {}
    }
    picker.cancel_probe();
    drop(gate);
    assert!(matches!(future.await, Err(PickerError::Cancelled)));
    assert!(picker.inner.lock().await.latencies.is_empty());
  }
}
