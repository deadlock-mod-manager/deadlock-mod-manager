//! The marker grammar and the text edits that apply or remove an overlay.
//!
//! Grammar (`<indent>` follows the entries around it; `<tab>` is a tab):
//!
//! ```text
//!   ConVars
//!   {
//!     // ==== Deadlock Mod Manager · Performance BEGIN (config=<id> rev=<12 hex>) ====
//!     // <name>: <credit line> [dmm-perf]
//!     // <credit line> [dmm-perf]
//!     "new_key"<tab><tab>"value"
//!     // ==== Deadlock Mod Manager · Performance END ====
//!     "fps_max"<tab><tab>"0" // dmm-perf was "400"
//!     // dmm-perf removed: "some_key" "1"
//!     "rate"
//!     {
//!       "max"<tab><tab>"2000000" // dmm-perf was "1000000"
//!       "version"<tab><tab>"2" // dmm-perf added
//!     }
//!   }
//!   SceneSystem
//!   {
//!     CSMCascadeResolution 512 // dmm-perf was 2048
//!     "NewKey"<tab><tab>"1" // dmm-perf added
//!   }
//! ```
//!
//! - The BEGIN/END block goes right after the `ConVars {` line whenever the
//!   overlay changes anything, because it is what tells a reader which config
//!   and revision the file carries. New top-level ConVars keys go inside it.
//! - Keys the file already has are edited in place at every occurrence (the
//!   engine reads the last one, so leaving another one behind would make the
//!   result depend on order) and are never also injected. Only the value token
//!   changes; quoting, spacing and trailing comments stay. `was` records the
//!   original token verbatim, quotes included.
//! - New keys in other blocks go before the block's closing brace.
//! - Removal works from the file alone: drop the block, the credit lines and
//!   the `added` lines, restore `was` tokens, uncomment `removed:` lines. Every
//!   line keeps its own line ending, so the result is byte-identical to the
//!   file before apply, mixed line endings and a missing final newline
//!   included.
//! - Nothing we write contains `citadel/addons`, `SearchPaths` or the
//!   SearchPaths markers, which other code looks for anywhere in the file, and
//!   nothing is ever written inside `FileSystem`.

use std::borrow::Cow;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::ops::Range;
use std::sync::LazyLock;

use kv_parser::{AstNode, ParseOptions, Parser, ValueNode};
use regex::Regex;

use super::live::{path_key, values_equal};
use super::types::{AppliedOverlay, ForeignOverlay, ForeignTool, ResolvedEntry};
use crate::errors::Error;

pub const BEGIN_MARKER: &str = "// ==== Deadlock Mod Manager · Performance BEGIN";
pub const END_MARKER: &str = "// ==== Deadlock Mod Manager · Performance END ====";
const END_MARKER_PREFIX: &str = "// ==== Deadlock Mod Manager · Performance END";
const CREDIT_TAG: &str = "[dmm-perf]";
const WAS_TAG: &str = " // dmm-perf was ";
const ADDED_TAG: &str = " // dmm-perf added";
const REMOVED_TAG: &str = "// dmm-perf removed: ";
const OWN_TAG: &str = "dmm-perf";

/// Strings other code searches the whole file for. Writing one in a comment or
/// a value would make DMM think mods are mounted or move its SearchPaths edit.
const RESERVED: [&str; 4] = [
  "citadel/addons",
  "SearchPaths",
  "// Deadlock Mod Manager - Start",
  "// Deadlock Mod Manager - End",
];

/// Lower-case fragments neutralized in free text we write as comments, so a
/// config name can't spell a marker that we or another tool act on.
const NEUTRALIZED: [(&str, &str); 9] = [
  ("citadel/addons", "citadel addons"),
  ("searchpaths", "search paths"),
  ("deadlock mod manager - start", "deadlock mod manager start"),
  ("deadlock mod manager - end", "deadlock mod manager end"),
  ("dmm-perf", "dmm perf"),
  ("grimoire-perf", "grimoire perf"),
  ("grimoire performance config", "grimoire performance-config"),
  ("optimizationspreset", "optimizations preset"),
  ("===", "=="),
];

pub struct OverlayPlan<'a> {
  pub config_id: &'a str,
  pub name: &'a str,
  pub rev: &'a str,
  /// Entries with status `Applies`.
  pub entries: Vec<&'a ResolvedEntry>,
  /// Credit lines written under the BEGIN marker (author, source, licence).
  pub credits: Vec<String>,
}

/// Removes our overlay, returning the text without it and what it described.
pub fn strip_overlay(text: &str) -> (String, Option<AppliedOverlay>) {
  let applied = read_overlay(text);
  if !mentions_own_markers(text) {
    return (text.to_string(), applied);
  }
  let lines = split_lines(text);
  let mut out = String::with_capacity(text.len());
  let mut index = 0;
  while index < lines.len() {
    let line = lines[index];
    if classify(line.content) == OwnLine::Begin {
      index = block_end(&lines, index).unwrap_or(index) + 1;
      continue;
    }
    if let Some(content) = strip_line(line.content) {
      out.push_str(&content);
      out.push_str(line.eol);
    }
    index += 1;
  }
  (out, applied)
}

