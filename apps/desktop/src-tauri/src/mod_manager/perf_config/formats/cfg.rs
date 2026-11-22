//! cfg and autoexec files: `name value` lines, with binds, aliases and execs reported.

use super::kv::MAX_REPORTED_ERRORS;
use super::{ParsedConfig, ParsedLeaf, clean, truncate};
use crate::mod_manager::perf_config::types::{IgnoredKind, IgnoredPart, ImportFormat};

pub(super) const BIND_COMMANDS: &[&str] = &[
  "bind",
  "bindtoggle",
  "unbind",
  "unbindall",
  "unbindalljoystick",
  "unbindallmousekeyboard",
];
pub(super) const EXEC_COMMANDS: &[&str] = &["exec", "execifexists", "execwithwhitelist"];
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
pub(super) fn parse_cfg(text: &str) -> ParsedConfig {
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

pub(super) fn strip_cfg_comment(line: &str) -> &str {
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
pub(super) fn cfg_statements(code: &str) -> Vec<Vec<String>> {
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

pub(super) fn is_convar_name(name: &str) -> bool {
  let mut chars = name.chars();
  chars
    .next()
    .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
    && chars.all(|char| char.is_ascii_alphanumeric() || char == '_' || char == '.')
}
