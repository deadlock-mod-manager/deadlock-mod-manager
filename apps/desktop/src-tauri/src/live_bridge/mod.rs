pub mod protocol;

use std::fs;
use std::path::Path;
use std::sync::LazyLock;

use serde::Serialize;
use source2_model::vpk_extract::VpkArchive;
use ts_rs::TS;
use vpkmanager::source2::kv3::{self, Seg, Value};
use vpkmanager::source2::resource::Resource;

use crate::errors::Error;
use crate::vpk_archive_cache::open_archive;

pub const LIVE_BRIDGE_FILE: &str = "dmm-live-bridge.vpk";

const BRIDGE_SOURCE: &str = include_str!("dmm_live_bridge.js");
const SCRIPT_TEMPLATE: &[u8] = include_bytes!("script_template.vjs_c");

const SCRIPT_RESOURCE: &str = "panorama/scripts/dmm_live_bridge.vjs_c";
const TEAM_LAYOUT: &str = "panorama/layout/citadel_hud_top_bar_team.vxml_c";

fn invalid(message: impl Into<String>) -> Error {
  Error::InvalidInput(message.into())
}

fn extract(archive: &VpkArchive, entry: &str) -> Result<Vec<u8>, Error> {
  archive
    .extract_entry(entry)
    .map_err(|error| invalid(format!("Could not read {entry}: {error}")))
}

fn is_node(value: &Value, kind: &str) -> bool {
  value.get("eType").and_then(Value::as_str) == Some(kind)
}

fn patch_layout(base: &[u8]) -> Result<Vec<u8>, Error> {
  let bad = |what: &str| invalid(format!("Unexpected top-bar layout: {what}"));
  let resource = Resource::parse(base).map_err(|_| bad("not a compiled resource"))?;
  let index = resource
    .blocks()
    .iter()
    .position(|block| &block.kind == b"LaCo")
    .ok_or_else(|| bad("no layout block"))?;
  let payload = resource
    .get_block_by_index(index)
    .ok_or_else(|| bad("layout block out of range"))?;
  let tree = kv3::decode(payload).map_err(|_| bad("layout block is not KV3"))?;

  let children = tree
    .get("m_AST")
    .and_then(|ast| ast.get("m_pRoot"))
    .and_then(|root| root.get("vecChildren"))
    .and_then(Value::as_array)
    .ok_or_else(|| bad("no root"))?;
  if children.iter().any(|node| is_node(node, "SCRIPTS")) {
    return Err(bad("it already loads scripts"));
  }
  let styles = children
    .iter()
    .find(|node| is_node(node, "STYLES"))
    .ok_or_else(|| bad("no styles"))?;
  let mut include = styles
    .get("vecChildren")
    .and_then(Value::as_array)
    .and_then(<[Value]>::first)
    .cloned()
    .ok_or_else(|| bad("no style includes"))?;
  *include
    .get_mut("child")
    .and_then(|reference| reference.get_mut("name"))
    .ok_or_else(|| bad("include without a named reference"))? =
    Value::String(SCRIPT_RESOURCE.into());

  let mut scripts = styles.clone();
  *scripts
    .get_mut("eType")
    .ok_or_else(|| bad("styles without a type"))? = Value::String("SCRIPTS".into());
  *scripts
    .get_mut("vecChildren")
    .ok_or_else(|| bad("styles without children"))? = Value::Array(vec![include]);

  let path = [
    Seg::Key("m_AST".into()),
    Seg::Key("m_pRoot".into()),
    Seg::Key("vecChildren".into()),
  ];
  let patched = kv3::insert_array_element_adding(payload, &path, 1, &scripts)
    .map_err(|error| invalid(format!("Could not patch the top-bar layout: {error}")))?;
  resource
    .rebuild_with_block_preserving(index, &patched)
    .map_err(|error| invalid(format!("Could not rebuild the top-bar layout: {error}")))
}

fn build_script() -> Result<Vec<u8>, Error> {
  let template = Resource::parse(SCRIPT_TEMPLATE)
    .map_err(|_| invalid("The bridge script template is damaged"))?;
  let data = template
    .blocks()
    .iter()
    .position(|block| &block.kind == b"DATA")
    .ok_or_else(|| invalid("The bridge script template has no DATA block"))?;
  template
    .rebuild_with_block(data, BRIDGE_SOURCE.as_bytes())
    .map_err(|error| invalid(format!("Could not build the bridge script: {error}")))
}

