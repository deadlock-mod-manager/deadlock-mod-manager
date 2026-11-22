use std::{
  collections::{BTreeMap, BTreeSet},
  net::Ipv4Addr,
};

use futures::StreamExt;
use serde::Deserialize;

use crate::{
  FirewallRule, PickerError, ServerPickerCatalog, ServerPickerLocation, ServerPickerRelay,
};

pub const CATALOG_URL: &str =
  "https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=1422450";
pub(crate) const MAX_CATALOG_BYTES: usize = 2 * 1024 * 1024;

#[derive(Deserialize)]
struct ValveCatalog {
  revision: u64,
  pops: BTreeMap<String, ValveLocation>,
  success: bool,
}

#[derive(Deserialize)]
struct ValveLocation {
  desc: String,
  #[serde(default)]
  relays: Vec<ValveRelay>,
}

#[derive(Deserialize)]
struct ValveRelay {
  ipv4: Ipv4Addr,
  port_range: [u16; 2],
}

pub async fn fetch_catalog(client: &reqwest::Client) -> Result<ServerPickerCatalog, PickerError> {
  let response = client
    .get(CATALOG_URL)
    .send()
    .await
    .and_then(reqwest::Response::error_for_status)
    .map_err(|error| PickerError::Catalog(error.to_string()))?;
  if response
    .content_length()
    .is_some_and(|length| length > MAX_CATALOG_BYTES as u64)
  {
    return Err(PickerError::Catalog(
      "Valve's relay catalog is too large".into(),
    ));
  }
  let mut bytes = Vec::new();
  let mut stream = response.bytes_stream();
  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|error| PickerError::Catalog(error.to_string()))?;
    if bytes.len() + chunk.len() > MAX_CATALOG_BYTES {
      return Err(PickerError::Catalog(
        "Valve's relay catalog is too large".into(),
      ));
    }
    bytes.extend_from_slice(&chunk);
  }
  parse_catalog(&bytes)
}

fn parse_catalog(bytes: &[u8]) -> Result<ServerPickerCatalog, PickerError> {
  let raw: ValveCatalog = serde_json::from_slice(bytes)?;
  if !raw.success || raw.pops.is_empty() || raw.pops.len() > 512 {
    return Err(PickerError::Catalog(
      "Valve returned an invalid relay catalog".into(),
    ));
  }
  let mut locations = Vec::new();
  for (id, location) in raw.pops {
    // Some PoPs host servers but expose no public relay; they cannot be blocked here.
    if location.relays.is_empty() {
      continue;
    }
    let (region, country) = location_metadata(&id);
    locations.push(ServerPickerLocation {
      id,
      name: location.desc,
      region: region.into(),
      country_code: country.map(str::to_owned),
      relays: location
        .relays
        .into_iter()
        .map(|relay| ServerPickerRelay {
          address: relay.ipv4.to_string(),
          port_start: relay.port_range[0],
          port_end: relay.port_range[1],
        })
        .collect(),
    });
  }
  let catalog = ServerPickerCatalog {
    revision: raw.revision.to_string(),
    fetched_at: crate::now_ms(),
    locations,
  };
  validate_catalog(&catalog)?;
  Ok(catalog)
}

