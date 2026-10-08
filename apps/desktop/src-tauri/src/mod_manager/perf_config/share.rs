//! Share codes and ConVars snippets.
//!
//! A share code is `dmm-perf:1:` followed by the config as JSON, deflated and
//! base64url-encoded without padding:
//!
//! ```text
//! { "n": name,
//!   "p": presetId,                                   (presets)
//!   "e": [["ConVars/r_ssao", "0"], ["ConVars/x", null]], (other configs)
//!   "o": [["ConVars/fps_max", "s", "240"], ["ConVars/y", "o"], ["ConVars/z", "e"]],
//!   "x": true }                                      (engine sections included)
//! ```
//!
//! Presets travel by id plus overrides, so a code stays short and follows the
//! catalog's fixes; other configs carry their entries. Optional fields are
//! left out when empty. Codes come from strangers, so decoding caps every size
//! and refuses anything that couldn't be written into gameinfo.gi safely.

use std::io::{Read, Write};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use flate2::Compression;
use flate2::read::DeflateDecoder;
use flate2::write::DeflateEncoder;
use serde::{Deserialize, Serialize};

use super::types::{
  ConfigEntry, EntryOverride, EntryStatus, OverrideAction, PerfApplyRequest, PerfConfigSource,
  ResolvedConfig, ResolvedEntry,
};
use crate::errors::Error;

pub const PREFIX: &str = "dmm-perf:";
const VERSION: &str = "1";
const MAX_CODE_BYTES: usize = 256 * 1024;
const MAX_JSON_BYTES: u64 = 2 * 1024 * 1024;
const MAX_ITEMS: usize = 5000;
const MAX_NAME_CHARS: usize = 120;
const MAX_PRESET_ID_CHARS: usize = 100;
const MAX_PATH_DEPTH: usize = 8;
const MAX_SEGMENT_CHARS: usize = 128;
const MAX_VALUE_CHARS: usize = 1024;

pub struct DecodedShare {
  pub name: String,
  pub preset_id: Option<String>,
  pub entries: Vec<ConfigEntry>,
  pub overrides: Vec<EntryOverride>,
  pub include_engine_sections: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct Payload {
  n: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  p: Option<String>,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  e: Vec<(String, Option<String>)>,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  o: Vec<Vec<String>>,
  #[serde(default, skip_serializing_if = "std::ops::Not::not")]
  x: bool,
}

/// Whether `text` starts like a share code (the prefix is case-insensitive).
pub fn looks_like_code(text: &str) -> bool {
  text
    .get(..PREFIX.len())
    .is_some_and(|prefix| prefix.eq_ignore_ascii_case(PREFIX))
}

pub fn encode(request: &PerfApplyRequest) -> Result<String, Error> {
  let (preset_id, entries) = match &request.source {
    PerfConfigSource::Preset { id } => (Some(id.clone()), Vec::new()),
    PerfConfigSource::Inline { definition } => (
      None,
      definition
        .entries
        .iter()
        .map(|entry| Ok((join_path(&entry.path)?, entry.value.clone())))
        .collect::<Result<Vec<_>, Error>>()?,
    ),
  };
  let overrides = request
    .overrides
    .iter()
    .map(compact_override)
    .collect::<Result<Vec<_>, Error>>()?;
  let payload = Payload {
    n: request.name.trim().to_string(),
    p: preset_id,
    e: entries,
    o: overrides,
    x: request.include_engine_sections,
  };
  check(&payload)?;
  let json = serde_json::to_vec(&payload)
    .map_err(|e| Error::PerformanceConfig(format!("Couldn't encode the share code: {e}")))?;
  let mut encoder = DeflateEncoder::new(Vec::new(), Compression::best());
  encoder.write_all(&json)?;
  let compressed = encoder.finish()?;
  let code = format!("{PREFIX}{VERSION}:{}", URL_SAFE_NO_PAD.encode(compressed));
  if code.len() > MAX_CODE_BYTES {
    return Err(Error::PerformanceConfig(
      "This config is too large for a share code".to_string(),
    ));
  }
  Ok(code)
}

pub fn decode(code: &str) -> Result<DecodedShare, Error> {
  let code = code.trim();
  if code.len() > MAX_CODE_BYTES {
    return Err(invalid("The share code is too long"));
  }
  if !looks_like_code(code) {
    return Err(invalid("Not a share code"));
  }
  let (version, data) = code[PREFIX.len()..]
    .split_once(':')
    .ok_or_else(|| invalid("The share code is incomplete"))?;
  if version != VERSION {
    return Err(Error::PerformanceConfig(
      "This share code was made by a newer version of Deadlock Mod Manager".to_string(),
    ));
  }
  // Chat apps wrap long lines and some tools add padding.
  let data: String = data.chars().filter(|char| !char.is_whitespace()).collect();
  let compressed = URL_SAFE_NO_PAD
    .decode(data.trim_end_matches('='))
    .map_err(|_| invalid("The share code is damaged"))?;
  let mut json = Vec::new();
  DeflateDecoder::new(compressed.as_slice())
    .take(MAX_JSON_BYTES + 1)
    .read_to_end(&mut json)
    .map_err(|_| invalid("The share code is damaged"))?;
  if json.len() as u64 > MAX_JSON_BYTES {
    return Err(invalid("The share code is too large"));
  }
  let payload: Payload =
    serde_json::from_slice(&json).map_err(|_| invalid("The share code is damaged"))?;
  check(&payload)
}

/// The entries that will be written, as blocks to paste into gameinfo.gi by
/// hand: ConVars first, then any engine sections the config edits.
pub fn snippet(resolved: &ResolvedConfig) -> String {
  let mut sections: Vec<SnippetNode> = Vec::new();
  for entry in resolved
    .entries
    .iter()
    .filter(|entry| entry.status == EntryStatus::Applies && entry.path.len() > 1)
  {
    insert_node(&mut sections, &entry.path, entry);
  }
  sections.sort_by_key(|section| !section.key.eq_ignore_ascii_case("ConVars"));
  let mut out = String::new();
  for section in &sections {
    if !out.is_empty() {
      out.push('\n');
    }
    out.push_str(&section.key);
    out.push_str("\n{\n");
    render_nodes(&section.children, 1, &mut out);
    out.push_str("}\n");
  }
  out
}

struct SnippetNode<'a> {
  key: String,
  value: Option<&'a ResolvedEntry>,
  children: Vec<SnippetNode<'a>>,
}

