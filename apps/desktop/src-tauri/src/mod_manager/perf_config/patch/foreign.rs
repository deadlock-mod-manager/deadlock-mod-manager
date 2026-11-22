//! Other tools' overlays: Grimoire marks every line it touches, so its edits
//! are undone exactly; DeadTune, Sqooky's updater and gameinfo-editor only
//! mark the block of keys they add.

use std::ops::Range;
use std::sync::LazyLock;

use regex::Regex;

use super::{Line, OwnedLine, split_lines};
use crate::mod_manager::perf_config::types::{ForeignOverlay, ForeignTool};

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

pub(super) const GRIMOIRE_TAG: &str = "grimoire-perf";

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
