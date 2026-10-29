//! The live bridge HUD mod behind the Stats page's Live tab.
//!
//! The bridge is a script loaded by the game's own top-bar team layout. It reads
//! the scoreboard values the game puts on each top-bar player panel and prints
//! them to the console, where [`crate::live_match`] picks them up.
//!
//! The layout it hooks into belongs to the game and changes with patches, so the
//! VPK is built from the installed game on demand rather than shipped prebuilt:
//! the game's layout plus one `SCRIPTS` include, and the script itself.

use std::fs;
use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use source2_model::vpk_extract::VpkArchive;
use ts_rs::TS;
use vpkmanager::source2::kv3::{self, Seg, Value};
use vpkmanager::source2::resource::Resource;

use crate::commands::foundry::archive_cache::open_archive;
use crate::errors::Error;

const BRIDGE_SOURCE: &str = include_str!("dmm_live_bridge.js");
/// A compiled Panorama script with an empty body, so no JavaScript compiler is
/// needed at runtime: building the script swaps the bridge's source into its
/// empty `DATA` block, which the game loads as plain text.
///
/// It was made by compiling an empty `panorama/scripts/dmm_live_bridge.js` in
/// a Deadlock workshop addon named `dmm-live-bridge`, which is why its `RED2`
/// block still names that search path and describes an empty source. The game
/// does not check that metadata when it loads the script. Regenerate it the
/// same way if a game update changes the resource format.
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

fn member<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
  match value {
    Value::Object(members) => members.iter().find(|(k, _)| k == key).map(|(_, v)| v),
    _ => None,
  }
}

fn set_member(value: &mut Value, key: &str, new: Value) -> bool {
  let Value::Object(members) = value else {
    return false;
  };
  match members.iter_mut().find(|(k, _)| k == key) {
    Some(slot) => {
      slot.1 = new;
      true
    }
    None => false,
  }
}

fn is_node(value: &Value, kind: &str) -> bool {
  matches!(member(value, "eType"), Some(Value::String(t)) if t == kind)
}

/// The game's layout with `<scripts><include src="...bridge..."/></scripts>`.
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

  let Some(Value::Array(children)) = member(&tree, "m_AST")
    .and_then(|ast| member(ast, "m_pRoot"))
    .and_then(|root| member(root, "vecChildren"))
  else {
    return Err(bad("no root"));
  };
  if children.iter().any(|node| is_node(node, "SCRIPTS")) {
    return Err(bad("it already loads scripts"));
  }
  // Built from the layout's own STYLES section so the new nodes carry exactly
  // the keys and types the game's compiler writes.
  let styles = children
    .iter()
    .find(|node| is_node(node, "STYLES"))
    .ok_or_else(|| bad("no styles"))?;
  let Some(Value::Array(includes)) = member(styles, "vecChildren") else {
    return Err(bad("no style includes"));
  };
  let mut include = includes
    .first()
    .cloned()
    .ok_or_else(|| bad("no style includes"))?;
  let mut reference = member(&include, "child")
    .cloned()
    .ok_or_else(|| bad("include without a reference"))?;
  let mut scripts = styles.clone();
  if !(set_member(
    &mut reference,
    "name",
    Value::String(SCRIPT_RESOURCE.into()),
  ) && set_member(&mut include, "child", reference)
    && set_member(&mut scripts, "eType", Value::String("SCRIPTS".into()))
    && set_member(&mut scripts, "vecChildren", Value::Array(vec![include])))
  {
    return Err(bad("unexpected node shape"));
  }

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

/// The compiled script: the template container with the bridge as its source.
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

/// Why the bridge files for the current game could not be built.
#[derive(Debug)]
enum ExpectedError {
  /// The game's files could not be read.
  Read(Error),
  /// The game's top-bar layout no longer has the shape the bridge patches.
  Incompatible(Error),
}

impl From<ExpectedError> for Error {
  fn from(error: ExpectedError) -> Self {
    match error {
      ExpectedError::Read(error) | ExpectedError::Incompatible(error) => error,
    }
  }
}

/// The two files a bridge built right now would hold: the current game's
/// layout with the include, and this build's script. Both builds are
/// deterministic, so an installed bridge is up to date exactly when its files
/// match these byte for byte.
fn expected_files(game_path: &Path) -> Result<(Vec<u8>, Vec<u8>), ExpectedError> {
  let pak_dir = game_path.join("game").join("citadel").join("pak01_dir.vpk");
  // Cached with the Foundry's: parsing pak01's directory takes about half a
  // second, and the archive is reopened once a patch changes it.
  let base = open_archive(&pak_dir, None)
    .and_then(|archive| extract(&archive, TEAM_LAYOUT))
    .map_err(ExpectedError::Read)?;
  let layout = patch_layout(&base).map_err(ExpectedError::Incompatible)?;
  Ok((layout, build_script().map_err(ExpectedError::Read)?))
}

/// One build at a time: the renderer's automatic update and the notice's
/// button can both start one, and they share the staging folder.
static BUILD_LOCK: Mutex<()> = Mutex::new(());