/// `line` without our markers, or `None` for a line only we wrote. Hand edits
/// and other tools can stack text on our lines (a note after `added`, a second
/// `was`, Grimoire's tag after ours), so the line is unwound until no marker
/// is left; the first `was` holds the value from before any of them.
fn strip_line(line: &str) -> Option<Cow<'_, str>> {
  let mut current = Cow::Borrowed(line);
  for _ in 0..=line.matches(OWN_TAG).count() {
    current = match classify(&current) {
      OwnLine::Begin | OwnLine::End | OwnLine::Credit | OwnLine::Added => return None,
      OwnLine::Removed => Cow::Owned(restore_removed(&current)),
      OwnLine::Was => Cow::Owned(restore_was(&current)),
      OwnLine::Other => break,
    };
  }
  Some(current)
}

/// The first line `strip_overlay` would act on, or any BEGIN/END marker, as
/// `line N: <text>`.
fn own_leftover(text: &str) -> Option<String> {
  if !mentions_own_markers(text) {
    return None;
  }
  split_lines(text)
    .iter()
    .enumerate()
    .find_map(|(index, line)| {
      let marked = classify(line.content) != OwnLine::Other
        || line.content.contains(BEGIN_MARKER)
        || line.content.contains(END_MARKER_PREFIX);
      marked.then(|| format!("line {}: {}", index + 1, line.content.trim()))
    })
}

/// What our markers say about the overlay in `text`, or `None` without a
/// BEGIN marker.
///
/// `hand_edited` is best effort. Markers record original values, not the ones
/// we wrote, so a value changed by hand inside the block or on a `was` line is
/// indistinguishable from ours. What the file alone does show: a `was` line
/// set back to its original value, and marked lines that were commented out
/// or no longer read as `key value`.
pub fn read_overlay(text: &str) -> Option<AppliedOverlay> {
  if !text.contains(BEGIN_MARKER) {
    return None;
  }
  let lines = split_lines(text);
  let begin = lines
    .iter()
    .position(|line| classify(line.content) == OwnLine::Begin)?;
  let (config_id, rev) = parse_begin(lines[begin].content);
  let sites = parse_sites(text).ok();
  let starts = line_starts(&lines);
  let mut line_count = 0;
  let mut hand_edited = Vec::new();
  let mut seen = HashSet::new();
  let mut flag = |path: Vec<String>| {
    if seen.insert(path_key(&path)) {
      hand_edited.push(path);
    }
  };

  let mut index = 0;
  while index < lines.len() {
    let content = lines[index].content;
    match classify(content) {
      OwnLine::Begin => {
        let end = block_end(&lines, index);
        let last = end.unwrap_or(index);
        line_count += last - index + 1;
        if let Some(end) = end {
          for inner in &lines[index + 1..end] {
            if inner.content.trim().is_empty() || classify(inner.content) == OwnLine::Credit {
              continue;
            }
            if !is_clean_entry(inner.content)
              && let Some(key) = commented_key(inner.content)
            {
              flag(vec!["ConVars".to_string(), key]);
            }
          }
        }
        index = last + 1;
        continue;
      }
      OwnLine::End | OwnLine::Credit | OwnLine::Removed => line_count += 1,
      OwnLine::Added => {
        line_count += 1;
        if parse_entry_line(content).is_none()
          && let Some(key) = commented_key(content)
        {
          flag(path_at(sites.as_deref(), starts[index], key));
        }
      }
      OwnLine::Was => {
        line_count += 1;
        let (head, original) = split_was(content);
        match parse_entry_line(head) {
          Some(entry) => {
            let reverted = original
              .and_then(|token| read_token(token, 0))
              .is_some_and(|(_, original)| values_equal(entry.value, original));
            if reverted {
              flag(path_at(
                sites.as_deref(),
                starts[index],
                entry.key.to_string(),
              ));
            }
          }
          None => {
            if let Some(key) = commented_key(head) {
              flag(path_at(sites.as_deref(), starts[index], key));
            }
          }
        }
      }
      OwnLine::Other => {}
    }
    index += 1;
  }

  Some(AppliedOverlay {
    config_id,
    rev,
    line_count: line_count as u32,
    hand_edited,
  })
}

