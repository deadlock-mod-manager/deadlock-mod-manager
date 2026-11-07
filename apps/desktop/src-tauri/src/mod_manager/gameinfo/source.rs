use std::ops::Range;

use kv_parser::{AstNode, KvError, Parser, TokenType, Tokenizer, ValueNode};

use super::conditions::{self, Platform};

#[derive(Debug, thiserror::Error)]
pub(crate) enum ParseError {
  #[error("gameinfo.gi could not be parsed: {0}")]
  KeyValues(#[from] KvError),
  #[error("gameinfo.gi has no GameInfo block")]
  MissingRoot,
}

pub(crate) struct Comment {
  pub start: usize,
  pub text: String,
}

/// Source positions below GameInfo, retaining conditions on entries and ancestors.
pub(crate) struct Site {
  pub path: Vec<String>,
  pub key_start: usize,
  pub conditions: Vec<String>,
  pub kind: SiteKind,
}

impl Site {
  pub fn applies(&self, platform: Platform) -> Result<bool, String> {
    for condition in &self.conditions {
      if !conditions::matches(condition, platform)? {
        return Ok(false);
      }
    }
    Ok(true)
  }

  pub fn is_unconditional(&self) -> bool {
    self.conditions.is_empty()
  }
}

pub(crate) enum SiteKind {
  Scalar {
    value: String,
    value_range: Range<usize>,
  },
  Object {
    open: usize,
    close: usize,
  },
}

pub(crate) struct Document {
  pub sites: Vec<Site>,
  pub comments: Vec<Comment>,
}

impl Document {
  /// Tokenize once. Comments also include trivia between a key and its value.
  /// Escape processing is disabled because the engine reads backslashes literally.
  pub fn parse(text: &str) -> Result<Self, ParseError> {
    let bom = text
      .strip_prefix('\u{feff}')
      .map_or(0, |_| '\u{feff}'.len_utf8());
    let source = &text[bom..];
    let offsets = CharOffsets::new(source, bom);
    let tokens = Tokenizer::with_options(source, false, true, true).tokenize()?;
    // The generic KV reader also accepts bare object snippets. A game file
    // requires balanced braces; do not let its permissive document mode hide
    // a closing brace the engine would reject.
    let mut depth = 0usize;
    for token in &tokens {
      match token.token_type {
        TokenType::OpenBrace => depth += 1,
        TokenType::CloseBrace => {
          depth = depth.checked_sub(1).ok_or(KvError::UnexpectedCharacter {
            character: '}',
            line: token.line,
            column: token.column,
          })?;
        }
        _ => {}
      }
    }
    if depth != 0 {
      let eof = tokens.last().expect("tokenizer always emits EOF");
      return Err(
        KvError::UnexpectedEof {
          line: eof.line,
          column: eof.column,
        }
        .into(),
      );
    }
    let comments = tokens
      .iter()
      .filter(|token| token.token_type == TokenType::Comment && token.raw.starts_with("//"))
      .map(|token| Comment {
        start: offsets.byte(token.offset),
        text: token.raw.trim_end().to_string(),
      })
      .collect();
    let ast = Parser::new(tokens).parse_document()?;
    let root = ast
      .children
      .iter()
      .find_map(|node| match node {
        AstNode::KeyValue(pair) if pair.key.value.eq_ignore_ascii_case("GameInfo") => {
          match &pair.value {
            ValueNode::Object(object) => Some((pair, object)),
            _ => None,
          }
        }
        _ => None,
      })
      .ok_or(ParseError::MissingRoot)?;
    let mut conditions = root
      .0
      .conditional
      .iter()
      .map(|condition| condition.raw.clone())
      .collect();
    let mut sites = Vec::new();
    collect_sites(
      &root.1.children,
      &mut Vec::new(),
      &mut conditions,
      &offsets,
      &mut sites,
    );
    Ok(Self { sites, comments })
  }
}

fn collect_sites(
  children: &[AstNode],
  path: &mut Vec<String>,
  conditions: &mut Vec<String>,
  offsets: &CharOffsets,
  sites: &mut Vec<Site>,
) {
  for child in children {
    let AstNode::KeyValue(pair) = child else {
      continue;
    };
    let inherited = conditions.len();
    conditions.extend(
      pair
        .conditional
        .iter()
        .map(|condition| condition.raw.clone()),
    );
    path.push(pair.key.value.clone());
    let scalar = |value: String, start: usize, raw: &str| SiteKind::Scalar {
      value,
      value_range: offsets.byte(start)..offsets.byte(start + raw.chars().count()),
    };
    let kind = match &pair.value {
      ValueNode::Object(object) => SiteKind::Object {
        open: offsets.byte(object.open_brace.start.offset),
        close: offsets.byte(object.close_brace.start.offset),
      },
      ValueNode::String(node) => scalar(node.value.clone(), node.start.offset, &node.raw),
      ValueNode::Number(node) => scalar(node.raw.clone(), node.start.offset, &node.raw),
    };
    sites.push(Site {
      path: path.clone(),
      key_start: offsets.byte(pair.key.start.offset),
      conditions: conditions.clone(),
      kind,
    });
    if let ValueNode::Object(object) = &pair.value {
      collect_sites(&object.children, path, conditions, offsets, sites);
    }
    path.pop();
    conditions.truncate(inherited);
  }
}

/// KV offsets count characters; edits address bytes, including a possible BOM.
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

  fn byte(&self, offset: usize) -> usize {
    self.bytes.as_ref().map_or(offset, |bytes| bytes[offset]) + self.shift
  }
}

pub(crate) fn line_start(text: &str, at: usize) -> usize {
  text[..at].rfind('\n').map_or(0, |previous| previous + 1)
}

pub(crate) fn line_end(text: &str, at: usize) -> usize {
  text[at..]
    .find('\n')
    .map_or(text.len(), |next| at + next + 1)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn comments_offsets_and_inherited_conditions_come_from_the_same_tokens() {
    let text = "\u{feff}GameInfo // café\n{ FileSystem { SearchPaths { Game citadel [$WIN64] } [$LINUX || $WIN64] } }";
    let document = Document::parse(text).unwrap();
    let game = document
      .sites
      .iter()
      .find(|site| site.path.last().unwrap() == "Game")
      .unwrap();
    assert!(text[game.key_start..].starts_with("Game citadel"));
    assert_eq!(game.conditions, ["[$LINUX || $WIN64]", "[$WIN64]"]);
    assert!(game.applies(Platform::Windows).unwrap());
    assert!(!game.applies(Platform::Linux).unwrap());
    assert_eq!(
      &text[document.comments[0].start..][.."// café".len()],
      "// café"
    );
  }
}
