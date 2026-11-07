//! Resolve effective defaults and choose a gap that keeps bootstrap → profile → base priority.

use super::*;

const BOOTSTRAP: &str = "citadel/deadworks_mods";
const ADDONROOT: &str = "citadel/deadworks_addons";

pub(super) struct Plan {
  pub at: usize,
  pub block: String,
}

#[derive(Clone, Copy)]
struct Entry<'a> {
  site: &'a Site,
  value: &'a str,
}

struct Mount<'a> {
  role: &'static str,
  value: &'a str,
}

struct Placement<'a> {
  at: usize,
  inline: bool,
  indent: &'a str,
  newline: &'static str,
  reuses_bootstrap: bool,
}

pub(super) fn build(
  text: &str,
  doc: &Document,
  mode: MountMode<'_>,
  saved_roles: &[(&'static str, Option<&str>); 2],
  deadworks: bool,
) -> Result<Option<Plan>, Error> {
  // Cleanup needs no engine-condition evaluation when there are no owned
  // defaults to preserve; unrelated conditional mounts remain untouched.
  if matches!(mode, MountMode::Disabled) && saved_roles.iter().all(|(_, value)| value.is_none()) {
    return Ok(None);
  }
  let entries = active_entries(doc, Platform::CLIENT)?;
  let first_game = entries.iter().find(|entry| has_role(entry.site, "Game"));
  let Some(first_game) = first_game else {
    return match mode {
      MountMode::Disabled => Ok(None),
      MountMode::Enabled(_) => Err(fail(
        "SearchPaths has no active Game entry to preserve Mod and Write defaults",
      )),
    };
  };
  let roles = resolve_roles(&entries, first_game, saved_roles, mode);
  if roles.is_empty() && matches!(mode, MountMode::Disabled) {
    return Ok(None);
  }
  // The selected Mod/Write roots identify the base mounts that profiles must
  // outrank. With no matching Game mount, use the first non-bootstrap Game.
  let base = entries
    .iter()
    .find(|entry| {
      has_role(entry.site, "Game")
        && roles
          .iter()
          .any(|role| role.value.eq_ignore_ascii_case(entry.value))
    })
    .or_else(|| {
      entries
        .iter()
        .find(|entry| has_role(entry.site, "Game") && !entry.value.eq_ignore_ascii_case(BOOTSTRAP))
    })
    .unwrap_or(first_game);
  let placement = place(text, doc, first_game.site, base.site.key_start)?;
  let mut mounts = Vec::new();
  if let MountMode::Enabled(paths) = mode {
    let needs_deadworks = deadworks
      || entries
        .iter()
        .any(|entry| has_role(entry.site, "Game") && entry.value.eq_ignore_ascii_case(BOOTSTRAP));
    if needs_deadworks {
      if !placement.reuses_bootstrap {
        mounts.push(Mount {
          role: "Game",
          value: BOOTSTRAP,
        });
      }
      if !doc
        .entries()
        .any(|site| is_mount(text, site, "addonroot", ADDONROOT))
      {
        mounts.push(Mount {
          role: "addonroot",
          value: ADDONROOT,
        });
      }
    }
    if paths.is_empty() {
      mounts.push(Mount {
        role: "Game",
        value: "citadel/addons",
      });
    }
    mounts.extend(paths.iter().map(|path| Mount {
      role: "Game",
      value: path,
    }));
  }
  mounts.extend(roles);
  Ok(Some(Plan {
    at: placement.at,
    block: render(&placement, &mounts),
  }))
}

fn active_entries(doc: &Document, platform: Platform) -> Result<Vec<Entry<'_>>, Error> {
  let mut entries = Vec::new();
  for site in doc.entries().filter(|site| {
    ["Game", "Mod", "Write"]
      .iter()
      .any(|role| has_role(site, role))
  }) {
    if let SiteKind::Scalar { value, .. } = &site.kind
      && site.applies(platform).map_err(fail)?
    {
      entries.push(Entry { site, value });
    }
  }
  Ok(entries)
}

fn resolve_roles<'a>(
  entries: &[Entry<'a>],
  first_game: &Entry<'a>,
  saved: &[(&'static str, Option<&'a str>); 2],
  mode: MountMode<'_>,
) -> Vec<Mount<'a>> {
  let default = entries
    .iter()
    .find(|entry| has_role(entry.site, "Game") && !entry.value.eq_ignore_ascii_case(BOOTSTRAP))
    .unwrap_or(first_game)
    .value;
  saved
    .iter()
    .filter_map(|(role, saved)| {
      let existing = entries
        .iter()
        .find(|entry| has_role(entry.site, role))
        .map(|entry| entry.value);
      let value = match mode {
        MountMode::Enabled(_) => Some(existing.or(*saved).unwrap_or(default)),
        // Deadworks can depend on anchors DMM wrote earlier. Keep only those
        // whose removal would change the effective default.
        MountMode::Disabled => {
          saved.filter(|value| existing.is_none() && !value.eq_ignore_ascii_case(first_game.value))
        }
      };
      value.map(|value| Mount { role, value })
    })
    .collect()
}