/// Applies `plan` to `base`, which must not carry our overlay. Fails rather
/// than writing a file that doesn't parse or doesn't strip back to `base`.
pub fn apply_overlay(base: &str, plan: &OverlayPlan) -> Result<String, Error> {
  if let Some(leftover) = own_leftover(base) {
    return Err(fail(format!(
      "gameinfo.gi still carries a performance config ({leftover})"
    )));
  }
  let sites = parse_sites(base)?;
  let lines = split_lines(base);
  let starts = line_starts(&lines);
  let line_of = |offset: usize| line_at(&starts, offset);
  let fallback_eol = default_eol(base);

  let mut entries: Vec<&ResolvedEntry> = Vec::new();
  let mut positions: HashMap<String, usize> = HashMap::new();
  for &entry in &plan.entries {
    match positions.get(&path_key(&entry.path)) {
      Some(&position) => entries[position] = entry,
      None => {
        positions.insert(path_key(&entry.path), entries.len());
        entries.push(entry);
      }
    }
  }

  let mut edits: BTreeMap<usize, String> = BTreeMap::new();
  let mut before: BTreeMap<usize, Vec<String>> = BTreeMap::new();
  let mut injected: Vec<String> = Vec::new();

  for entry in &entries {
    check_writable(entry)?;
    let shown = entry.path.join("/");
    let occurrences: Vec<(usize, &Range<usize>)> = sites
      .iter()
      .filter_map(|site| match &site.kind {
        SiteKind::Scalar { value_range, .. } if path_eq(&site.path, &entry.path) => {
          Some((site.key_start, value_range))
        }
        _ => None,
      })
      .collect();
    if !occurrences.is_empty() {
      for (key_start, value_range) in occurrences {
        let line = line_of(key_start);
        let local = value_range.start - starts[line]..value_range.end - starts[line];
        let edited = edit_line(lines[line].content, local, entry.value.as_deref())
          .ok_or_else(|| fail(format!("{shown} shares its line with other entries")))?;
        edits.insert(line, edited);
      }
      continue;
    }

    let Some(value) = entry.value.as_deref() else {
      continue;
    };
    if sites.iter().any(|site| path_eq(&site.path, &entry.path)) {
      return Err(fail(format!(
        "{shown} is a block in gameinfo.gi, not a value"
      )));
    }
    let (parent, key) = entry.path.split_at(entry.path.len() - 1);
    let key = &key[0];
    if parent.len() == 1 && parent[0].eq_ignore_ascii_case("ConVars") {
      injected.push(format_entry(key, value));
      continue;
    }

    let (parent_site, open, close) = sites
      .iter()
      .rev()
      .find_map(|site| match site.kind {
        SiteKind::Object { open, close } if path_eq(&site.path, parent) => {
          Some((site, open, close))
        }
        _ => None,
      })
      .ok_or_else(|| fail(format!("gameinfo.gi has no {} block", parent.join("/"))))?;
    let close_line = line_of(close);
    let before_close = &lines[close_line].content[..close - starts[close_line]];
    if line_of(open) == close_line || before_close.contains(['{', '}']) {
      return Err(fail(format!(
        "can't add {shown}: the {} block closes on a shared line",
        parent.join("/")
      )));
    }
    let indent = child_indent(&sites, parent_site, &lines, &starts)
      .unwrap_or_else(|| format!("{}\t", indent_of(lines[close_line].content)));
    before
      .entry(close_line)
      .or_default()
      .push(format!("{indent}{}{ADDED_TAG}", format_entry(key, value)));
  }

  let (convars, open, close) = sites
    .iter()
    .find_map(|site| match site.kind {
      SiteKind::Object { open, close }
        if site.path.len() == 1 && site.path[0].eq_ignore_ascii_case("ConVars") =>
      {
        Some((site, open, close))
      }
      _ => None,
    })
    .ok_or_else(|| fail("gameinfo.gi has no ConVars block"))?;
  let anchor = line_of(open);
  if line_of(close) == anchor {
    return Err(fail("the ConVars block opens and closes on one line"));
  }
  let indent = child_indent(&sites, convars, &lines, &starts)
    .unwrap_or_else(|| format!("{}\t", indent_of(lines[anchor].content)));
  let mut block = vec![format!(
    "{indent}{BEGIN_MARKER} (config={} rev={}) ====",
    marker_config_id(plan.config_id),
    sanitize_comment(plan.rev)
  )];
  let name = sanitize_comment(plan.name);
  let mut credits = plan.credits.iter().map(|credit| sanitize_comment(credit));
  match credits.next() {
    Some(first) => block.push(format!("{indent}// {name}: {first} {CREDIT_TAG}")),
    None => block.push(format!("{indent}// {name} {CREDIT_TAG}")),
  }
  block.extend(credits.map(|credit| format!("{indent}// {credit} {CREDIT_TAG}")));
  block.extend(injected.iter().map(|line| format!("{indent}{line}")));
  block.push(format!("{indent}{END_MARKER}"));

  let mut out = String::with_capacity(base.len() + block.len() * 48);
  for (index, line) in lines.iter().enumerate() {
    let eol = if line.eol.is_empty() {
      fallback_eol
    } else {
      line.eol
    };
    for inserted in before.get(&index).into_iter().flatten() {
      out.push_str(inserted);
      out.push_str(eol);
    }
    out.push_str(edits.get(&index).map_or(line.content, String::as_str));
    out.push_str(line.eol);
    if index == anchor {
      for inserted in &block {
        out.push_str(inserted);
        out.push_str(eol);
      }
    }
  }

  verify(base, &sites, &out, &entries)?;
  Ok(out)
}

/// The config id as the BEGIN marker records it.
pub fn marker_config_id(config_id: &str) -> String {
  sanitize_comment(config_id)
    .chars()
    .map(|ch| {
      if ch.is_ascii_alphanumeric() || matches!(ch, ':' | '_' | '.' | '-' | '@') {
        ch
      } else {
        '_'
      }
    })
    .collect()
}

