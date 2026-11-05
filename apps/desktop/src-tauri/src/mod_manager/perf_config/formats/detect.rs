//! Telling which format a pasted text or file is.

use super::cfg::{BIND_COMMANDS, EXEC_COMMANDS, cfg_statements, is_convar_name, strip_cfg_comment};
use super::kv::{TokenKind, lex};
use super::overrides::{is_override_name, strip_hash_note};
use super::{base_name_lowercase, clean};
use crate::mod_manager::perf_config::types::ImportFormat;

pub fn detect_format(text: &str, file_name: Option<&str>) -> Option<ImportFormat> {
  let text = clean(text);
  let trimmed = text.trim();
  if crate::mod_manager::perf_config::share::looks_like_code(trimmed) {
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