fn place<'a>(
  text: &'a str,
  doc: &Document,
  first_game: &Site,
  before: usize,
) -> Result<Placement<'a>, Error> {
  let first = doc
    .entries()
    .find(|site| !is_language_path(site))
    .unwrap_or(first_game);
  let floor = doc
    .entries()
    .filter(|site| site.key_start < first.key_start && is_language_path(site))
    .filter_map(|site| match &site.kind {
      SiteKind::Scalar { value_range, .. } => Some(line_end(text, value_range.end)),
      _ => None,
    })
    .max()
    .unwrap_or(doc.body.start);
  let line = line_start(text, first.key_start);
  let inline = line <= doc.body.start || !text[line..first.key_start].trim().is_empty();
  let ordinary = if inline {
    doc.body.start
  } else {
    doc
      .comments
      .iter()
      .filter(|comment| comment.start >= floor && comment.start < first.key_start)
      .map(|comment| line_start(text, comment.start))
      .min()
      .unwrap_or(line)
  };
  let reusable = doc
    .entries()
    .find(|site| site.key_start == first_game.key_start && is_mount(text, site, "Game", BOOTSTRAP))
    .and_then(|site| after_bootstrap(text, doc, site))
    .filter(|after| *after <= before);
  // If a foreign fence also encloses base mounts, reusing its bootstrap would
  // put profiles below stock assets. Keep the fence intact and add our own fallback.
  let at = reusable.map_or(ordinary, |after| ordinary.max(after));
  if at > before {
    return Err(fail(
      "No safe SearchPaths insertion point precedes the base game mounts; the file was left unchanged",
    ));
  }
  Ok(Placement {
    at,
    inline,
    indent: if inline {
      "      "
    } else {
      &text[line..first.key_start]
    },
    newline: if text
      .find('\n')
      .is_some_and(|at| at > 0 && text.as_bytes()[at - 1] == b'\r')
    {
      "\r\n"
    } else {
      "\n"
    },
    reuses_bootstrap: reusable.is_some(),
  })
}

fn after_bootstrap(text: &str, doc: &Document, first: &Site) -> Option<usize> {
  if let Some(fence) = doc
    .fences
    .iter()
    .find(|fence| fence.contains(&first.key_start))
  {
    return Some(line_end(text, fence.end));
  }
  doc
    .entries()
    .skip_while(|entry| entry.key_start < first.key_start)
    .take_while(|entry| {
      matches!(entry.kind, SiteKind::Scalar { .. })
        && (is_mount(text, entry, "Game", BOOTSTRAP)
          || is_mount(text, entry, "addonroot", ADDONROOT)
          || has_role(entry, "Mod")
          || has_role(entry, "Write"))
    })
    .last()
    .and_then(|site| match &site.kind {
      SiteKind::Scalar { value_range, .. } => Some(line_end(text, value_range.end)),
      _ => None,
    })
}

fn render(placement: &Placement<'_>, mounts: &[Mount<'_>]) -> String {
  let Placement {
    inline,
    indent,
    newline,
    ..
  } = placement;
  let mut block = if *inline {
    newline.to_string()
  } else {
    String::new()
  };
  let start = if *inline { INLINE_START } else { START };
  block.push_str(&format!("{indent}{start}{newline}"));
  for mount in mounts {
    let value = if mount.role == "Game" || mount.role == "addonroot" {
      mount.value.to_string()
    } else {
      format!("\"{}\"", mount.value)
    };
    block.push_str(&format!(
      "{indent}{}\t\t{value} {OWNED}{newline}",
      mount.role
    ));
  }
  block.push_str(&format!("{indent}{END}{newline}"));
  block
}