/// Whether a path segment can be written as a gameinfo.gi key.
pub fn is_writable_key(key: &str) -> bool {
  !key.is_empty()
    && key
      .chars()
      .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.' | '-'))
    && !contains_reserved(key)
}

/// Whether a value can be written between quotes without changing how the
/// file parses or what other code finds in it.
pub fn is_writable_value(value: &str) -> bool {
  !value
    .chars()
    .any(|ch| ch.is_control() || matches!(ch, '"' | '\\' | '{' | '}'))
    && !value.contains("//")
    && !value.contains("/*")
    && !contains_reserved(value)
    && !value.contains(OWN_TAG)
    && !value.contains(GRIMOIRE_TAG)
}

/// Overlays written by Grimoire, DeadTune, Sqooky's updater or gameinfo-editor.
pub fn detect_foreign(text: &str) -> Vec<ForeignOverlay> {
  let lines = split_lines(text);
  let mut found = Vec::new();

  let grimoire_lines = lines
    .iter()
    .filter(|line| grimoire_line(line.content) != GrimoireLine::Keep)
    .count();
  if grimoire_lines > 0 {
    let label = lines.iter().find_map(|line| {
      let captures = GRIMOIRE_BEGIN.captures(line.content)?;
      Some(format!("{} v{}", &captures[1], &captures[2]))
    });
    found.push(ForeignOverlay {
      tool: ForeignTool::Grimoire,
      label,
      line_count: grimoire_lines as u32,
    });
  }

  for marker in BLOCK_TOOLS {
    let line_count: usize = find_blocks(&lines, marker.header, marker.footer)
      .iter()
      .map(|range| range.end - range.start)
      .sum();
    if line_count > 0 {
      found.push(ForeignOverlay {
        tool: marker.tool,
        label: None,
        line_count: line_count as u32,
      });
    }
  }
  found
}

/// Removes those overlays, restoring the values their markers recorded.
///
/// Grimoire marks every line, so its edits are undone exactly. DeadTune,
/// Sqooky's updater and gameinfo-editor only mark the block of keys they
/// added; their in-place edits carry no record of the original and stay.
pub fn strip_foreign(text: &str) -> (String, Vec<ForeignOverlay>) {
  let found = detect_foreign(text);
  if found.is_empty() {
    return (text.to_string(), found);
  }
  let mut lines: Vec<OwnedLine> = split_lines(text)
    .into_iter()
    .filter_map(|line| {
      let content = match grimoire_line(line.content) {
        GrimoireLine::Drop => return None,
        GrimoireLine::Replace(content) => content,
        GrimoireLine::Keep => line.content.to_string(),
      };
      Some(OwnedLine {
        content,
        eol: line.eol.to_string(),
      })
    })
    .collect();

  for marker in BLOCK_TOOLS {
    let borrowed: Vec<Line> = lines
      .iter()
      .map(|line| Line {
        content: &line.content,
        eol: &line.eol,
      })
      .collect();
    let blocks = find_blocks(&borrowed, marker.header, marker.footer);
    for range in blocks.into_iter().rev() {
      let (start, end) = (range.start, range.end);
      let rejoin = marker.inserted_after_brace
        && start > 0
        && lines
          .get(end)
          .is_some_and(|next| next.content.trim().is_empty());
      if rejoin {
        let next = lines.remove(end);
        lines[start - 1].content.push_str(&next.content);
        lines[start - 1].eol = next.eol;
      }
      lines.drain(start..end);
    }
  }

  let mut out = String::with_capacity(text.len());
  for line in &lines {
    out.push_str(&line.content);
    out.push_str(&line.eol);
  }
  (out, found)
}

/// One scalar or block in a parsed gameinfo.gi, by its path below the root.
pub(crate) struct Site {
  pub path: Vec<String>,
  /// Byte offset of the key token.
  pub key_start: usize,
  pub kind: SiteKind,
}

pub(crate) enum SiteKind {
  /// `value` has no quotes; `value_range` covers the raw token in the text.
  Scalar {
    value: String,
    value_range: Range<usize>,
  },
  /// Byte offsets of the braces.
  Object { open: usize, close: usize },
}

/// Every key/value and block below the root block, in file order.
///
/// Escape sequences are off: the engine reads backslashes in gameinfo.gi
/// literally, and so do the other tools that edit it. A byte-order mark (an
/// editor saving the file as "UTF-8 with BOM") is skipped.
pub(crate) fn parse_sites(text: &str) -> Result<Vec<Site>, Error> {
  let bom = if text.starts_with('\u{feff}') {
    '\u{feff}'.len_utf8()
  } else {
    0
  };
  let body = &text[bom..];
  let options = ParseOptions {
    allow_escape_sequences: false,
    allow_conditionals: true,
    allow_includes: true,
  };
  let parsed = Parser::parse(body, options)
    .map_err(|error| fail(format!("gameinfo.gi could not be parsed: {error}")))?;
  let root = parsed
    .ast
    .children
    .iter()
    .find_map(|node| match node {
      AstNode::KeyValue(pair) => match &pair.value {
        ValueNode::Object(object) => Some(object),
        _ => None,
      },
      _ => None,
    })
    .ok_or_else(|| fail("gameinfo.gi has no GameInfo block"))?;
  let offsets = CharOffsets::new(body, bom);
  let mut sites = Vec::new();
  collect_sites(&root.children, &mut Vec::new(), &offsets, &mut sites);
  Ok(sites)
}

