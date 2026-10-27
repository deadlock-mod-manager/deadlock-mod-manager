use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::modding_workspace::relative;
use crate::errors::Error;

pub(super) const MAX_IMPORT_FILES: usize = 8192;

#[derive(Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingArchiveEntry {
  pub path: String,
  pub name: String,
  pub directory: bool,
  pub size: u64,
  pub file_count: usize,
}

#[derive(Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingAssetSelection {
  pub path: String,
  pub directory: bool,
  pub selected: bool,
}

pub(super) fn archive_path(path: Option<String>) -> Result<std::path::PathBuf, Error> {
  let path = path.map_or_else(
    || super::state::game_path().map(|root| root.join("game/citadel/pak01_dir.vpk")),
    |path| Ok(std::path::PathBuf::from(path)),
  )?;
  if !path.is_file()
    || !path
      .extension()
      .is_some_and(|extension| extension.eq_ignore_ascii_case("vpk"))
  {
    return Err(Error::InvalidInput(
      "Choose an existing VPK directory file (.vpk)".into(),
    ));
  }
  Ok(path.canonicalize()?)
}

#[tauri::command]
pub async fn list_modding_archive_files(
  directory: String,
  search: String,
  regex: Option<bool>,
  archive_path: Option<String>,
) -> Result<Vec<ModdingArchiveEntry>, Error> {
  relative(&directory, true)?;
  let archive = self::archive_path(archive_path)?;
  tauri::async_runtime::spawn_blocking(move || {
    let archive = super::foundry::open_archive(&archive, None)?;
    archive_listing(
      archive.entries_with_sizes(),
      &directory,
      &search,
      regex.unwrap_or(false),
    )
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

fn archive_listing<'a>(
  entries: impl Iterator<Item = (&'a str, u64)>,
  directory: &str,
  search: &str,
  use_regex: bool,
) -> Result<Vec<ModdingArchiveEntry>, Error> {
  let prefix = if directory.is_empty() {
    String::new()
  } else {
    format!("{directory}/")
  };
  let expression = if use_regex && !search.is_empty() {
    Some(
      regex::RegexBuilder::new(search)
        .case_insensitive(true)
        .size_limit(1024 * 1024)
        .nest_limit(64)
        .build()
        .map_err(|error| Error::InvalidInput(format!("Invalid regular expression: {error}")))?,
    )
  } else {
    None
  };
  let search = if use_regex {
    search.to_owned()
  } else {
    search.to_lowercase()
  };
  let mut listing: BTreeMap<String, ModdingArchiveEntry> = BTreeMap::new();
  for (path, size) in entries {
    let Some(rest) = path.strip_prefix(&prefix) else {
      continue;
    };
    if !search.is_empty() {
      if expression.as_ref().map_or_else(
        || path.to_lowercase().contains(&search),
        |expression| expression.is_match(path),
      ) {
        listing.insert(
          path.to_owned(),
          ModdingArchiveEntry {
            path: path.to_owned(),
            name: rest.rsplit('/').next().unwrap_or(rest).into(),
            directory: false,
            size,
            file_count: 1,
          },
        );
        if listing.len() == 2000 {
          break;
        }
      }
      continue;
    }
    let (name, folder) = rest
      .split_once('/')
      .map_or((rest, false), |(name, _)| (name, true));
    let key = format!("{prefix}{name}");
    let node = listing
      .entry(key.clone())
      .or_insert_with(|| ModdingArchiveEntry {
        path: key,
        name: name.into(),
        directory: folder,
        size: 0,
        file_count: 0,
      });
    node.size += size;
    node.file_count += 1;
  }
  let mut listing: Vec<_> = listing.into_values().collect();
  listing.sort_by(|a, b| {
    b.directory
      .cmp(&a.directory)
      .then_with(|| a.name.cmp(&b.name))
  });
  Ok(listing)
}

pub(super) fn expand_selection(
  selections: &[ModdingAssetSelection],
  mut entries: Vec<String>,
) -> Result<Vec<String>, Error> {
  if selections.is_empty() || selections.len() > MAX_IMPORT_FILES * 2 {
    return Err(Error::InvalidInput(
      "Select files or folders to decompile".into(),
    ));
  }
  entries.sort_unstable();
  let mut rules = HashMap::new();
  for selection in selections {
    relative(&selection.path, selection.directory)?;
    let exists = if selection.directory {
      let prefix = if selection.path.is_empty() {
        String::new()
      } else {
        format!("{}/", selection.path)
      };
      entries
        .get(entries.partition_point(|path| path.as_str() < prefix.as_str()))
        .is_some_and(|path| path.starts_with(&prefix))
    } else {
      entries.binary_search(&selection.path).is_ok()
    };
    if !exists {
      return Err(Error::InvalidInput(format!(
        "Base-game asset is missing: {}",
        selection.path
      )));
    }
    if rules.insert(selection.path.as_str(), selection).is_some() {
      return Err(Error::InvalidInput(
        "Duplicate archive selection rule".into(),
      ));
    }
  }
  let mut selected = Vec::new();
  for entry in entries {
    let mut ancestor = entry.as_str();
    loop {
      if let Some(rule) = rules.get(ancestor)
        && (ancestor == entry || rule.directory)
      {
        if rule.selected {
          relative(&entry, false)?;
          selected.push(entry);
        }
        break;
      }
      if ancestor.is_empty() {
        break;
      }
      ancestor = ancestor.rsplit_once('/').map_or("", |(parent, _)| parent);
    }
    if selected.len() > MAX_IMPORT_FILES {
      return Err(Error::InvalidInput(format!(
        "Select at most {MAX_IMPORT_FILES} source assets per import"
      )));
    }
  }
  if selected.is_empty() {
    return Err(Error::InvalidInput(
      "Select at least one file to decompile".into(),
    ));
  }
  Ok(selected)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn rule(path: &str, directory: bool, selected: bool) -> ModdingAssetSelection {
    ModdingAssetSelection {
      path: path.into(),
      directory,
      selected,
    }
  }

  #[test]
  fn folder_selection_is_recursive_and_honors_nested_exclusions() {
    let paths = [
      "models/haze/body.vmdl_c",
      "models/haze/extra/hat.vmdl_c",
      "models/haze/extra/keep.vtex_c",
      "models/hazel/other.vmdl_c",
    ];
    let selected = expand_selection(
      &[
        rule("models/haze", true, true),
        rule("models/haze/extra", true, false),
        rule("models/haze/extra/keep.vtex_c", false, true),
      ],
      paths.map(String::from).into(),
    )
    .unwrap();
    assert_eq!(
      selected,
      ["models/haze/body.vmdl_c", "models/haze/extra/keep.vtex_c"]
    );
  }

  #[test]
  fn listing_aggregates_folder_sizes_and_file_counts() {
    let entries = [
      ("models/haze/body.vmdl_c", 12),
      ("models/haze/textures/skin.vtex_c", 34),
      ("models/bebop.vmdl_c", 56),
    ];
    let listing = archive_listing(entries.into_iter(), "models", "", false).unwrap();
    assert_eq!(listing[0].path, "models/haze");
    assert_eq!(listing[0].file_count, 2);
    assert_eq!(listing[0].size, 46);
    assert_eq!(listing[1].size, 56);
    assert_eq!(
      archive_listing(entries.into_iter(), "models/haze", "skin", false).unwrap()[0].path,
      "models/haze/textures/skin.vtex_c"
    );
  }

  #[test]
  fn regex_search_matches_paths_and_reports_invalid_expressions() {
    let entries = [
      ("models/haze/body.vmdl_c", 1),
      ("models/haze/hair.vmdl_c", 2),
      ("models/bebop/body.vmdl_c", 3),
    ];
    let listing = archive_listing(
      entries.into_iter(),
      "models",
      r"haze/(body|hair)\.vmdl_c$",
      true,
    )
    .unwrap();
    assert_eq!(listing.len(), 2);
    assert!(
      archive_listing(entries.into_iter(), "models/haze", "bebop", true)
        .unwrap()
        .is_empty()
    );
    assert!(archive_listing(entries.into_iter(), "", "[", true).is_err());
    assert!(
      archive_listing(entries.into_iter(), "", "body|hair", false)
        .unwrap()
        .is_empty()
    );
  }

  #[test]
  fn invalid_and_missing_paths_are_rejected() {
    let paths = vec!["models/haze.vmdl_c".into()];
    assert!(expand_selection(&[rule("../outside", true, true)], paths.clone()).is_err());
    assert!(expand_selection(&[rule("models/missing", true, true)], paths.clone()).is_err());
    assert!(expand_selection(&[rule("models/haze.vmdl_c", false, false)], paths).is_err());
  }
}

#[tauri::command]
pub async fn list_modding_archive_selection(
  selections: Vec<ModdingAssetSelection>,
  archive_path: Option<String>,
) -> Result<Vec<ModdingArchiveEntry>, Error> {
  if selections.is_empty() {
    return Ok(Vec::new());
  }
  let archive = self::archive_path(archive_path)?;
  tauri::async_runtime::spawn_blocking(move || {
    let archive = super::foundry::open_archive(&archive, None)?;
    let sizes: BTreeMap<_, _> = archive
      .entries_with_sizes()
      .map(|(path, size)| (path.to_owned(), size))
      .collect();
    let selected = expand_selection(&selections, sizes.keys().cloned().collect())?;
    Ok(
      selected
        .into_iter()
        .map(|path| ModdingArchiveEntry {
          name: path.rsplit('/').next().unwrap_or(&path).to_owned(),
          size: sizes[&path],
          path,
          directory: false,
          file_count: 1,
        })
        .collect(),
    )
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
