//! The tolerant lexer and key/value parser every gameinfo-like format goes through.

use std::collections::HashSet;

use super::{ParsedLeaf, truncate};
use crate::mod_manager::perf_config::types::{IgnoredKind, IgnoredPart};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum TokenKind {
  Open,
  Close,
  Word,
  Quoted,
  /// `[$WIN64]`-style platform conditions; ignored.
  Condition,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct Token<'a> {
  pub(super) kind: TokenKind,
  pub(super) text: &'a str,
  pub(super) line: u32,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct Comment<'a> {
  pub(super) text: &'a str,
  pub(super) line: u32,
}

pub(super) struct Lexed<'a> {
  pub(super) tokens: Vec<Token<'a>>,
  pub(super) comments: Vec<Comment<'a>>,
  /// Lines with a quote that never closes; the string ends at the line end.
  pub(super) unterminated: Vec<u32>,
}

pub(super) fn lex(text: &str) -> Lexed<'_> {
  let bytes = text.as_bytes();
  let mut tokens = Vec::new();
  let mut comments = Vec::new();
  let mut unterminated = Vec::new();
  let mut line = 1u32;
  let mut i = 0;
  let mut push = |kind, start: usize, end: usize, line| {
    tokens.push(Token {
      kind,
      text: &text[start..end],
      line,
    });
  };
  while i < bytes.len() {
    match bytes[i] {
      b'\n' => {
        line += 1;
        i += 1;
      }
      b' ' | b'\t' | b'\r' | 0x0b | 0x0c | 0 => i += 1,
      b'/' if bytes.get(i + 1) == Some(&b'/') => {
        let end = line_end(bytes, i);
        comments.push(Comment {
          text: text[i + 2..end].trim_end_matches('\r'),
          line,
        });
        i = end;
      }
      b'/' if bytes.get(i + 1) == Some(&b'*') => {
        let end = find_from(bytes, i + 2, b"*/").map_or(bytes.len(), |at| at + 2);
        line += bytes[i..end].iter().filter(|&&b| b == b'\n').count() as u32;
        i = end;
      }
      b'{' => {
        push(TokenKind::Open, i, i + 1, line);
        i += 1;
      }
      b'}' => {
        push(TokenKind::Close, i, i + 1, line);
        i += 1;
      }
      b'"' => {
        let end = line_end(bytes, i + 1);
        match bytes[i + 1..end].iter().position(|&b| b == b'"') {
          Some(offset) => {
            push(TokenKind::Quoted, i + 1, i + 1 + offset, line);
            i += offset + 2;
          }
          None => {
            let content_end = if end > i + 1 && bytes[end - 1] == b'\r' {
              end - 1
            } else {
              end
            };
            push(TokenKind::Quoted, i + 1, content_end, line);
            unterminated.push(line);
            i = end;
          }
        }
      }
      b'[' => {
        let end = line_end(bytes, i);
        let close = bytes[i..end]
          .iter()
          .position(|&b| b == b']')
          .map_or(end, |offset| i + offset + 1);
        push(TokenKind::Condition, i, close, line);
        i = close;
      }
      _ => {
        let start = i;
        while i < bytes.len() && !ends_word(bytes, i) {
          i += 1;
        }
        push(TokenKind::Word, start, i, line);
      }
    }
  }
  Lexed {
    tokens,
    comments,
    unterminated,
  }
}

fn line_end(bytes: &[u8], from: usize) -> usize {
  bytes[from..]
    .iter()
    .position(|&b| b == b'\n')
    .map_or(bytes.len(), |offset| from + offset)
}

fn find_from(bytes: &[u8], from: usize, needle: &[u8]) -> Option<usize> {
  bytes
    .get(from..)?
    .windows(needle.len())
    .position(|window| window == needle)
    .map(|offset| from + offset)
}

fn ends_word(bytes: &[u8], i: usize) -> bool {
  matches!(
    bytes[i],
    b' ' | b'\t' | b'\r' | b'\n' | 0x0b | 0x0c | 0 | b'{' | b'}' | b'"'
  ) || (bytes[i] == b'/' && bytes.get(i + 1) == Some(&b'/'))
}

/// Nesting deeper than this is never a real gameinfo; it is treated as stray
/// braces so garbage input can't build unbounded paths.
const MAX_DEPTH: usize = 32;

/// At most this many unreadable lines are reported one by one; the rest only
/// count towards [`ParsedConfig::unreadable_lines`].
pub(super) const MAX_REPORTED_ERRORS: usize = 200;

pub(super) struct KvDocument<'a> {
  pub(super) leaves: Vec<ParsedLeaf>,
  pub(super) comments: Vec<Comment<'a>>,
  pub(super) errors: Vec<IgnoredPart>,
  pub(super) unreadable_lines: u32,
}