fn collect_sites(
  children: &[AstNode],
  path: &mut Vec<String>,
  offsets: &CharOffsets,
  sites: &mut Vec<Site>,
) {
  for child in children {
    let AstNode::KeyValue(pair) = child else {
      continue;
    };
    path.push(pair.key.value.clone());
    let key_start = offsets.byte(pair.key.start.offset);
    let scalar = |value: String, start: usize, raw: &str| SiteKind::Scalar {
      value,
      value_range: offsets.byte(start)..offsets.byte(start + raw.chars().count()),
    };
    match &pair.value {
      ValueNode::Object(object) => {
        sites.push(Site {
          path: path.clone(),
          key_start,
          kind: SiteKind::Object {
            open: offsets.byte(object.open_brace.start.offset),
            close: offsets.byte(object.close_brace.start.offset),
          },
        });
        collect_sites(&object.children, path, offsets, sites);
      }
      ValueNode::String(node) => sites.push(Site {
        path: path.clone(),
        key_start,
        kind: scalar(node.value.clone(), node.start.offset, &node.raw),
      }),
      ValueNode::Number(node) => sites.push(Site {
        path: path.clone(),
        key_start,
        kind: scalar(node.raw.clone(), node.start.offset, &node.raw),
      }),
    }
    path.pop();
  }
}

/// kv-parser reports offsets in chars of what it parsed; we edit bytes of the
/// whole file.
struct CharOffsets {
  bytes: Option<Vec<usize>>,
  shift: usize,
}

impl CharOffsets {
  fn new(parsed: &str, shift: usize) -> Self {
    let bytes = (!parsed.is_ascii()).then(|| {
      let mut bytes: Vec<usize> = parsed.char_indices().map(|(byte, _)| byte).collect();
      bytes.push(parsed.len());
      bytes
    });
    Self { bytes, shift }
  }

  fn byte(&self, char_offset: usize) -> usize {
    let byte = match &self.bytes {
      None => char_offset,
      Some(bytes) => bytes[char_offset.min(bytes.len() - 1)],
    };
    byte + self.shift
  }
}

#[derive(Clone, Copy)]
struct Line<'a> {
  content: &'a str,
  eol: &'a str,
}

struct OwnedLine {
  content: String,
  eol: String,
}

/// Lines with their own endings; concatenating `content + eol` gives `text`.
fn split_lines(text: &str) -> Vec<Line<'_>> {
  let mut lines = Vec::new();
  let mut rest = text;
  while !rest.is_empty() {
    match rest.find('\n') {
      Some(newline) => {
        let content_end = if newline > 0 && rest.as_bytes()[newline - 1] == b'\r' {
          newline - 1
        } else {
          newline
        };
        lines.push(Line {
          content: &rest[..content_end],
          eol: &rest[content_end..=newline],
        });
        rest = &rest[newline + 1..];
      }
      None => {
        lines.push(Line {
          content: rest,
          eol: "",
        });
        break;
      }
    }
  }
  lines
}

/// The line holding byte `offset`, given each line's start.
fn line_at(starts: &[usize], offset: usize) -> usize {
  starts.partition_point(|&start| start <= offset) - 1
}

fn line_starts(lines: &[Line]) -> Vec<usize> {
  let mut starts = Vec::with_capacity(lines.len());
  let mut offset = 0;
  for line in lines {
    starts.push(offset);
    offset += line.content.len() + line.eol.len();
  }
  starts
}

fn default_eol(text: &str) -> &'static str {
  if text.contains("\r\n") { "\r\n" } else { "\n" }
}

fn indent_of(content: &str) -> &str {
  &content[..content.len() - content.trim_start_matches([' ', '\t']).len()]
}

/// Indentation of the block's first entry, when that entry starts its line.
fn child_indent(sites: &[Site], parent: &Site, lines: &[Line], starts: &[usize]) -> Option<String> {
  let SiteKind::Object { open, close } = parent.kind else {
    return None;
  };
  let child = sites.iter().find(|site| {
    site.path.len() == parent.path.len() + 1 && site.key_start > open && site.key_start < close
  })?;
  let line = line_at(starts, child.key_start);
  let indent = indent_of(lines[line].content);
  (starts[line] + indent.len() == child.key_start).then(|| indent.to_string())
}

fn path_eq(a: &[String], b: &[String]) -> bool {
  a.len() == b.len() && a.iter().zip(b).all(|(a, b)| a.eq_ignore_ascii_case(b))
}

fn format_entry(key: &str, value: &str) -> String {
  format!("\"{key}\"\t\t\"{value}\"")
}