/// Writes the bridge VPK to `destination`, built from the game at `game_path`.
pub fn build(game_path: &Path, destination: &Path) -> Result<(), Error> {
  let _guard = BUILD_LOCK
    .lock()
    .map_err(|_| invalid("A previous live bridge build panicked"))?;
  let (layout, script) = expected_files(game_path)?;

  let work = std::env::temp_dir().join(format!("dmm-live-bridge-{}", std::process::id()));
  if work.exists() {
    fs::remove_dir_all(&work)?;
  }
  let result = (|| {
    for (path, bytes) in [(TEAM_LAYOUT, &layout), (SCRIPT_RESOURCE, &script)] {
      let target = work.join(path);
      if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
      }
      fs::write(target, bytes)?;
    }
    if let Some(parent) = destination.parent() {
      fs::create_dir_all(parent)?;
    }
    vpkmanager::pack_directory(&work, destination)
      .map(|_| ())
      .map_err(|error| invalid(format!("Could not pack the bridge: {error}")))
  })();
  let _ = fs::remove_dir_all(&work);
  result
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

/// `installed` is the bridge's file in the profile's addons folder, as the
/// library recorded it when the mod was enabled.
pub fn status(game_path: &Path, installed: Option<&Path>) -> BridgeStatus {
  let Some(installed) = installed.filter(|path| path.is_file()) else {
    return BridgeStatus::NotInstalled;
  };
  match expected_files(game_path) {
    Ok((layout, script)) => {
      let installed = VpkArchive::open(&installed).ok();
      let holds = |entry: &str, expected: &[u8]| {
        installed
          .as_ref()
          .and_then(|archive| archive.extract_entry(entry).ok())
          .is_some_and(|bytes| bytes == expected)
      };
      if holds(TEAM_LAYOUT, &layout) && holds(SCRIPT_RESOURCE, &script) {
        BridgeStatus::Current
      } else {
        BridgeStatus::Outdated
      }
    }
    Err(ExpectedError::Incompatible(error)) => {
      log::warn!("Live bridge: the game's top-bar layout cannot be patched: {error}");
      BridgeStatus::Incompatible
    }
    // A game that cannot be read is not a reason to call the bridge outdated.
    Err(ExpectedError::Read(error)) => {
      log::warn!("Live bridge: could not read the game's files: {error}");
      BridgeStatus::Current
    }
  }
}

/// Rebuilds the library's copy of the bridge and copies it over the enabled
/// one, so the game loads the new build and turning the mod off and on again
/// does not bring the old one back.
pub fn update(game_path: &Path, library_copy: &Path, installed: &Path) -> Result<(), Error> {
  build(game_path, library_copy)?;
  fs::copy(library_copy, installed)?;
  Ok(())
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

  /// Builds from a real install: `DMM_GAME_PATH=/path/to/Deadlock cargo test
  /// --lib live_bridge -- --ignored`.
  #[test]
  #[ignore = "needs an installed game"]
  fn builds_from_the_installed_game() {
    let game = std::env::var_os("DMM_GAME_PATH").expect("DMM_GAME_PATH");
    let out = std::env::temp_dir()
      .join("dmm-live-bridge-test")
      .join("pak01_dir.vpk");
    build(Path::new(&game), &out).unwrap();

    let files = VpkParser::parse_directory_from_file(&out).unwrap();
    let names: Vec<&str> = files.iter().map(|file| file.full_path.as_str()).collect();
    assert!(names.contains(&SCRIPT_RESOURCE));
    assert!(names.contains(&TEAM_LAYOUT));
    let game = Path::new(&game);
    assert_eq!(status(game, Some(&out)), BridgeStatus::Current);

    // A bridge from an older build: same layout, different script.
    fs::remove_file(&out).unwrap();
    let stale = std::env::temp_dir().join("dmm-live-bridge-test-stale");
    let (layout, _) = expected_files(game).unwrap();
    for (path, bytes) in [
      (TEAM_LAYOUT, layout.as_slice()),
      (SCRIPT_RESOURCE, SCRIPT_TEMPLATE),
    ] {
      let target = stale.join(path);
      fs::create_dir_all(target.parent().unwrap()).unwrap();
      fs::write(target, bytes).unwrap();
    }
    vpkmanager::pack_directory(&stale, &out).unwrap();
    assert_eq!(status(game, Some(&out)), BridgeStatus::Outdated);

    let copy = out.with_file_name("library-copy.vpk");
    update(game, &copy, &out).unwrap();
    assert_eq!(status(game, Some(&out)), BridgeStatus::Current);
    assert_eq!(fs::read(&copy).unwrap(), fs::read(&out).unwrap());
    let _ = fs::remove_dir_all(&stale);
    let _ = fs::remove_dir_all(out.parent().unwrap());
  }

  #[test]
  fn refuses_a_file_that_is_not_a_layout() {
    assert!(patch_layout(b"not a resource").is_err());
  }

  /// Packs `files` into `output`, the way an addon or the game's pak is laid out.
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
    // A game whose top-bar layout is no compiled layout the bridge knows.
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
}
