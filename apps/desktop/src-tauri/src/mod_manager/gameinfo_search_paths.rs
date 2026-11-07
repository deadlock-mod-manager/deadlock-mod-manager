//! Edits only DMM's mounts; the surrounding KeyValues document belongs to the game and user.

use std::ops::Range;

use super::gameinfo::{
  Comment, Document as SourceDocument, Platform, Site, SiteKind, line_end, line_start,
};
use super::shard;
use crate::errors::Error;

mod plan;
#[cfg(test)]
mod tests;

pub(super) const LEGACY_START: &str = "// Deadlock Mod Manager - Start";
pub(super) const LEGACY_END: &str = "// Deadlock Mod Manager - End";
const START: &str = "// Deadlock Mod Manager - SearchPaths v2 - Start";
// Records the line break we added when a compact block had no insertion line.
const INLINE_START: &str = "// Deadlock Mod Manager - SearchPaths v2 - Start (inline)";
const END: &str = "// Deadlock Mod Manager - SearchPaths v2 - End";
const OWNED: &str = "// dmm-search-path";

struct Document {
  sites: Vec<Site>,
  comments: Vec<Comment>,
  body: Range<usize>,
  fences: Vec<Range<usize>>,
}

#[derive(Clone, Copy, PartialEq)]
enum Format {
  Unmanaged,
  Legacy,
  Current,
}

struct Ownership<'a> {
  entries: Vec<&'a Site>,
  format: Format,
}

pub(super) struct Inspection {
  pub has_owned_entries: bool,
  pub mod_paths: Vec<String>,
}

#[derive(Clone, Copy)]
pub(super) enum MountMode<'a> {
  Disabled,
  /// An empty slice selects the default addons directory.
  Enabled(&'a [String]),
}

pub(super) struct Rewrite {
  pub content: String,
  pub migrated_legacy: bool,
}

fn fail(reason: impl Into<String>) -> Error {
  Error::GameConfigParse(reason.into())
}

impl Document {
  fn parse(text: &str) -> Result<Self, Error> {
    let SourceDocument { sites, comments } =
      SourceDocument::parse(text).map_err(|error| fail(error.to_string()))?;
    let mut body = None;
    for site in &sites {
      if is_search_paths(&site.path)
        && site.applies(Platform::CLIENT).map_err(fail)?
        && let SiteKind::Object { open, close } = site.kind
      {
        body = Some(open + 1..close);
        break;
      }
    }
    let body = body.ok_or_else(|| fail("GameInfo/FileSystem/SearchPaths section not found"))?;
    let fences = foreign_fences(&comments, &body);
    Ok(Self {
      sites,
      comments,
      body,
      fences,
    })
  }

  fn entries(&self) -> impl Iterator<Item = &Site> {
    self.sites.iter().filter(|site| {
      site.path.len() == 3
        && is_search_paths(&site.path[..2])
        && self.body.contains(&site.key_start)
    })
  }

  fn markers(&self, start: &str, end: &str) -> Result<Option<Range<usize>>, Error> {
    let starts: Vec<_> = self
      .comments
      .iter()
      .filter(|comment| comment.text == start || (start == START && comment.text == INLINE_START))
      .collect();
    let ends: Vec<_> = self
      .comments
      .iter()
      .filter(|comment| comment.text == end)
      .collect();
    match (starts.as_slice(), ends.as_slice()) {
      ([], []) => Ok(None),
      ([start], [end]) if start.start < end.start => Ok(Some(start.start..end.start)),
      _ => Err(fail(
        "DMM search-path markers are incomplete, duplicated, or out of order; the file was left unchanged",
      )),
    }
  }
}

fn is_search_paths(path: &[String]) -> bool {
  path.len() == 2
    && path[0].eq_ignore_ascii_case("FileSystem")
    && path[1].eq_ignore_ascii_case("SearchPaths")
}

fn has_role(site: &Site, role: &str) -> bool {
  site
    .path
    .last()
    .is_some_and(|key| key.split('+').any(|part| part.eq_ignore_ascii_case(role)))
}

