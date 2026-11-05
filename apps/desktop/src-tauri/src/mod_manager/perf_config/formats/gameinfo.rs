//! Full gameinfo.gi files and ConVars snippets.

use super::kv::{Comment, parse_kv};
use super::{ParsedConfig, ParsedLeaf, clean, truncate};
use crate::mod_manager::perf_config::types::{IgnoredKind, IgnoredPart, ImportFormat};

pub(super) fn parse_gameinfo(text: &str) -> ParsedConfig {
  let text = clean(text);
  let document = parse_kv(&text);
  let mut ignored = document.errors;
  let mut unreadable_lines = document.unreadable_lines;
  ignored.extend(marker_parts(&document.comments));

  let is_root =
    |leaf: &ParsedLeaf| leaf.path.len() > 1 && leaf.path[0].eq_ignore_ascii_case("GameInfo");
  if !document.leaves.iter().any(is_root) {
    let leaves = document
      .leaves
      .into_iter()
      .map(|mut leaf| {
        if leaf.path.len() == 1 {
          leaf.path.insert(0, "ConVars".to_string());
        }
        leaf
      })
      .collect();
    return ParsedConfig {
      format: ImportFormat::ConvarsSnippet,
      leaves,
      ignored,
      video_settings: Vec::new(),
      unreadable_lines,
    };
  }

  let mut leaves = Vec::new();
  for mut leaf in document.leaves {
    if is_root(&leaf) {
      leaf.path.remove(0);
      leaves.push(leaf);
    } else {
      unreadable_lines += 1;
      ignored.push(IgnoredPart {
        kind: IgnoredKind::ParseError,
        detail: truncate(&format!(
          "{} {}",
          leaf.path.join("/"),
          leaf.value.unwrap_or_default()
        )),
        line: Some(leaf.line),
      });
    }
  }
  let format = if looks_like_whole_file(&leaves) {
    ImportFormat::FullGameinfo
  } else {
    ImportFormat::ConvarsSnippet
  };
  ParsedConfig {
    format,
    leaves,
    ignored,
    video_settings: Vec::new(),
    unreadable_lines,
  }
}

/// A whole gameinfo.gi has FileSystem or a handful of engine sections; a
/// `GameInfo { ConVars { … } }` wrapper around a few convars does not, and
/// matching it against stock files would invent changes.
fn looks_like_whole_file(leaves: &[ParsedLeaf]) -> bool {
  let mut sections: Vec<String> = Vec::new();
  for leaf in leaves.iter().filter(|leaf| leaf.path.len() > 1) {
    let section = leaf.path[0].to_ascii_lowercase();
    if section == "filesystem" {
      return true;
    }
    if section != "convars" && !sections.contains(&section) {
      sections.push(section);
    }
  }
  sections.len() >= 3
}

fn marker_parts(comments: &[Comment]) -> Vec<IgnoredPart> {
  comments
    .iter()
    .filter(|comment| {
      comment.text.contains("Deadlock Mod Manager")
        && (comment.text.contains("- Start") || comment.text.contains("BEGIN"))
    })
    .map(|comment| IgnoredPart {
      kind: IgnoredKind::ModManagerMarkers,
      detail: truncate(comment.text.trim()),
      line: Some(comment.line),
    })
    .collect()
}