static SCRIPT: LazyLock<Vec<u8>> =
  LazyLock::new(|| build_script().expect("the bundled bridge script builds"));

#[derive(Debug)]
enum LayoutError {
  Unreadable(Error),
  Incompatible(Error),
}

impl From<LayoutError> for Error {
  fn from(error: LayoutError) -> Self {
    match error {
      LayoutError::Unreadable(error) | LayoutError::Incompatible(error) => error,
    }
  }
}

fn expected_layout(game_path: &Path) -> Result<Vec<u8>, LayoutError> {
  let pak_dir = game_path.join("game").join("citadel").join("pak01_dir.vpk");
  let base = open_archive(&pak_dir, None)
    .and_then(|archive| extract(&archive, TEAM_LAYOUT))
    .map_err(LayoutError::Unreadable)?;
  patch_layout(&base).map_err(LayoutError::Incompatible)
}

fn replace_with(
  destination: &Path,
  write: impl FnOnce(&Path) -> Result<(), Error>,
) -> Result<(), Error> {
  let parent = destination
    .parent()
    .ok_or_else(|| invalid(format!("{} has no folder", destination.display())))?;
  fs::create_dir_all(parent)?;
  let temp = tempfile::Builder::new()
    .prefix(".dmm-live-bridge")
    .suffix(".vpk")
    .tempfile_in(parent)?
    .into_temp_path();
  write(&temp)?;
  temp.persist(destination).map_err(|error| error.error)?;
  Ok(())
}