fn is_language_path(site: &Site) -> bool {
  site.path.last().is_some_and(|key| {
    key.eq_ignore_ascii_case("Game_UILanguage") || key.eq_ignore_ascii_case("Game_LowViolence")
  })
}

fn whole_line(text: &str, at: usize) -> Result<Range<usize>, Error> {
  let start = line_start(text, at);
  if !text[start..at].trim().is_empty() {
    return Err(fail(
      "A DMM search-path marker or entry shares a line with other content; the file was left unchanged",
    ));
  }
  Ok(start..line_end(text, at))
}

fn legacy_path(value: &str) -> bool {
  shard::is_valid_search_path(value)
    && (value.split('/').count() == 2
      || value
        .rsplit('/')
        .next()
        .is_some_and(|folder| folder.starts_with("profile_") || folder.starts_with("server_")))
}

/// Match fence names, so an unrelated comment ending in END cannot close a tool's block.
fn foreign_fences(comments: &[Comment], body: &Range<usize>) -> Vec<Range<usize>> {
  let mut stack: Vec<(&str, usize)> = Vec::new();
  let mut fences = Vec::new();
  for comment in comments
    .iter()
    .filter(|comment| body.contains(&comment.start))
  {
    if let Some(name) = [" BEGIN", " START", " - Start"]
      .iter()
      .find_map(|suffix| comment.text.strip_suffix(suffix))
    {
      stack.push((name, comment.start));
    } else if let Some(name) = [" END", " - End"]
      .iter()
      .find_map(|suffix| comment.text.strip_suffix(suffix))
      && stack.last().is_some_and(|(open, _)| *open == name)
    {
      let (_, start) = stack.pop().expect("matching fence was checked");
      if stack.is_empty() {
        fences.push(start..comment.start);
      }
    }
  }
  if let Some((_, start)) = stack.first() {
    fences.push(*start..body.end);
  }
  fences
}

fn in_foreign_block(doc: &Document, at: usize) -> bool {
  doc.fences.iter().any(|fence| fence.contains(&at))
}

fn is_mount(text: &str, site: &Site, role: &str, path: &str) -> bool {
  let SiteKind::Scalar { value, value_range } = &site.kind else {
    return false;
  };
  let tail = text[value_range.end..line_end(text, value_range.end)].trim();
  has_role(site, role)
    && value.eq_ignore_ascii_case(path)
    && site.is_unconditional()
    && (tail.is_empty() || tail.starts_with("//"))
}

/// Recognizes tagged entries and historical DMM mounts, preserving foreign fences.
fn owned_entries<'a>(text: &str, doc: &'a Document) -> Result<Ownership<'a>, Error> {
  let current = doc.markers(START, END)?;
  let legacy = doc.markers(LEGACY_START, LEGACY_END)?;
  if current.is_some() && legacy.is_some() {
    return Err(fail(
      "Both legacy and current DMM search-path markers are present; the file was left unchanged",
    ));
  }
  if let Some(block) = &current
    && !(doc.body.contains(&block.start) && doc.body.contains(&block.end))
  {
    return Err(fail(
      "DMM search-path markers are outside SearchPaths; the file was left unchanged",
    ));
  }
  if let Some(block) = &legacy
    && !(block.start < doc.body.start && block.end > doc.body.end)
  {
    return Err(fail(
      "Legacy DMM markers do not surround the active SearchPaths block; the file was left unchanged",
    ));
  }
  let mut result = Vec::new();
  for site in doc.entries() {
    let SiteKind::Scalar { value, value_range } = &site.kind else {
      continue;
    };
    let tail = text[value_range.end..line_end(text, value_range.end)].trim();
    let tagged = current
      .as_ref()
      .is_some_and(|block| block.contains(&site.key_start))
      && tail == OWNED;
    let same_line = line_start(text, site.key_start) == line_start(text, value_range.start);
    if tagged && !same_line {
      return Err(fail(
        "A DMM search-path entry spans multiple lines; the file was left unchanged",
      ));
    }
    // Historical writers emitted plain, unconditional lines. Comments, conditions,
    // and another tool's fenced block are evidence that a line is not ours.
    let old = legacy.is_some()
      && !in_foreign_block(doc, site.key_start)
      && same_line
      && !text[site.key_start..].starts_with('"')
      && tail.is_empty()
      && site.is_unconditional()
      && site.path[2] == "Game"
      && legacy_path(value);
    if tagged || old {
      result.push(site);
    }
  }
  let format = if legacy.is_some() {
    Format::Legacy
  } else if current.is_some() {
    Format::Current
  } else {
    Format::Unmanaged
  };
  Ok(Ownership {
    entries: result,
    format,
  })
}

