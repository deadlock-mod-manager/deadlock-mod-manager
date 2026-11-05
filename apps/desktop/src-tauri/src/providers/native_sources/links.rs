//! Deep links that let a source's website add the source or install one of its
//! mods: `deadlock-mod-manager://sources/add?url=<descriptor>` and
//! `deadlock-mod-manager://sources/install?url=<descriptor>&source=<id>&listing=<id>`
//! with optional `release` and `artifact`. Links carry the descriptor URL and
//! IDs only; files still come from the accepted source's catalog, and adding a
//! source always goes through the reviewed enrollment dialog.

use crate::deep_link::parse_query_params;
use crate::errors::Error;
use serde::Serialize;
use std::sync::Mutex;
use ts_rs::TS;

use super::NativeSourceMod;
use super::network::validate_source_url;
use super::validation::validate_id;

pub const PATH_SOURCES: &str = "//sources/";
const PATH_ADD: &str = "//sources/add";
const PATH_INSTALL: &str = "//sources/install";

const MAX_PENDING: usize = 10;

/// Any web page can fire a link, so only development builds let one reach
/// local-network sources.
pub const LINKS_ALLOW_LOCAL_NETWORK: bool = cfg!(debug_assertions);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(
  tag = "kind",
  rename_all = "lowercase",
  rename_all_fields = "camelCase"
)]
pub enum NativeSourceLink {
  Add {
    descriptor_url: String,
  },
  Install {
    descriptor_url: String,
    source_id: String,
    listing_id: String,
    release_id: Option<String>,
    artifact_id: Option<String>,
  },
}

/// Where an install link stands against the user's added sources. A link never
/// adds or re-enables a source itself; the window asks first.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(
  tag = "status",
  rename_all = "camelCase",
  rename_all_fields = "camelCase"
)]
pub enum NativeSourceLinkTarget {
  NotAdded,
  Disabled { source_key: String },
  Ready { record: Box<NativeSourceMod> },
}

/// Applies the same checks to an install request from the renderer as to one
/// from a link.
pub fn install_link(
  descriptor_url: &str,
  source_id: &str,
  listing_id: &str,
  release_id: Option<&str>,
  artifact_id: Option<&str>,
  allow_local_network: bool,
) -> Result<NativeSourceLink, Error> {
  let descriptor_url = validate_source_url(descriptor_url, allow_local_network)?;
  for id in [Some(source_id), Some(listing_id), release_id, artifact_id]
    .into_iter()
    .flatten()
  {
    validate_id(id)?;
  }
  Ok(NativeSourceLink::Install {
    descriptor_url: descriptor_url.to_string(),
    source_id: source_id.to_string(),
    listing_id: listing_id.to_string(),
    release_id: release_id.map(str::to_string),
    artifact_id: artifact_id.map(str::to_string),
  })
}

/// Parses the part after the scheme. Windows may add a slash before the query
/// or after it.
pub fn parse_link(data_part: &str, allow_local_network: bool) -> Option<NativeSourceLink> {
  let (is_install, rest) = match data_part.strip_prefix(PATH_INSTALL) {
    Some(rest) => (true, rest),
    None => (false, data_part.strip_prefix(PATH_ADD)?),
  };
  let query = rest
    .strip_prefix('/')
    .unwrap_or(rest)
    .strip_prefix('?')?
    .trim_end_matches('/');
  let params = parse_query_params(query);
  let url = params.get("url")?;

  if !is_install {
    let descriptor_url = validate_source_url(url, allow_local_network).ok()?;
    return Some(NativeSourceLink::Add {
      descriptor_url: descriptor_url.to_string(),
    });
  }
  install_link(
    url,
    params.get("source")?,
    params.get("listing")?,
    params.get("release").map(String::as_str),
    params.get("artifact").map(String::as_str),
    allow_local_network,
  )
  .ok()
}

/// Links waiting for the window. A link that starts the app arrives before the
/// window listens, so links wait here and the event only says to look.
static PENDING: Mutex<Vec<NativeSourceLink>> = Mutex::new(Vec::new());

/// Returns false when the link was dropped as a repeat of a waiting link or
/// because the queue is full.
pub fn queue_pending(link: NativeSourceLink) -> bool {
  let Ok(mut pending) = PENDING.lock() else {
    return false;
  };
  if pending.contains(&link) || pending.len() >= MAX_PENDING {
    return false;
  }
  pending.push(link);
  true
}

pub fn take_pending() -> Vec<NativeSourceLink> {
  PENDING
    .lock()
    .map(|mut pending| std::mem::take(&mut *pending))
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::deep_link::strip_scheme;

  const DESCRIPTOR: &str = "https://mods.example.org/.well-known/dmm-source.json";

  fn parse(url: &str) -> Option<NativeSourceLink> {
    parse_link(
      strip_scheme(url).expect("scheme should be recognised"),
      false,
    )
  }

  #[test]
  fn parses_the_links_a_site_sends() {
    // Sites hardcode these shapes, so a change here breaks their buttons.
    assert_eq!(
      parse(
        "deadlock-mod-manager://sources/add?url=https%3A%2F%2Fmods.example.org%2F.well-known%2Fdmm-source.json"
      ),
      Some(NativeSourceLink::Add {
        descriptor_url: DESCRIPTOR.to_string()
      })
    );
    assert_eq!(
      parse(
        "deadlock-mod-manager://sources/install?url=https%3A%2F%2Fmods.example.org%2F.well-known%2Fdmm-source.json&source=my-community&listing=abrams%20horn&artifact=main"
      ),
      Some(NativeSourceLink::Install {
        descriptor_url: DESCRIPTOR.to_string(),
        source_id: "my-community".to_string(),
        listing_id: "abrams horn".to_string(),
        release_id: None,
        artifact_id: Some("main".to_string()),
      })
    );
  }

  #[test]
  fn tolerates_the_slashes_windows_adds() {
    for data_part in [
      "//sources/add/?url=https%3A%2F%2Fmods.example.org%2F.well-known%2Fdmm-source.json",
      "//sources/add?url=https%3A%2F%2Fmods.example.org%2F.well-known%2Fdmm-source.json/",
    ] {
      assert!(parse_link(data_part, false).is_some(), "{data_part}");
    }
  }

  #[test]
  fn rejects_unsafe_or_incomplete_links() {
    for data_part in [
      "//sources/add?url=http%3A%2F%2Fmods.example.org%2Fsource.json",
      "//sources/add?url=https%3A%2F%2Fuser%3Apass%40mods.example.org%2Fsource.json",
      "//sources/add?url=https%3A%2F%2F10.0.0.5%2Fsource.json",
      "//sources/add?url=not-a-url",
      "//sources/add",
      "//sources/remove?url=https%3A%2F%2Fmods.example.org%2Fsource.json",
      "//sources/install?url=https%3A%2F%2Fmods.example.org%2Fsource.json&listing=1",
      "//sources/install?url=https%3A%2F%2Fmods.example.org%2Fsource.json&source=s&listing=",
      "//sources/install?url=https%3A%2F%2Fmods.example.org%2Fsource.json&source=s&listing=a%00b",
    ] {
      assert_eq!(parse_link(data_part, false), None, "{data_part}");
    }
  }

  #[test]
  fn queues_links_until_the_window_takes_them() {
    let link = NativeSourceLink::Add {
      descriptor_url: "https://queue.example/source.json".to_string(),
    };
    assert!(queue_pending(link.clone()));
    assert!(!queue_pending(link.clone()));
    assert!(take_pending().contains(&link));
  }
}
