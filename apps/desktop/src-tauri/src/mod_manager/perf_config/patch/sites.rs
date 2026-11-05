//! Where every key and block sits in gameinfo.gi, from kv-parser's tree.

use std::collections::HashMap;
use std::ops::Range;

use kv_parser::{AstNode, ParseOptions, Parser, ValueNode};

use super::fail;
use crate::errors::Error;
use crate::mod_manager::perf_config::live::path_key;

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