pub(crate) fn valid_location_id(id: &str) -> bool {
  !id.is_empty()
    && id.len() <= 32
    && id
      .bytes()
      .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

pub(crate) fn validate_catalog(catalog: &ServerPickerCatalog) -> Result<(), PickerError> {
  if catalog.locations.is_empty() || catalog.locations.len() > 512 {
    return Err(PickerError::Catalog("Invalid relay location count".into()));
  }
  let mut ids = BTreeSet::new();
  for location in &catalog.locations {
    if !valid_location_id(&location.id)
      || !ids.insert(&location.id)
      || location.name.is_empty()
      || location.name.len() > 200
      || location.relays.is_empty()
      || location.relays.len() > 128
    {
      return Err(PickerError::Catalog("Invalid relay location".into()));
    }
    for relay in &location.relays {
      let address: Ipv4Addr = relay
        .address
        .parse()
        .map_err(|_| PickerError::Catalog("Invalid relay address".into()))?;
      let octets = address.octets();
      if address.is_private()
        || address.is_loopback()
        || address.is_link_local()
        || address.is_unspecified()
        || address.is_broadcast()
        || address.is_multicast()
        || octets[0] == 0
        || octets[0] >= 240
        || (octets[0] == 100 && (64..=127).contains(&octets[1]))
        || relay.port_start == 0
        || relay.port_start > relay.port_end
      {
        return Err(PickerError::Catalog("Invalid relay destination".into()));
      }
    }
  }
  Ok(())
}

pub fn rules_for_locations(
  catalog: &ServerPickerCatalog,
  ids: &[String],
) -> Result<Vec<FirewallRule>, PickerError> {
  let mut rules = BTreeSet::new();
  for id in ids {
    let location = catalog
      .locations
      .iter()
      .find(|location| &location.id == id)
      .ok_or_else(|| {
        PickerError::Validation(format!("Relay location {id} is no longer in the catalog"))
      })?;
    for relay in &location.relays {
      rules.insert(FirewallRule {
        location_id: id.clone(),
        address: relay.address.clone(),
        port_start: relay.port_start,
        port_end: relay.port_end,
      });
    }
  }
  Ok(rules.into_iter().collect())
}

fn location_metadata(id: &str) -> (&'static str, Option<&'static str>) {
  match id {
    "ams" => ("europe", Some("NL")),
    "fra" | "dfra" | "fsn" => ("europe", Some("DE")),
    "hel" => ("europe", Some("FI")),
    "lhr" | "dlhr" => ("europe", Some("GB")),
    "mad" => ("europe", Some("ES")),
    "par" => ("europe", Some("FR")),
    "sto" | "sto2" | "dsto" => ("europe", Some("SE")),
    "vie" | "dvie" => ("europe", Some("AT")),
    "waw" => ("europe", Some("PL")),
    "atl" | "dfw" | "eat" | "iad" | "lax" | "ord" | "sea" => ("northAmerica", Some("US")),
    "eze" => ("southAmerica", Some("AR")),
    "gru" => ("southAmerica", Some("BR")),
    "lim" => ("southAmerica", Some("PE")),
    "scl" => ("southAmerica", Some("CL")),
    "dxb" | "dfjr" => ("middleEast", Some("AE")),
    "jnb" => ("africa", Some("ZA")),
    "hkg" => ("asia", Some("HK")),
    "bom" | "bom2" | "maa" | "maa2" => ("asia", Some("IN")),
    "sgp" => ("asia", Some("SG")),
    "seo" => ("asia", Some("KR")),
    "tyo" => ("asia", Some("JP")),
    "syd" => ("oceania", Some("AU")),
    "gum" => ("oceania", Some("GU")),
    _ => ("other", None),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn fixture(address: &str, ports: &str) -> Vec<u8> {
    format!(r#"{{"success":true,"revision":42,"pops":{{"ams":{{"desc":"Amsterdam","relays":[{{"ipv4":"{address}","port_range":{ports}}}]}},"empty":{{"desc":"No public relay"}}}}}}"#).into_bytes()
  }

  #[test]
  fn parses_only_public_relay_locations_and_preserves_port_pairs() {
    let catalog = parse_catalog(&fixture("155.133.248.36", "[27015,27050]")).unwrap();
    assert_eq!(catalog.locations.len(), 1);
    assert_eq!(catalog.locations[0].country_code.as_deref(), Some("NL"));
    let rules = rules_for_locations(&catalog, &["ams".into(), "ams".into()]).unwrap();
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0].port_end, 27050);
    assert!(rules_for_locations(&catalog, &["missing".into()]).is_err());
  }

  #[test]
  fn rejects_private_destinations_and_invalid_ports() {
    assert!(parse_catalog(&fixture("127.0.0.1", "[27015,27050]")).is_err());
    assert!(parse_catalog(&fixture("10.1.2.3", "[27015,27050]")).is_err());
    assert!(parse_catalog(&fixture("155.133.248.36", "[27050,27015]")).is_err());
    assert!(parse_catalog(&fixture("155.133.248.36", "[0,27050]")).is_err());
  }
}