/// `content` with the value token at `value` replaced, or commented out for
/// `None`. `None` when the line holds more than this one entry.
fn edit_line(content: &str, value: Range<usize>, new_value: Option<&str>) -> Option<String> {
  let entry = parse_entry_line(content)?;
  if entry.value_range != value {
    return None;
  }
  let rest = entry.rest.trim_start_matches([' ', '\t']);
  if !(rest.is_empty() || rest.starts_with("//") || rest.starts_with("/*") || rest.starts_with('['))
  {
    return None;
  }
  match new_value {
    Some(new_value) => {
      let original = &content[value.clone()];
      let token = if original.starts_with('"') || !is_bare_token(new_value) {
        format!("\"{new_value}\"")
      } else {
        new_value.to_string()
      };
      Some(format!(
        "{}{token}{}{WAS_TAG}{original}",
        &content[..value.start],
        &content[value.end..]
      ))
    }
    None => {
      let indent = indent_of(content);
      Some(format!("{indent}{REMOVED_TAG}{}", &content[indent.len()..]))
    }
  }
}

/// Whether `value` reads back as this one token without quotes. To the engine
/// a `[` after a bare token starts a conditional (`40[$X360]`).
fn is_bare_token(value: &str) -> bool {
  !value.is_empty()
    && !value.starts_with('#')
    && !value.contains("//")
    && !value.contains("/*")
    && !value
      .chars()
      .any(|ch| ch.is_whitespace() || matches!(ch, '"' | '{' | '}' | '[' | ']'))
}

fn check_writable(entry: &ResolvedEntry) -> Result<(), Error> {
  let shown = entry.path.join("/");
  if entry.path.len() < 2 {
    return Err(fail(format!("{shown} is not inside a block")));
  }
  if entry.path[0].eq_ignore_ascii_case("FileSystem") {
    return Err(fail(format!(
      "{shown} is in FileSystem, which we never edit"
    )));
  }
  if !entry.path.iter().all(|part| is_writable_key(part)) {
    return Err(fail(format!(
      "{shown} can't be written as a gameinfo.gi key"
    )));
  }
  if entry
    .value
    .as_deref()
    .is_some_and(|value| !is_writable_value(value))
  {
    return Err(fail(format!("the value for {shown} can't be written")));
  }
  Ok(())
}

/// The checks every patched file passes before it may be written.
fn verify(
  base: &str,
  base_sites: &[Site],
  patched: &str,
  entries: &[&ResolvedEntry],
) -> Result<(), Error> {
  if brace_count(base) != brace_count(patched) {
    return Err(fail("the patch would unbalance gameinfo.gi"));
  }
  for reserved in RESERVED {
    if base.matches(reserved).count() != patched.matches(reserved).count() {
      return Err(fail(format!(
        "the patch would change what {reserved:?} finds"
      )));
    }
  }
  if strip_overlay(patched).0 != base {
    return Err(fail("the patch would not remove cleanly"));
  }

  let patched_sites = parse_sites(patched)?;
  let mut expected = scalar_values(base_sites);
  for entry in entries {
    match &entry.value {
      Some(value) => expected.insert(path_key(&entry.path), value.clone()),
      None => expected.remove(&path_key(&entry.path)),
    };
  }
  let actual = scalar_values(&patched_sites);
  if let Some((path, value)) = expected
    .iter()
    .find(|(path, value)| actual.get(*path) != Some(*value))
  {
    return Err(fail(format!(
      "the patch would set {path} to {:?} instead of {value:?}",
      actual.get(path)
    )));
  }
  if let Some(path) = actual.keys().find(|path| !expected.contains_key(*path)) {
    return Err(fail(format!("the patch would add an unplanned {path}")));
  }
  let blocks = |sites: &[Site]| -> HashSet<String> {
    sites
      .iter()
      .filter(|site| matches!(site.kind, SiteKind::Object { .. }))
      .map(|site| path_key(&site.path))
      .collect()
  };
  if blocks(base_sites) != blocks(&patched_sites) {
    return Err(fail("the patch would change gameinfo.gi's blocks"));
  }
  Ok(())
}

/// The checks `original` with our overlay stripped passes before it may be
/// written. None of our lines holds a brace, so losing one means a line we
/// drop was edited into something else.
pub fn verify_stripped(original: &str, stripped: &str) -> Result<(), Error> {
  if brace_count(original) != brace_count(stripped) {
    return Err(fail(
      "removing the performance config would unbalance gameinfo.gi",
    ));
  }
  parse_sites(stripped).map(|_| ())
}

