//! Sqooky's `overrides.gi`: values to lock and keys to force commented out.

use super::kv::MAX_REPORTED_ERRORS;
use super::{ParsedConfig, ParsedLeaf, clean, truncate};
use crate::mod_manager::perf_config::types::{IgnoredKind, IgnoredPart, ImportFormat};

/// Grammar: blank and `#` lines are skipped; `// NAME [# note]` forces the
/// key to be commented out; `NAME VALUE [# note]` locks the value (quotes
/// dropped). A name both locked and commented is locked.
pub(super) fn parse_overrides(text: &str) -> ParsedConfig {
  let text = clean(text);
  let mut locked: Vec<ParsedLeaf> = Vec::new();
  let mut commented: Vec<ParsedLeaf> = Vec::new();
  let mut ignored = Vec::new();
  let mut unreadable_lines = 0;
  for (index, raw_line) in text.split('\n').enumerate() {
    let line = index as u32 + 1;
    let trimmed = raw_line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
      continue;
    }
    let parsed = match trimmed.strip_prefix("//") {
      Some(rest) => {
        let name = strip_hash_note(rest).trim();
        is_override_name(name).then_some((&mut commented, name, None))
      }
      None => match strip_hash_note(trimmed)
        .trim()
        .split_once(char::is_whitespace)
      {
        Some((name, value)) if is_override_name(name) => {
          Some((&mut locked, name, Some(unquote(value.trim()).to_string())))
        }
        _ => None,
      },
    };
    match parsed {
      Some((target, name, value)) => target.push(ParsedLeaf {
        path: vec!["ConVars".to_string(), name.to_string()],
        value,
        line,
      }),
      None => {
        unreadable_lines += 1;
        if unreadable_lines as usize <= MAX_REPORTED_ERRORS {
          ignored.push(IgnoredPart {
            kind: IgnoredKind::ParseError,
            detail: truncate(trimmed),
            line: Some(line),
          });
        }
      }
    }
  }
  commented.retain(|leaf| {
    !locked
      .iter()
      .any(|locked| locked.path[1].eq_ignore_ascii_case(&leaf.path[1]))
  });
  let mut leaves = commented;
  leaves.extend(locked);
  leaves.sort_by_key(|leaf| leaf.line);
  ParsedConfig {
    format: ImportFormat::OverridesGi,
    leaves,
    ignored,
    video_settings: Vec::new(),
    unreadable_lines,
  }
}

/// Cuts a trailing `# note`, which must follow whitespace.
pub(super) fn strip_hash_note(text: &str) -> &str {
  let bytes = text.as_bytes();
  (1..bytes.len())
    .find(|&i| bytes[i] == b'#' && bytes[i - 1].is_ascii_whitespace())
    .map_or(text, |i| &text[..i])
}

pub(super) fn is_override_name(name: &str) -> bool {
  !name.is_empty()
    && name
      .chars()
      .all(|char| char.is_alphanumeric() || char == '_')
}

fn unquote(value: &str) -> &str {
  value
    .strip_prefix('"')
    .and_then(|rest| rest.strip_suffix('"'))
    .unwrap_or(value)
}