pub(super) fn validate(text: &str) -> Result<(), Error> {
  let doc = Document::parse(text)?;
  owned_entries(text, &doc)?;
  Ok(())
}

pub(super) fn inspect(text: &str) -> Result<Inspection, Error> {
  let doc = Document::parse(text)?;
  let ownership = owned_entries(text, &doc)?;
  let mod_paths = ownership
    .entries
    .iter()
    .filter_map(|site| match &site.kind {
      SiteKind::Scalar { value, .. }
        if has_role(site, "Game") && shard::is_valid_search_path(value) =>
      {
        Some(value.clone())
      }
      _ => None,
    })
    .collect();
  Ok(Inspection {
    has_owned_entries: ownership.format != Format::Unmanaged,
    mod_paths,
  })
}

pub(super) fn mounted_paths(text: &str) -> Result<Vec<String>, Error> {
  inspect(text).map(|inspection| inspection.mod_paths)
}

pub(super) fn rewrite(text: &str, mode: MountMode<'_>, deadworks: bool) -> Result<Rewrite, Error> {
  let doc = Document::parse(text)?;
  let Ownership {
    entries: owned,
    format,
  } = owned_entries(text, &doc)?;
  let saved_roles = ["Mod", "Write"].map(|role| {
    let value = owned.iter().find_map(|site| match &site.kind {
      SiteKind::Scalar { value, .. } if has_role(site, role) => Some(value.as_str()),
      _ => None,
    });
    (role, value)
  });
  let mut edits = Vec::new();
  for site in owned {
    edits.push((whole_line(text, site.key_start)?, String::new()));
  }
  for comment in &doc.comments {
    if [START, INLINE_START, END, LEGACY_START, LEGACY_END].contains(&comment.text.as_str()) {
      let mut range = whole_line(text, comment.start)?;
      if comment.text == INLINE_START {
        if text[doc.body.start..range.start].trim().is_empty() {
          range.start = doc.body.start;
        } else {
          return Err(fail(
            "An inline DMM block moved away from its opening brace; the file was left unchanged",
          ));
        }
      }
      edits.push((range, String::new()));
    }
  }
  if format == Format::Legacy {
    for site in doc.entries() {
      let end = line_end(text, site.key_start);
      // Older DMM templates used this obsolete engine key. Only migrate our
      // exact historical line, never a user's annotated or conditional entry.
      if text[site.key_start..end].trim_end() == "Game_Language       citadel_*LANGUAGE*"
        && !in_foreign_block(&doc, site.key_start)
      {
        edits.push((
          site.key_start..site.key_start + "Game_Language".len(),
          "Game_UILanguage".into(),
        ));
      }
    }
  }
  edits.sort_by_key(|(range, _)| range.start);
  edits.dedup();
  let mut clean = text.to_string();
  for (range, replacement) in edits.iter().rev() {
    clean.replace_range(range.clone(), replacement);
  }
  let baseline = Document::parse(&clean)?;
  if let Some(plan) = plan::build(&clean, &baseline, mode, &saved_roles, deadworks)? {
    clean.insert_str(plan.at, &plan.block);
  }
  validate(&clean)?;
  Ok(Rewrite {
    content: clean,
    migrated_legacy: format == Format::Legacy,
  })
}
