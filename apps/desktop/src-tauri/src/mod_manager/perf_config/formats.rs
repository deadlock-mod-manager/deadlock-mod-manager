//! Parsers for the text formats a config can arrive in: full gameinfo.gi,
//! ConVars snippets, cfg / autoexec lines, Sqooky's `overrides.gi` and
//! video.txt. Share codes are decoded in [`super::share`].
//!
//! Community files are messy: unquoted keys, stray braces, duplicate keys,
//! mixed line endings, prose that lost its `//`, translated comments. Every
//! parser is tolerant, so a line it can't read is skipped and reported as an
//! [`IgnoredPart`] instead of failing the file.

use std::borrow::Cow;
use std::collections::{HashMap, HashSet};

use super::live::{normalize_value, path_key, values_equal};
use super::types::{ConfigEntry, IgnoredKind, IgnoredPart, ImportFormat, VideoSetting};

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
  /// [`MAX_REPORTED_ERRORS`] that `ignored` lists.
  pub unreadable_lines: u32,
}

const DETAIL_MAX_CHARS: usize = 160;

pub fn detect_format(text: &str, file_name: Option<&str>) -> Option<ImportFormat> {
  let text = clean(text);
  let trimmed = text.trim();
  if super::share::looks_like_code(trimmed) {
    return Some(ImportFormat::ShareCode);
  }
  let name = file_name.map(base_name_lowercase);
  if let Some(name) = name.as_deref() {
    if [".zip", ".rar", ".7z"]
      .iter()
      .any(|ext| name.ends_with(ext))
    {
      return Some(ImportFormat::Archive);
    }
    if trimmed.is_empty() {
      return None;
    }
    if name.ends_with(".gi") {
      return Some(match sniff(trimmed) {
        Some(ImportFormat::FullGameinfo) => ImportFormat::FullGameinfo,
        Some(ImportFormat::OverridesGi) => ImportFormat::OverridesGi,
        _ if name.starts_with("overrides") => ImportFormat::OverridesGi,
        _ => ImportFormat::ConvarsSnippet,
      });
    }
    if name.ends_with(".cfg") || name.ends_with(".vcfg") {
      return Some(match sniff(trimmed) {
        Some(format @ (ImportFormat::FullGameinfo | ImportFormat::ConvarsSnippet)) => format,
        _ => ImportFormat::Cfg,
      });
    }
    if name.starts_with("video") && name.ends_with(".txt") {
      return Some(ImportFormat::VideoTxt);
    }
  }
  if trimmed.is_empty() {
    return None;
  }
  sniff(trimmed)
}

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TokenKind {
  Open,
  Close,
  Word,
  Quoted,
  /// `[$WIN64]`-style platform conditions; ignored.
  Condition,
}

#[derive(Debug, Clone, Copy)]
struct Token<'a> {
  kind: TokenKind,
  text: &'a str,
  line: u32,
}

#[derive(Debug, Clone, Copy)]
struct Comment<'a> {
  text: &'a str,
  line: u32,
}

struct Lexed<'a> {
  tokens: Vec<Token<'a>>,
  comments: Vec<Comment<'a>>,
  /// Lines with a quote that never closes; the string ends at the line end.
  unterminated: Vec<u32>,
}

fn lex(text: &str) -> Lexed<'_> {
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
const MAX_REPORTED_ERRORS: usize = 200;

struct KvDocument<'a> {
  leaves: Vec<ParsedLeaf>,
  comments: Vec<Comment<'a>>,
  errors: Vec<IgnoredPart>,
  unreadable_lines: u32,
}

/// Pairs tokens into `key value` leaves. A value must sit on its key's line;
/// a key whose value is on a later line is an orphan, which stops one broken
/// line from shifting every pair after it. A line whose first unquoted word
/// can't be a key (`---- END OF CONFIG ----`), or with another unquoted word
/// after a pair, is prose that lost its `//`; the rest of it is skipped.
fn parse_kv(text: &str) -> KvDocument<'_> {
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