fn brace_count(text: &str) -> usize {
  text.chars().filter(|ch| matches!(ch, '{' | '}')).count()
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

fn contains_reserved(text: &str) -> bool {
  let lower = text.to_ascii_lowercase();
  RESERVED
    .iter()
    .any(|reserved| lower.contains(&reserved.to_ascii_lowercase()))
}

/// Free text made safe for a `//` comment line we own.
fn sanitize_comment(text: &str) -> String {
  let mut out: String = text
    .chars()
    .map(|ch| match ch {
      '{' => '(',
      '}' => ')',
      ch if ch.is_control() => ' ',
      ch => ch,
    })
    .collect::<String>()
    .trim()
    .to_string();
  for (pattern, replacement) in NEUTRALIZED {
    while let Some(start) = out.to_ascii_lowercase().find(pattern) {
      out.replace_range(start..start + pattern.len(), replacement);
    }
  }
  out
}

fn fail(message: impl Into<String>) -> Error {
  Error::PerformanceConfig(message.into())
}

fn mentions_own_markers(text: &str) -> bool {
  text.contains(OWN_TAG) || text.contains(BEGIN_MARKER) || text.contains(END_MARKER_PREFIX)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OwnLine {
  Begin,
  End,
  Credit,
  Added,
  Removed,
  Was,
  Other,
}

/// Tags are found anywhere on the line: text after them (a note, another
/// tool's marker) doesn't make the line any less ours.
fn classify(content: &str) -> OwnLine {
  let trimmed = content.trim_start_matches([' ', '\t']);
  if trimmed.starts_with(BEGIN_MARKER) {
    OwnLine::Begin
  } else if trimmed.starts_with(END_MARKER_PREFIX) {
    OwnLine::End
  } else if trimmed.starts_with(REMOVED_TAG) {
    OwnLine::Removed
  } else if trimmed.starts_with("//") && content.contains(CREDIT_TAG) {
    OwnLine::Credit
  } else if content.contains(ADDED_TAG) {
    OwnLine::Added
  } else if content.contains(WAS_TAG) {
    OwnLine::Was
  } else {
    OwnLine::Other
  }
}

/// The END line closing the block that starts at `begin`. A block without one
/// (the END line was deleted by hand) only loses its BEGIN and credit lines:
/// without END there is no telling where our keys stop and the file's start.
fn block_end(lines: &[Line], begin: usize) -> Option<usize> {
  for (index, line) in lines.iter().enumerate().skip(begin + 1) {
    match classify(line.content) {
      OwnLine::End => return Some(index),
      OwnLine::Begin => return None,
      _ => {}
    }
  }
  None
}

static BEGIN_FIELDS: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"\(config=(\S*) rev=([0-9A-Za-z]*)\)").expect("valid regex"));

fn parse_begin(content: &str) -> (String, String) {
  BEGIN_FIELDS
    .captures(content)
    .map(|captures| (captures[1].to_string(), captures[2].to_string()))
    .unwrap_or_default()
}

fn restore_removed(content: &str) -> String {
  let indent = indent_of(content);
  let rest = &content[indent.len()..];
  format!("{indent}{}", rest.strip_prefix(REMOVED_TAG).unwrap_or(rest))
}

/// The line before our `was` marker, and the original token it records.
fn split_was(content: &str) -> (&str, Option<&str>) {
  let Some(position) = content.rfind(WAS_TAG) else {
    return (content, None);
  };
  let spec = &content[position + WAS_TAG.len()..];
  let token = read_token(spec, 0).map(|(end, _)| &spec[..end]);
  (&content[..position], token)
}

/// The line with our `was` marker removed and the recorded token put back.
/// Anything after the token (a note added by hand) stays at the end.
fn restore_was(content: &str) -> String {
  let (head, original) = split_was(content);
  let Some(original) = original else {
    return head.to_string();
  };
  let tail = &content[head.len() + WAS_TAG.len() + original.len()..];
  match parse_entry_line(head) {
    Some(entry) => format!(
      "{}{original}{}{tail}",
      &head[..entry.value_range.start],
      &head[entry.value_range.end..]
    ),
    None => format!("{head}{tail}"),
  }
}

/// One `key value` line, split by the token rules kv-parser uses with escape
/// sequences off.
struct EntryLine<'a> {
  key: &'a str,
  value: &'a str,
  /// The raw value token, quotes included, within the line.
  value_range: Range<usize>,
  rest: &'a str,
}

fn parse_entry_line(content: &str) -> Option<EntryLine<'_>> {
  let key_start = indent_of(content).len();
  let (key_end, key) = read_token(content, key_start)?;
  let value_start = key_end + indent_of(&content[key_end..]).len();
  let (value_end, value) = read_token(content, value_start)?;
  Some(EntryLine {
    key,
    value,
    value_range: value_start..value_end,
    rest: &content[value_end..],
  })
}

/// The token starting at `start`: its end and its text without quotes.
fn read_token(content: &str, start: usize) -> Option<(usize, &str)> {
  let rest = content.get(start..)?;
  if let Some(quoted) = rest.strip_prefix('"') {
    let close = quoted.find('"')?;
    return Some((start + close + 2, &quoted[..close]));
  }
  if rest.starts_with(['[', '#', '{', '}']) {
    return None;
  }
  let bytes = rest.as_bytes();
  let mut end = 0;
  while end < bytes.len() {
    match bytes[end] {
      b' ' | b'\t' | b'\r' | b'\n' | b'"' | b'{' | b'}' => break,
      b'/' if matches!(bytes.get(end + 1), Some(b'/' | b'*')) => break,
      _ => end += 1,
    }
  }
  (end > 0).then(|| (start + end, &rest[..end]))
}

