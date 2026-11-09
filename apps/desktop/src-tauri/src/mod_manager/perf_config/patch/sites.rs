//! Performance-specific views of the shared GameInfo source document.

use std::collections::HashMap;

use super::fail;
use crate::errors::Error;
use crate::mod_manager::gameinfo::Document;
pub(crate) use crate::mod_manager::gameinfo::{Site, SiteKind};
use crate::mod_manager::perf_config::live::path_key;

pub(crate) fn parse_sites(text: &str) -> Result<Vec<Site>, Error> {
  Document::parse(text)
    .map(|document| document.sites)
    .map_err(|error| fail(error.to_string()))
}
/// Values by path; the last occurrence of a key wins, as in the engine.
pub(crate) fn scalar_values(sites: &[Site]) -> HashMap<String, String> {
  let mut values = HashMap::new();
  for site in sites {
    if let SiteKind::Scalar { value, .. } = &site.kind {
      values.insert(path_key(&site.path), value.clone());
    }
  }
  values
}