fn parse_gameinfo(text: &str) -> ParsedConfig {
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

const BIND_COMMANDS: &[&str] = &[
  "bind",
  "bindtoggle",
  "unbind",
  "unbindall",
  "unbindalljoystick",
  "unbindallmousekeyboard",
];
const EXEC_COMMANDS: &[&str] = &["exec", "execifexists", "execwithwhitelist"];
const CONSOLE_COMMANDS: &[&str] = &[
  "echo",
  "toggle",
  "incrementvar",
  "say",
  "say_team",
  "host_writeconfig",
  "clear",
  "connect",
  "disconnect",
  "retry",
  "map",
  "play",
  "playvol",
  "developer_msg",
  "con_logfile",
  "mm_join",
  "wait",
  "kill",
  "record",
  "stop",
  "quit",
  "exit",
  "snd_restart",
  "mat_reloadallmaterials",
  "cl_showfps_toggle",
];

/// `name value` lines become ConVars entries; binds, aliases, execs and
/// commands are reported, never imported. Whether a name is a convar or a
/// concommand is the catalog's call, made when the entries are resolved.
fn parse_cfg(text: &str) -> ParsedConfig {
  let text = clean(text);
  let mut leaves = Vec::new();
  let mut ignored = Vec::new();
  let mut unreadable_lines = 0;
  for (index, raw_line) in text.split('\n').enumerate() {
    let line = index as u32 + 1;
    let statements = cfg_statements(strip_cfg_comment(raw_line));
    let first_command = statements.first().map(|statement| statement[0].as_str());
    if first_command.is_some_and(|command| !is_command_like(command)) {
      unreadable_lines += 1;
      if unreadable_lines as usize <= MAX_REPORTED_ERRORS {
        ignored.push(IgnoredPart {
          kind: IgnoredKind::ParseError,
          detail: truncate(raw_line.trim()),
          line: Some(line),
        });
      }
      continue;
    }
    for statement in statements {
      let command = &statement[0];
      let lower = command.to_ascii_lowercase();
      let kind = if BIND_COMMANDS.contains(&lower.as_str()) {
        Some(IgnoredKind::Bind)
      } else if lower == "alias" {
        Some(IgnoredKind::Alias)
      } else if EXEC_COMMANDS.contains(&lower.as_str()) {
        Some(IgnoredKind::Exec)
      } else if lower.starts_with(['+', '-'])
        || CONSOLE_COMMANDS.contains(&lower.as_str())
        || !is_convar_name(command)
        || statement.len() == 1
      {
        Some(IgnoredKind::ConsoleCommand)
      } else {
        None
      };
      match kind {
        Some(kind) => ignored.push(IgnoredPart {
          kind,
          detail: truncate(&statement.join(" ")),
          line: Some(line),
        }),
        None => leaves.push(ParsedLeaf {
          path: vec!["ConVars".to_string(), command.clone()],
          value: Some(statement[1..].join(" ")),
          line,
        }),
      }
    }
  }
  ParsedConfig {
    format: ImportFormat::Cfg,
    leaves,
    ignored,
    video_settings: Vec::new(),
    unreadable_lines,
  }
}

/// A console line starts with a command or convar name, or `+`/`-` for a
/// button command. Anything else (`\\\\ BANNER ////`) is decoration.
fn is_command_like(command: &str) -> bool {
  command
    .strip_prefix(['+', '-'])
    .map_or_else(|| is_convar_name(command), is_convar_name)
}

fn strip_cfg_comment(line: &str) -> &str {
  let mut quoted = false;
  for (index, char) in line.char_indices() {
    match char {
      '"' => quoted = !quoted,
      '/' if !quoted && line[index..].starts_with("//") => return &line[..index],
      _ => {}
    }
  }
  line
}

/// Tokens of each `;`-separated statement. Quotes group words (and keep `;`
/// inside an alias body) and are dropped.
fn cfg_statements(code: &str) -> Vec<Vec<String>> {
  let mut statements = Vec::new();
  let mut statement: Vec<String> = Vec::new();
  let mut current = String::new();
  let mut has_token = false;
  let mut quoted = false;
  for char in code.chars() {
    match char {
      '"' => {
        quoted = !quoted;
        has_token = true;
      }
      ' ' | '\t' | '\r' if !quoted => {
        if has_token {
          statement.push(std::mem::take(&mut current));
          has_token = false;
        }
      }
      ';' if !quoted => {
        if has_token {
          statement.push(std::mem::take(&mut current));
          has_token = false;
        }
        if !statement.is_empty() {
          statements.push(std::mem::take(&mut statement));
        }
      }
      _ => {
        current.push(char);
        has_token = true;
      }
    }
  }
  if has_token {
    statement.push(current);
  }
  if !statement.is_empty() {
    statements.push(statement);
  }
  statements
}

fn is_convar_name(name: &str) -> bool {
  let mut chars = name.chars();
  chars
    .next()
    .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
    && chars.all(|char| char.is_ascii_alphanumeric() || char == '_' || char == '.')
}

/// Grammar: blank and `#` lines are skipped; `// NAME [# note]` forces the
/// key to be commented out; `NAME VALUE [# note]` locks the value (quotes
/// dropped). A name both locked and commented is locked.
fn parse_overrides(text: &str) -> ParsedConfig {
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
fn strip_hash_note(text: &str) -> &str {
  let bytes = text.as_bytes();
  (1..bytes.len())
    .find(|&i| bytes[i] == b'#' && bytes[i - 1].is_ascii_whitespace())
    .map_or(text, |i| &text[..i])
}

fn is_override_name(name: &str) -> bool {
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

/// Settings tied to one machine's monitor, GPU or memory. Copying them from
/// another player's file is never a recommendation.
const MACHINE_SPECIFIC_SETTINGS: &[&str] = &[
  "defaultres",
  "defaultresheight",
  "recommendedheight",
  "refreshrate_numerator",
  "refreshrate_denominator",
  "fullscreen",
  "coop_fullscreen",
  "nowindowborder",
  "fullscreen_min_on_focus_loss",
  "monitor_index",
  "high_dpi",
  "aspectratiomode",
  "knowndevice",
  "mem_level",
  "gpu_mem_level",
];
const MACHINE_SPECIFIC_HEADER: &[&str] = &["vendorid", "deviceid"];

enum MenuValues {
  Options(&'static [(&'static str, &'static str)]),
  Toggle,
  Percent,
  FpsLimit,
  Plain,
}

/// The game's video menu (`panorama/layout/popups/popup_settings.xml` and its
/// English strings): option name and the values each choice writes.
const MENU_SETTINGS: &[(&str, &str, MenuValues)] = &[
  (
    "r_citadel_upscaling",
    "Upscaling technology",
    MenuValues::Options(&[
      ("0", "Stretch"),
      ("1", "FSR"),
      ("2", "FSR2 (TAA)"),
      ("3", "FSR3 (TAA)"),
      ("4", "NVIDIA DLSS"),
    ]),
  ),
  ("mat_viewportscale", "Render quality", MenuValues::Percent),
  (
    "r_citadel_dlss_settings_mode",
    "Scaling mode",
    MenuValues::Options(&[
      ("0", "Auto"),
      ("1", "2x"),
      ("2", "1.7x"),
      ("3", "1.5x"),
      ("4", "1x (DLAA)"),
    ]),
  ),
  (
    "r_dlss_preset",
    "DLSS Model",
    MenuValues::Options(&[("6", "CNN"), ("10", "Transformer")]),
  ),
  (
    "r_citadel_fsr_rcas_sharpness",
    "FSR sharpness",
    MenuValues::Percent,
  ),
  (
    "r_citadel_fsr2_sharpness",
    "FSR sharpness",
    MenuValues::Percent,
  ),
  (
    "r_citadel_antialiasing",
    "Anti-aliasing",
    MenuValues::Options(&[("0", "None"), ("1", "FXAA")]),
  ),
  (
    "r_citadel_ssao_quality",
    "Screen space AO",
    MenuValues::Options(&[
      ("0", "Off"),
      ("1", "Low"),
      ("2", "Med"),
      ("3", "High"),
      ("4", "Ultra"),
    ]),
  ),
  (
    "r_citadel_shadow_quality",
    "Shadow quality",
    MenuValues::Options(&[("0", "Low"), ("1", "Med"), ("2", "High"), ("3", "Ultra")]),
  ),
  (
    "r_citadel_fog_quality",
    "Fog quality",
    MenuValues::Options(&[("0", "Low"), ("1", "High")]),
  ),
  (
    "r_texture_stream_mip_bias",
    "Texture quality",
    MenuValues::Options(&[("2", "Low"), ("1", "Med"), ("0", "High")]),
  ),
  ("r_post_bloom", "Post process bloom", MenuValues::Toggle),
  ("r_effects_bloom", "Effects bloom", MenuValues::Toggle),
  ("mat_vsync", "VSync", MenuValues::Toggle),
  ("r_arealights", "Area lights", MenuValues::Toggle),
  ("r_depth_of_field", "Depth of field", MenuValues::Toggle),
  ("fps_max", "In-game maximum FPS", MenuValues::FpsLimit),
  (
    "r_low_latency",
    "NVIDIA Reflex",
    MenuValues::Options(&[
      ("0", "Disabled"),
      ("1", "Enabled"),
      ("2", "Enabled + Boost"),
    ]),
  ),
  (
    "r_fullscreen_gamma",
    "Full Screen Brightness",
    MenuValues::Plain,
  ),
];

/// Reads `setting.*` values from a video.txt, a `"video.cfg"` block or a
/// headerless fragment. Machine-specific keys and device ids are reported,
/// never recommended.
fn parse_video(text: &str) -> ParsedConfig {
  let text = clean(text);
  let document = parse_kv(&text);
  let mut ignored = document.errors;
  let unreadable_lines = document.unreadable_lines;
  let mut settings = Vec::new();
  for leaf in document.leaves {
    let Some(key) = leaf.path.last() else {
      continue;
    };
    let lower = key.to_ascii_lowercase();
    match lower.strip_prefix("setting.") {
      Some(name) if MACHINE_SPECIFIC_SETTINGS.contains(&name) => ignored.push(IgnoredPart {
        kind: IgnoredKind::MachineSpecific,
        detail: key.clone(),
        line: Some(leaf.line),
      }),
      Some(_) => settings.push(ParsedLeaf {
        path: vec![key["setting.".len()..].to_string()],
        value: leaf.value,
        line: leaf.line,
      }),
      None if MACHINE_SPECIFIC_HEADER.contains(&lower.as_str()) => ignored.push(IgnoredPart {
        kind: IgnoredKind::MachineSpecific,
        detail: key.clone(),
        line: Some(leaf.line),
      }),
      None => {}
    }
  }
  let (entries, duplicates) = collapse(&settings);
  ignored.extend(duplicates);
  ignored.sort_by_key(|part| part.line);
  let video_settings = entries
    .into_iter()
    .filter_map(|entry| {
      let value = entry.value?;
      Some(video_setting(&entry.path[0], value))
    })
    .collect();
  ParsedConfig {
    format: ImportFormat::VideoTxt,
    leaves: Vec::new(),
    ignored,
    video_settings,
    unreadable_lines,
  }
}

fn video_setting(key: &str, value: String) -> VideoSetting {
  let menu = MENU_SETTINGS
    .iter()
    .find(|(name, _, _)| name.eq_ignore_ascii_case(key));
  let display = menu.and_then(|(_, _, values)| menu_display(values, &value));
  VideoSetting {
    key: key.to_string(),
    label: menu.map(|(_, label, _)| (*label).to_string()),
    display,
    value,
  }
}

fn menu_display(values: &MenuValues, value: &str) -> Option<String> {
  let normalized = normalize_value(value);
  match values {
    MenuValues::Options(options) => options
      .iter()
      .find(|(option, _)| normalize_value(option) == normalized)
      .map(|(_, label)| (*label).to_string()),
    MenuValues::Toggle => match normalized.as_str() {
      "1" => Some("On".to_string()),
      "0" => Some("Off".to_string()),
      _ => None,
    },
    MenuValues::Percent => {
      let fraction: f64 = value.trim().parse().ok()?;
      fraction
        .is_finite()
        .then(|| format!("{}%", (fraction * 100.0).round()))
    }
    MenuValues::FpsLimit => match normalized.as_str() {
      "0" => Some("No limit".to_string()),
      _ => value
        .trim()
        .parse::<f64>()
        .ok()
        .map(|fps| format!("{}", fps.round())),
    },
    MenuValues::Plain => None,
  }
}

fn sniff(text: &str) -> Option<ImportFormat> {
  let tokens = lex(text).tokens;
  let opens_block = |name: &str| {
    tokens.iter().enumerate().any(|(index, token)| {
      matches!(token.kind, TokenKind::Word | TokenKind::Quoted)
        && token.text.eq_ignore_ascii_case(name)
        && tokens[index + 1..]
          .iter()
          .find(|next| next.kind != TokenKind::Condition)
          .is_some_and(|next| next.kind == TokenKind::Open)
    })
  };
  if opens_block("GameInfo") {
    return Some(ImportFormat::FullGameinfo);
  }
  if opens_block("ConVars") {
    return Some(ImportFormat::ConvarsSnippet);
  }
  let has_settings = tokens.iter().any(|token| {
    matches!(token.kind, TokenKind::Word | TokenKind::Quoted)
      && token
        .text
        .get(.."setting.".len())
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("setting."))
  });
  if has_settings || opens_block("video.cfg") {
    return Some(ImportFormat::VideoTxt);
  }

  let mut code_lines = 0;
  let mut hash_lines = 0;
  let mut override_lines = 0;
  let mut quoted_pairs = 0;
  let mut cfg_lines = 0;
  let mut has_braces = false;
  for line in text.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }
    if trimmed.starts_with('#') {
      hash_lines += 1;
      continue;
    }
    if trimmed.starts_with("//") {
      continue;
    }
    code_lines += 1;
    has_braces |= trimmed.contains(['{', '}']);
    if strip_hash_note(trimmed)
      .split_once(char::is_whitespace)
      .is_some_and(|(name, _)| is_override_name(name))
    {
      override_lines += 1;
    }
    if is_quoted_pair(trimmed) {
      quoted_pairs += 1;
    }
    let code = strip_cfg_comment(trimmed);
    if cfg_statements(code).first().is_some_and(|statement| {
      let command = statement[0].to_ascii_lowercase();
      BIND_COMMANDS.contains(&command.as_str())
        || command == "alias"
        || EXEC_COMMANDS.contains(&command.as_str())
        || (statement.len() > 1 && command.contains('_') && is_convar_name(&command))
    }) {
      cfg_lines += 1;
    }
  }
  if hash_lines > 0 && !has_braces && code_lines > 0 && override_lines == code_lines {
    return Some(ImportFormat::OverridesGi);
  }
  if quoted_pairs > 0 && quoted_pairs * 2 >= code_lines {
    return Some(ImportFormat::ConvarsSnippet);
  }
  if cfg_lines > 0 && cfg_lines * 2 >= code_lines {
    return Some(ImportFormat::Cfg);
  }
  None
}

fn is_quoted_pair(line: &str) -> bool {
  line
    .strip_prefix('"')
    .and_then(|rest| rest.split_once('"'))
    .is_some_and(|(key, rest)| !key.is_empty() && rest.trim_start().starts_with('"'))
}

#[cfg(test)]
#[path = "import_test_support.rs"]
pub(crate) mod import_test_support;

#[cfg(test)]
#[path = "formats_tests.rs"]
mod tests;