/// Pairs tokens into `key value` leaves. A value must sit on its key's line;
/// a key whose value is on a later line is an orphan, which stops one broken
/// line from shifting every pair after it. A line whose first unquoted word
/// can't be a key (`---- END OF CONFIG ----`), or with another unquoted word
/// after a pair, is prose that lost its `//`; the rest of it is skipped.
pub(super) fn parse_kv(text: &str) -> KvDocument<'_> {
  let lexed = lex(text);
  let mut parser = KvParser {
    lines: text.split('\n').collect(),
    path: Vec::new(),
    frames: Vec::new(),
    pending: None,
    last_pair_line: None,
    line_pairs_unquoted: false,
    junk_line: None,
    leaves: Vec::new(),
    errors: Vec::new(),
    error_lines: HashSet::new(),
  };
  for line in &lexed.unterminated {
    parser.line_error(*line);
  }
  for token in lexed.tokens {
    parser.push(token);
  }
  let (leaves, mut errors, unreadable_lines) = parser.finish();
  errors.sort_by_key(|part| part.line);
  KvDocument {
    leaves,
    comments: lexed.comments,
    errors,
    unreadable_lines,
  }
}

struct KvParser<'a> {
  lines: Vec<&'a str>,
  path: Vec<String>,
  /// Open blocks: whether the block has a key (anonymous `{` adds no path
  /// segment) and the line it opened on.
  frames: Vec<(bool, u32)>,
  pending: Option<Token<'a>>,
  last_pair_line: Option<u32>,
  /// Every pair on `last_pair_line` had an unquoted key and value.
  line_pairs_unquoted: bool,
  junk_line: Option<u32>,
  leaves: Vec<ParsedLeaf>,
  errors: Vec<IgnoredPart>,
  error_lines: HashSet<u32>,
}

impl<'a> KvParser<'a> {
  fn push(&mut self, token: Token<'a>) {
    let is_text = matches!(
      token.kind,
      TokenKind::Word | TokenKind::Quoted | TokenKind::Condition
    );
    if is_text && self.junk_line == Some(token.line) {
      return;
    }
    match token.kind {
      TokenKind::Condition => {}
      TokenKind::Open => self.open(token.line),
      TokenKind::Close => self.close(token.line),
      TokenKind::Word | TokenKind::Quoted => self.text(token),
    }
  }

  fn open(&mut self, line: u32) {
    self.last_pair_line = None;
    match self.pending.take() {
      Some(key) if self.path.len() < MAX_DEPTH => {
        self.path.push(key.text.to_string());
        self.frames.push((true, key.line));
      }
      Some(key) => {
        self.line_error(key.line);
        self.frames.push((false, line));
      }
      None => {
        self.line_error(line);
        self.frames.push((false, line));
      }
    }
  }

  fn close(&mut self, line: u32) {
    self.last_pair_line = None;
    if let Some(key) = self.pending.take() {
      self.line_error(key.line);
    }
    match self.frames.pop() {
      Some((true, _)) => {
        self.path.pop();
      }
      Some((false, _)) => {}
      None => self.line_error(line),
    }
  }

  fn text(&mut self, token: Token<'a>) {
    if let Some(key) = self.pending.take() {
      if key.line == token.line {
        let unquoted = key.kind == TokenKind::Word && token.kind == TokenKind::Word;
        self.line_pairs_unquoted =
          unquoted && (self.last_pair_line != Some(token.line) || self.line_pairs_unquoted);
        let mut path = self.path.clone();
        path.push(key.text.to_string());
        self.leaves.push(ParsedLeaf {
          path,
          value: Some(token.text.to_string()),
          line: key.line,
        });
        self.last_pair_line = Some(token.line);
        return;
      }
      self.line_error(key.line);
    }
    let follows_pair = self.last_pair_line == Some(token.line);
    if token.kind == TokenKind::Word && (follows_pair || !plausible_key(token.text)) {
      // Unquoted words all the way are prose; a quoted pair followed by an
      // uncommented note (`ai_disabled "0" Turns off AI`) keeps its pair.
      if follows_pair && self.line_pairs_unquoted {
        while self
          .leaves
          .last()
          .is_some_and(|leaf| leaf.line == token.line)
        {
          self.leaves.pop();
        }
      }
      self.junk_line = Some(token.line);
      self.line_error(token.line);
      return;
    }
    self.pending = Some(token);
  }

  fn finish(mut self) -> (Vec<ParsedLeaf>, Vec<IgnoredPart>, u32) {
    if let Some(key) = self.pending.take() {
      self.line_error(key.line);
    }
    while let Some((_, line)) = self.frames.pop() {
      self.line_error(line);
    }
    let unreadable_lines = self.error_lines.len() as u32;
    (self.leaves, self.errors, unreadable_lines)
  }

  fn line_error(&mut self, line: u32) {
    if !self.error_lines.insert(line) || self.errors.len() >= MAX_REPORTED_ERRORS {
      return;
    }
    let text = self
      .lines
      .get(line.saturating_sub(1) as usize)
      .map_or("", |text| text.trim());
    self.errors.push(IgnoredPart {
      kind: IgnoredKind::ParseError,
      detail: truncate(text),
      line: Some(line),
    });
  }
}

fn plausible_key(word: &str) -> bool {
  word
    .chars()
    .next()
    .is_some_and(|first| first.is_alphanumeric() || first == '_' || first == '$')
}