pub fn build(game_path: &Path, destination: &Path) -> Result<(), Error> {
  let layout = expected_layout(game_path)?;
  let staging = tempfile::tempdir()?;
  for (path, bytes) in [
    (TEAM_LAYOUT, layout.as_slice()),
    (SCRIPT_RESOURCE, SCRIPT.as_slice()),
  ] {
    let target = staging.path().join(path);
    if let Some(parent) = target.parent() {
      fs::create_dir_all(parent)?;
    }
    fs::write(target, bytes)?;
  }
  replace_with(destination, |temp| {
    vpkmanager::pack_directory(staging.path(), temp)
      .map(|_| ())
      .map_err(|error| invalid(format!("Could not pack the bridge: {error}")))
  })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum BridgeStatus {
  /// Not enabled in the profile, so the game does not load it.
  NotInstalled,
  /// Installed, and what a build right now would produce.
  Current,
  /// Built from an older game layout or an older bridge script.
  Outdated,
  /// The game's top-bar layout changed in a way this build cannot patch, so
  /// the installed bridge holds an old copy of it and should be turned off.
  Incompatible,
}

pub fn status(game_path: &Path, installed: Option<&Path>) -> BridgeStatus {
  let Some(installed) = installed.filter(|path| path.is_file()) else {
    return BridgeStatus::NotInstalled;
  };
  let layout = match expected_layout(game_path) {
    Ok(layout) => layout,
    Err(LayoutError::Incompatible(error)) => {
      log::warn!("Live bridge: the game's top-bar layout cannot be patched: {error}");
      return BridgeStatus::Incompatible;
    }
    Err(LayoutError::Unreadable(error)) => {
      log::warn!("Live bridge: could not read the game's files: {error}");
      return BridgeStatus::Current;
    }
  };
  let installed = VpkArchive::open(installed).ok();
  let holds = |entry: &str, expected: &[u8]| {
    installed
      .as_ref()
      .and_then(|archive| archive.extract_entry(entry).ok())
      .is_some_and(|bytes| bytes == expected)
  };
  if holds(TEAM_LAYOUT, &layout) && holds(SCRIPT_RESOURCE, &SCRIPT) {
    BridgeStatus::Current
  } else {
    BridgeStatus::Outdated
  }
}

pub fn update(game_path: &Path, library_copy: &Path, installed: &Path) -> Result<(), Error> {
  let is_bridge = VpkArchive::open(installed).is_ok_and(|archive| {
    let mut entries = archive.list_entries();
    entries.sort();
    entries == [TEAM_LAYOUT, SCRIPT_RESOURCE]
  });
  if !is_bridge {
    return Err(invalid(format!(
      "{} is not the live bridge",
      installed.display()
    )));
  }
  build(game_path, library_copy)?;
  replace_with(installed, |temp| {
    fs::copy(library_copy, temp)?;
    Ok(())
  })
}

#[cfg(test)]
mod tests {
  use vpk_parser::VpkParser;

  use super::*;

  #[test]
  fn the_script_carries_the_bridge_source() {
    let script = build_script().unwrap();
    let resource = Resource::parse(&script).unwrap();

    assert_eq!(resource.data_block().unwrap(), BRIDGE_SOURCE.as_bytes());
  }

  #[test]
  #[ignore = "needs an installed game"]
  fn builds_from_the_installed_game() {
    let game = std::env::var_os("DMM_GAME_PATH").expect("DMM_GAME_PATH");
    let game = Path::new(&game);
    let dir = tempfile::tempdir().unwrap();
    let out = dir.path().join("pak01_dir.vpk");
    build(game, &out).unwrap();

    let files = VpkParser::parse_directory_from_file(&out).unwrap();
    let names: Vec<&str> = files.iter().map(|file| file.full_path.as_str()).collect();
    assert!(names.contains(&SCRIPT_RESOURCE));
    assert!(names.contains(&TEAM_LAYOUT));
    assert_eq!(status(game, Some(&out)), BridgeStatus::Current);

    let layout = expected_layout(game).unwrap();
    pack(
      &out,
      &[
        (TEAM_LAYOUT, layout.as_slice()),
        (SCRIPT_RESOURCE, SCRIPT_TEMPLATE),
      ],
    );
    assert_eq!(status(game, Some(&out)), BridgeStatus::Outdated);

    let copy = dir.path().join(LIVE_BRIDGE_FILE);
    update(game, &copy, &out).unwrap();
    assert_eq!(status(game, Some(&out)), BridgeStatus::Current);
    assert_eq!(fs::read(&copy).unwrap(), fs::read(&out).unwrap());
  }

  #[test]
  fn refuses_a_file_that_is_not_a_layout() {
    assert!(patch_layout(b"not a resource").is_err());
  }

  fn pack(output: &Path, files: &[(&str, &[u8])]) {
    let staging = tempfile::tempdir().unwrap();
    for (path, bytes) in files {
      let target = staging.path().join(path);
      fs::create_dir_all(target.parent().unwrap()).unwrap();
      fs::write(target, bytes).unwrap();
    }
    vpkmanager::pack_directory(staging.path(), output).unwrap();
  }

  #[test]
  fn a_layout_the_bridge_cannot_patch_is_incompatible_not_current() {
    let game = tempfile::tempdir().unwrap();
    let citadel = game.path().join("game").join("citadel");
    pack(
      &citadel.join("pak01_dir.vpk"),
      &[(TEAM_LAYOUT, b"a reshaped layout")],
    );
    let installed = citadel.join("addons").join("pak01_dir.vpk");
    pack(
      &installed,
      &[(TEAM_LAYOUT, b"old layout"), (SCRIPT_RESOURCE, b"script")],
    );

    assert_eq!(
      status(game.path(), Some(&installed)),
      BridgeStatus::Incompatible
    );
  }

  #[test]
  fn an_unreadable_game_is_not_called_incompatible() {
    let game = tempfile::tempdir().unwrap();
    let installed = game.path().join("addons").join("pak01_dir.vpk");
    pack(
      &installed,
      &[(TEAM_LAYOUT, b"layout"), (SCRIPT_RESOURCE, b"script")],
    );

    assert_eq!(status(game.path(), Some(&installed)), BridgeStatus::Current);
  }

  #[test]
  fn an_update_leaves_an_addon_that_is_not_the_bridge_alone() {
    let game = tempfile::tempdir().unwrap();
    let installed = game.path().join("addons").join("pak05_dir.vpk");
    pack(&installed, &[(TEAM_LAYOUT, b"someone else's layout")]);
    let before = fs::read(&installed).unwrap();

    let copy = game.path().join(LIVE_BRIDGE_FILE);
    assert!(update(game.path(), &copy, &installed).is_err());
    assert_eq!(fs::read(&installed).unwrap(), before);
  }

  #[test]
  fn an_update_leaves_a_pack_with_other_mods_alone() {
    let game = tempfile::tempdir().unwrap();
    let installed = game.path().join("addons").join("pak05_dir.vpk");
    pack(
      &installed,
      &[
        (TEAM_LAYOUT, b"layout"),
        (SCRIPT_RESOURCE, b"script"),
        ("panorama/images/other_mod.vtex_c", b"another mod"),
      ],
    );
    let before = fs::read(&installed).unwrap();

    let copy = game.path().join(LIVE_BRIDGE_FILE);
    assert!(update(game.path(), &copy, &installed).is_err());
    assert_eq!(fs::read(&installed).unwrap(), before);
  }
}
