use std::fs;
use std::io::Write;
use std::ops::Range;
use std::path::Path;

use kv_parser::{AstNode, ParseOptions, Parser, Serializer, StringNode, ValueNode};

use crate::errors::Error;

const LAUNCH_OPTIONS_PATH: &[&str] = &[
  "UserLocalConfigStore",
  "Software",
  "Valve",
  "Steam",
  "apps",
  "1422450",
  "LaunchOptions",
];

fn launch_options<'a>(children: &'a mut [AstNode], path: &[&str]) -> Option<&'a mut StringNode> {
  let (key, rest) = path.split_first()?;
  let pair = children.iter_mut().find_map(|node| match node {
    AstNode::KeyValue(pair) if pair.key.value.eq_ignore_ascii_case(key) => Some(pair),
    _ => None,
  })?;
  match &mut pair.value {
    ValueNode::String(value) if rest.is_empty() => Some(value),
    ValueNode::Object(object) => launch_options(&mut object.children, rest),
    _ => None,
  }
}

fn condebug_ranges(args: &str) -> Vec<Range<usize>> {
  let mut ranges = Vec::new();
  let mut start = None;
  let mut quote = None;
  let mut escaped = false;
  for (index, character) in args
    .char_indices()
    .chain(std::iter::once((args.len(), ' ')))
  {
    if start.is_none() && !character.is_whitespace() {
      start = Some(index);
    }
    if escaped {
      escaped = false;
    } else if character == '\\' && quote != Some('\'') {
      escaped = true;
    } else if quote == Some(character) {
      quote = None;
    } else if quote.is_none() && matches!(character, '\'' | '"') {
      quote = Some(character);
    } else if quote.is_none()
      && character.is_whitespace()
      && let Some(start) = start.take()
    {
      let token = &args[start..index];
      if token.eq_ignore_ascii_case("-condebug")
        || token.eq_ignore_ascii_case("\"-condebug\"")
        || token.eq_ignore_ascii_case("'-condebug'")
      {
        ranges.push(start..index);
      }
    }
  }
  ranges
}

fn remove_condebug(args: &str) -> Option<String> {
  let ranges = condebug_ranges(args);
  if ranges.is_empty() {
    return None;
  }
  let mut updated = args.to_string();
  for mut range in ranges.into_iter().rev() {
    while updated
      .as_bytes()
      .get(range.end)
      .is_some_and(u8::is_ascii_whitespace)
    {
      range.end += 1;
    }
    if range.end == updated.len() {
      while range.start > 0 && updated.as_bytes()[range.start - 1].is_ascii_whitespace() {
        range.start -= 1;
      }
    }
    updated.replace_range(range, "");
  }
  Some(updated)
}

fn cleaned_config(content: &str) -> Result<Option<String>, Error> {
  // Steam stores large cached values alongside its launch options.
  let mut document =
    Parser::parse_with_token_limit(content, ParseOptions::default(), content.len())
      .map_err(|_| Error::InvalidInput("Cannot parse Steam's localconfig.vdf".into()))?;
  let Some(value) = launch_options(&mut document.ast.children, LAUNCH_OPTIONS_PATH) else {
    return Ok(None);
  };
  let Some(updated) = remove_condebug(&value.value) else {
    return Ok(None);
  };
  value.raw = format!(
    "\"{}\"",
    updated
      .replace('\\', "\\\\")
      .replace('"', "\\\"")
      .replace('\n', "\\n")
      .replace('\r', "\\r")
      .replace('\t', "\\t")
  );
  Ok(Some(Serializer::serialize_ast(&document.ast)))
}

pub fn clear_condebug(path: &Path, steam_running: bool) -> Result<(), Error> {
  let original = match fs::read_to_string(path) {
    Ok(content) => content,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(error) => return Err(error.into()),
  };
  let Some(updated) = cleaned_config(&original)? else {
    return Ok(());
  };
  if steam_running {
    return Err(Error::SteamRunning);
  }

  let parent = path
    .parent()
    .ok_or_else(|| Error::InvalidInput("Missing Steam config directory".into()))?;
  let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
  temporary
    .as_file()
    .set_permissions(fs::metadata(path)?.permissions())?;
  temporary.write_all(updated.as_bytes())?;
  temporary.as_file().sync_all()?;
  if fs::read_to_string(path)? != original {
    return Err(Error::FileWriteFailed(
      "Steam launch options changed; retry".into(),
    ));
  }
  temporary.persist(path).map_err(|error| error.error)?;
  Ok(())
}

#[cfg(test)]
mod tests;