fn insert_node<'a>(nodes: &mut Vec<SnippetNode<'a>>, path: &[String], entry: &'a ResolvedEntry) {
  let Some((key, rest)) = path.split_first() else {
    return;
  };
  if rest.is_empty() {
    nodes.push(SnippetNode {
      key: key.clone(),
      value: Some(entry),
      children: Vec::new(),
    });
    return;
  }
  let position = match nodes
    .iter()
    .position(|node| node.value.is_none() && node.key.eq_ignore_ascii_case(key))
  {
    Some(position) => position,
    None => {
      nodes.push(SnippetNode {
        key: key.clone(),
        value: None,
        children: Vec::new(),
      });
      nodes.len() - 1
    }
  };
  insert_node(&mut nodes[position].children, rest, entry);
}

fn render_nodes(nodes: &[SnippetNode], depth: usize, out: &mut String) {
  let indent = "\t".repeat(depth);
  for node in nodes {
    match node.value {
      Some(entry) => match &entry.value {
        Some(value) => out.push_str(&format!("{indent}\"{}\"\t\t\"{value}\"\n", node.key)),
        None => out.push_str(&format!("{indent}// \"{}\"\n", node.key)),
      },
      None => {
        out.push_str(&format!("{indent}\"{}\"\n{indent}{{\n", node.key));
        render_nodes(&node.children, depth + 1, out);
        out.push_str(&format!("{indent}}}\n"));
      }
    }
  }
}

fn invalid(message: &str) -> Error {
  Error::InvalidInput(message.to_string())
}

fn join_path(path: &[String]) -> Result<String, Error> {
  if path.is_empty() || path.iter().any(|segment| segment.contains('/')) {
    return Err(Error::PerformanceConfig(format!(
      "Can't share the setting {path:?}"
    )));
  }
  Ok(path.join("/"))
}

fn compact_override(entry: &EntryOverride) -> Result<Vec<String>, Error> {
  let path = join_path(&entry.path)?;
  Ok(match &entry.action {
    OverrideAction::Set { value } => vec![path, "s".to_string(), value.clone()],
    OverrideAction::Omit => vec![path, "o".to_string()],
    OverrideAction::Enable => vec![path, "e".to_string()],
  })
}

/// Validates a payload and turns it into config data.
fn check(payload: &Payload) -> Result<DecodedShare, Error> {
  let name = payload.n.trim();
  if name.chars().count() > MAX_NAME_CHARS || name.chars().any(char::is_control) {
    return Err(invalid("The share code has an invalid name"));
  }
  if let Some(id) = &payload.p
    && (id.is_empty()
      || id.chars().count() > MAX_PRESET_ID_CHARS
      || !id
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_' | '.' | ':')))
  {
    return Err(invalid("The share code names an invalid preset"));
  }
  if payload.e.len() > MAX_ITEMS || payload.o.len() > MAX_ITEMS {
    return Err(invalid("The share code has too many settings"));
  }
  if payload.p.is_none() && payload.e.is_empty() && payload.o.is_empty() {
    return Err(invalid("The share code has no settings"));
  }

  let entries = payload
    .e
    .iter()
    .map(|(path, value)| {
      if value.as_deref().is_some_and(|value| !valid_value(value)) {
        return Err(invalid("The share code has an invalid value"));
      }
      Ok(ConfigEntry {
        path: split_path(path)?,
        value: value.clone(),
      })
    })
    .collect::<Result<Vec<_>, Error>>()?;

  let overrides = payload
    .o
    .iter()
    .map(|item| {
      let action = match item.as_slice() {
        [_, kind, value] if kind == "s" && valid_value(value) => OverrideAction::Set {
          value: value.clone(),
        },
        [_, kind] if kind == "o" => OverrideAction::Omit,
        [_, kind] if kind == "e" => OverrideAction::Enable,
        _ => return Err(invalid("The share code has an invalid change")),
      };
      Ok(EntryOverride {
        path: split_path(&item[0])?,
        action,
      })
    })
    .collect::<Result<Vec<_>, Error>>()?;

  Ok(DecodedShare {
    name: name.to_string(),
    preset_id: payload.p.clone(),
    entries,
    overrides,
    include_engine_sections: payload.x,
  })
}

fn split_path(path: &str) -> Result<Vec<String>, Error> {
  let segments: Vec<String> = path.split('/').map(str::to_string).collect();
  let valid = segments.len() <= MAX_PATH_DEPTH
    && segments.iter().all(|segment| {
      !segment.is_empty()
        && segment.chars().count() <= MAX_SEGMENT_CHARS
        && segment.chars().all(|char| {
          !char.is_control() && !char.is_whitespace() && !matches!(char, '"' | '{' | '}')
        })
    });
  if valid {
    Ok(segments)
  } else {
    Err(invalid("The share code has an invalid setting name"))
  }
}

fn valid_value(value: &str) -> bool {
  value.chars().count() <= MAX_VALUE_CHARS
    && value.chars().all(|char| !char.is_control() && char != '"')
}

#[cfg(test)]
#[path = "share_tests.rs"]
mod tests;