fn is_clean_entry(content: &str) -> bool {
  parse_entry_line(content).is_some_and(|entry| {
    let rest = entry.rest.trim();
    rest.is_empty() || rest.starts_with("//")
  })
}

/// The key of an entry line, also when it has been commented out.
fn commented_key(content: &str) -> Option<String> {
  let uncommented = content
    .trim_start()
    .trim_start_matches('/')
    .trim_start_matches([' ', '\t']);
  parse_entry_line(uncommented).map(|entry| entry.key.to_string())
}

/// `key` under the innermost block that contains `offset`.
fn path_at(sites: Option<&[Site]>, offset: usize, key: String) -> Vec<String> {
  let parent = sites.and_then(|sites| {
    sites
      .iter()
      .filter_map(|site| match site.kind {
        SiteKind::Object { open, close } if open < offset && offset < close => Some((open, site)),
        _ => None,
      })
      .max_by_key(|(open, _)| *open)
      .map(|(_, site)| site.path.clone())
  });
  let mut path = parent.unwrap_or_default();
  path.push(key);
  path
}

const GRIMOIRE_TAG: &str = "grimoire-perf";

static GRIMOIRE_BEGIN: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r"Grimoire Performance Config BEGIN \(preset=([\w-]+) v(.+?)(?: @([0-9a-f]{6,40}))?\)")
    .expect("valid regex")
});
static GRIMOIRE_BLOCK: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"Grimoire Performance Config (BEGIN|END)").expect("valid regex"));
static GRIMOIRE_WAS: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r#"^(.*?) // grimoire-perf was ("[^"]*"|\S+)\s*$"#).expect("valid regex")
});
static GRIMOIRE_REMOVED: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"^([ \t]*)// grimoire-perf removed: (.*)$").expect("valid regex"));
static GRIMOIRE_ENTRY: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r#"^([ \t]*"?[A-Za-z_][A-Za-z0-9_]*"?[ \t]+)("[^"]*"|[^\s/]+)(.*)$"#)
    .expect("valid regex")
});

#[derive(Debug, PartialEq, Eq)]
enum GrimoireLine {
  Drop,
  Replace(String),
  Keep,
}

/// Grimoire's own `removeMarkers` (electron/main/services/performanceConfig.ts),
/// line for line, so a file it patched comes back exactly as it was.
fn grimoire_line(content: &str) -> GrimoireLine {
  if !content.contains(GRIMOIRE_TAG) && !content.contains("Grimoire Performance Config") {
    return GrimoireLine::Keep;
  }
  if content.contains("// grimoire-perf added")
    || content.contains("[grimoire-perf]")
    || GRIMOIRE_BLOCK.is_match(content)
  {
    return GrimoireLine::Drop;
  }
  if let Some(was) = GRIMOIRE_WAS.captures(content)
    && let Some(entry) = GRIMOIRE_ENTRY.captures(&was[1])
  {
    return GrimoireLine::Replace(format!("{}{}{}", &entry[1], &was[2], &entry[3]));
  }
  if let Some(removed) = GRIMOIRE_REMOVED.captures(content) {
    return GrimoireLine::Replace(format!("{}{}", &removed[1], &removed[2]));
  }
  GrimoireLine::Keep
}

struct BlockTool {
  tool: ForeignTool,
  header: &'static str,
  footer: &'static str,
  /// gameinfo-editor splices its block right after the `{` character rather
  /// than after the line, which leaves the rest of the brace line below it.
  inserted_after_brace: bool,
}

const BLOCK_TOOLS: [BlockTool; 3] = [
  BlockTool {
    tool: ForeignTool::Deadtune,
    header: "// ===== deadtune managed convars",
    footer: "// ===== end deadtune managed convars",
    inserted_after_brace: false,
  },
  BlockTool {
    tool: ForeignTool::SqookyUpdater,
    header: "// ===== gameinfo-updater added convars",
    footer: "// ===== end gameinfo-updater added convars",
    inserted_after_brace: false,
  },
  BlockTool {
    tool: ForeignTool::GameinfoEditor,
    header: "// Editor OptimizationsPreset - Start",
    footer: "// Editor OptimizationsPreset - End",
    inserted_after_brace: true,
  },
];

/// Line ranges from a header line through its footer line. A header without a
/// footer is left alone, as those tools do.
fn find_blocks(lines: &[Line], header: &str, footer: &str) -> Vec<Range<usize>> {
  let starts_with = |line: &Line, tag: &str| line.content.trim().starts_with(tag);
  let mut blocks = Vec::new();
  let mut index = 0;
  while index < lines.len() {
    if starts_with(&lines[index], header)
      && let Some(end) = (index + 1..lines.len()).find(|&end| starts_with(&lines[end], footer))
    {
      blocks.push(index..end + 1);
      index = end + 1;
      continue;
    }
    index += 1;
  }
  blocks
}

#[cfg(test)]
#[path = "test_support.rs"]
pub(crate) mod test_support;

#[cfg(test)]
#[path = "patch_tests.rs"]
mod tests;
