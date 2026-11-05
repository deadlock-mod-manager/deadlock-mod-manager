//! Parsers for the text formats a config can arrive in: full gameinfo.gi,
//! ConVars snippets, cfg / autoexec lines, Sqooky's `overrides.gi` and
//! video.txt. Share codes are decoded in [`super::share`].
//!
//! Community files are messy: unquoted keys, stray braces, duplicate keys,
//! mixed line endings, prose that lost its `//`, translated comments. Every
//! parser is tolerant, so a line it can't read is skipped and reported as an
//! [`IgnoredPart`] instead of failing the file.

use std::borrow::Cow;
use std::collections::HashMap;

use super::live::{path_key, values_equal};
use super::types::{ConfigEntry, IgnoredKind, IgnoredPart, ImportFormat, VideoSetting};

mod cfg;
mod detect;
mod gameinfo;
mod kv;
mod overrides;
mod video;

use cfg::parse_cfg;
pub use detect::detect_format;
use gameinfo::parse_gameinfo;
use overrides::parse_overrides;
use video::parse_video;

/// One value a file sets, and where.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedLeaf {
  pub path: Vec<String>,
  /// `None` when the file forces the key to be commented out, which only
  /// `overrides.gi` can express.
  pub value: Option<String>,
  pub line: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedConfig {
  /// `FullGameinfo` only when the file has a `GameInfo` root and the sections
  /// of a whole file; a partial one parses as `ConvarsSnippet`.
  pub format: ImportFormat,
  /// Every value in file order, duplicates included. Gameinfo paths start
  /// below `GameInfo`; values from cfg, overrides.gi and bare snippets sit
  /// under `ConVars`.
  pub leaves: Vec<ParsedLeaf>,
  pub ignored: Vec<IgnoredPart>,
  pub video_settings: Vec<VideoSetting>,
  /// Lines that couldn't be read, including any beyond the first
  /// [`kv::MAX_REPORTED_ERRORS`] that `ignored` lists.
  pub unreadable_lines: u32,
}

const DETAIL_MAX_CHARS: usize = 160;

/// Parses `text` as `format`. Share codes and archives have no text form here.
pub fn parse(text: &str, format: ImportFormat) -> ParsedConfig {
  match format {
    ImportFormat::FullGameinfo | ImportFormat::ConvarsSnippet => parse_gameinfo(text),
    ImportFormat::Cfg => parse_cfg(text),
    ImportFormat::OverridesGi => parse_overrides(text),
    ImportFormat::VideoTxt => parse_video(text),
    ImportFormat::ShareCode | ImportFormat::Archive => ParsedConfig {
      format,
      leaves: Vec::new(),
      ignored: Vec::new(),
      video_settings: Vec::new(),
      unreadable_lines: 0,
    },
  }
}

/// Config bytes as text: UTF-16 when it has a BOM, else UTF-8 with the BOM
/// dropped. Invalid bytes are replaced; non-ASCII only matters in comments.
pub fn decode_text(bytes: &[u8]) -> String {
  if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
    return decode_utf16(rest, u16::from_le_bytes);
  }
  if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
    return decode_utf16(rest, u16::from_be_bytes);
  }
  let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
  String::from_utf8_lossy(bytes).into_owned()
}

/// The last value per path (paths compare case-insensitively, as the engine
/// does), in the order each path first appears, plus a `DuplicateKey` part
/// for every earlier value a later line replaces with a different one.
pub fn collapse(leaves: &[ParsedLeaf]) -> (Vec<ConfigEntry>, Vec<IgnoredPart>) {
  let mut entries: Vec<ConfigEntry> = Vec::new();
  let mut lines: Vec<u32> = Vec::new();
  let mut positions: HashMap<String, usize> = HashMap::new();
  let mut duplicates = Vec::new();
  for leaf in leaves {
    let key = path_key(&leaf.path);
    if let Some(&position) = positions.get(&key) {
      let entry = &mut entries[position];
      if !same_value(entry.value.as_deref(), leaf.value.as_deref()) {
        duplicates.push(IgnoredPart {
          kind: IgnoredKind::DuplicateKey,
          detail: truncate(&format!(
            "{} = {}",
            entry.path.join("/"),
            entry.value.as_deref().unwrap_or_default()
          )),
          line: Some(lines[position]),
        });
      }
      entry.value = leaf.value.clone();
      lines[position] = leaf.line;
    } else {
      positions.insert(key, entries.len());
      entries.push(ConfigEntry {
        path: leaf.path.clone(),
        value: leaf.value.clone(),
      });
      lines.push(leaf.line);
    }
  }
  (entries, duplicates)
}

fn same_value(a: Option<&str>, b: Option<&str>) -> bool {
  match (a, b) {
    (Some(a), Some(b)) => values_equal(a, b),
    (None, None) => true,
    _ => false,
  }
}

fn decode_utf16(bytes: &[u8], read: fn([u8; 2]) -> u16) -> String {
  let units = bytes.as_chunks::<2>().0.iter().map(|pair| read(*pair));
  char::decode_utf16(units)
    .map(|unit| unit.unwrap_or(char::REPLACEMENT_CHARACTER))
    .collect()
}

/// Drops stray byte-order marks and turns non-breaking spaces (pasted from
/// web pages) into spaces.
fn clean(text: &str) -> Cow<'_, str> {
  if text.contains(['\u{feff}', '\u{a0}']) {
    Cow::Owned(text.replace('\u{feff}', "").replace('\u{a0}', " "))
  } else {
    Cow::Borrowed(text)
  }
}

fn base_name_lowercase(file_name: &str) -> String {
  file_name
    .rsplit(['/', '\\'])
    .next()
    .unwrap_or(file_name)
    .to_lowercase()
}

fn truncate(text: &str) -> String {
  match text.char_indices().nth(DETAIL_MAX_CHARS) {
    Some((end, _)) => format!("{}…", &text[..end]),
    None => text.to_string(),
  }
}

#[cfg(test)]
#[path = "import_test_support.rs"]
pub(crate) mod import_test_support;

#[cfg(test)]
#[path = "formats_tests.rs"]
mod tests;
