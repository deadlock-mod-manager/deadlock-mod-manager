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
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::Serialize;
use vpk_parser::VpkParser;
use vpkmanager::source2::kv3::{self, Seg, Value};
use vpkmanager::source2::resource::Resource;

use crate::errors::Error;

const BRIDGE_SOURCE: &str = include_str!("dmm_live_bridge.js");
/// An empty compiled-script container (`RED2` naming the bridge, empty `DATA`);
/// building a script swaps the source into its `DATA` block.
const SCRIPT_TEMPLATE: &[u8] = include_bytes!("script_template.vjs_c");

const SCRIPT_RESOURCE: &str = "panorama/scripts/dmm_live_bridge.vjs_c";
const TEAM_LAYOUT: &str = "panorama/layout/citadel_hud_top_bar_team.vxml_c";
const VPK_SIGNATURE: u32 = 0x55AA_1234;
/// Entries stored in the `_dir.vpk` itself rather than a numbered archive.
const DIR_ARCHIVE: u16 = 0x7FFF;

fn invalid(message: impl Into<String>) -> Error {
  Error::InvalidInput(message.into())
}

/// One file out of a VPK (the game's `pak01` or an addon), with its inline
/// preload prefix.
fn read_vpk_file(pak_dir: &Path, wanted: &str) -> Result<Vec<u8>, Error> {
  let mut header = [0u8; 12];
  fs::File::open(pak_dir)?.read_exact(&mut header)?;
  if u32::from_le_bytes([header[0], header[1], header[2], header[3]]) != VPK_SIGNATURE {
    return Err(invalid(format!("{} is not a VPK", pak_dir.display())));
  }
  let version = u32::from_le_bytes([header[4], header[5], header[6], header[7]]);
  let tree_length = u64::from(u32::from_le_bytes([
    header[8], header[9], header[10], header[11],
  ]));
  let data_start = if version >= 2 { 28 } else { 12 } + tree_length;

  let entries = VpkParser::parse_directory_with_preload_from_file(pak_dir)
    .map_err(|error| invalid(format!("Could not read {}: {error}", pak_dir.display())))?;
  let (entry, preload) = entries
    .into_iter()
    .find(|(entry, _)| entry.full_path.eq_ignore_ascii_case(wanted))
    .ok_or_else(|| invalid(format!("{} has no {wanted}", pak_dir.display())))?;

  let (source, offset) = if entry.archive_index == DIR_ARCHIVE {
    (
      pak_dir.to_path_buf(),
      data_start + u64::from(entry.entry_offset),
    )
  } else {
    // `pak01_dir.vpk` keeps its data in `pak01_000.vpk`, `pak01_001.vpk`, ...
    let stem = pak_dir
      .file_name()
      .and_then(|name| name.to_str())
      .and_then(|name| name.strip_suffix("_dir.vpk"))
      .ok_or_else(|| invalid(format!("{} is not a _dir.vpk", pak_dir.display())))?;
    let name = format!("{stem}_{:03}.vpk", entry.archive_index);
    (pak_dir.with_file_name(name), u64::from(entry.entry_offset))
  };

  let mut bytes = preload;
  let mut file = fs::File::open(source)?;
  file.seek(SeekFrom::Start(offset))?;
  let start = bytes.len();
  bytes.resize(start + entry.entry_length as usize, 0);
  file.read_exact(&mut bytes[start..])?;
  Ok(bytes)
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

/// The two files a bridge built right now would hold: the current game's
/// layout with the include, and this build's script. Both builds are
/// deterministic, so an installed bridge is up to date exactly when its files
/// match these byte for byte.
fn expected_files(game_path: &Path) -> Result<(Vec<u8>, Vec<u8>), Error> {
  let pak_dir = game_path.join("game").join("citadel").join("pak01_dir.vpk");
  let layout = patch_layout(&read_vpk_file(&pak_dir, TEAM_LAYOUT)?)?;
  Ok((layout, build_script()?))
}

/// Writes the bridge VPK to `destination`, built from the game at `game_path`.
pub fn build(game_path: &Path, destination: &Path) -> Result<(), Error> {
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

/// The addon VPK in `addons_dir` that carries the bridge script, however it got
/// there. Only directory trees are read, never the archives' contents.
fn find_installed(addons_dir: &Path) -> Option<PathBuf> {
  fs::read_dir(addons_dir)
    .ok()?
    .flatten()
    .map(|entry| entry.path())
    .find(|path| {
      let is_dir_vpk = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.ends_with("_dir.vpk"));
      is_dir_vpk
        && VpkParser::parse_directory_from_file(path).is_ok_and(|files| {
          files
            .iter()
            .any(|file| file.full_path.eq_ignore_ascii_case(SCRIPT_RESOURCE))
        })
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatus {
  /// In the addons folder, so the game loads it.
  pub installed: bool,
  /// Built from an older game layout or an older bridge script.
  pub outdated: bool,
}

pub fn status(game_path: &Path, addons_dir: &Path) -> BridgeStatus {
  let Some(installed) = find_installed(addons_dir) else {
    return BridgeStatus {
      installed: false,
      outdated: false,
    };
  };
  let outdated = match expected_files(game_path) {
    Ok((layout, script)) => {
      read_vpk_file(&installed, TEAM_LAYOUT).ok().as_deref() != Some(layout.as_slice())
        || read_vpk_file(&installed, SCRIPT_RESOURCE).ok().as_deref() != Some(script.as_slice())
    }
    // A game that cannot be read is not a reason to call the bridge outdated.
    Err(error) => {
      log::warn!("Live bridge: could not build the expected files: {error}");
      false
    }
  };
  BridgeStatus {
    installed: true,
    outdated,
  }
}

/// Rebuilds the installed bridge in place, and the library's copy with it so
/// turning the mod off and on again does not bring the old one back. The addon
/// keeps its file name, so the library's record of it stays valid.
pub fn update(
  game_path: &Path,
  addons_dir: &Path,
  library_copy: Option<&Path>,
) -> Result<(), Error> {
  let installed = find_installed(addons_dir)
    .ok_or_else(|| invalid("The live bridge is not installed in this profile"))?;
  build(game_path, &installed)?;
  if let Some(copy) = library_copy {
    fs::copy(&installed, copy)?;
  }
  Ok(())
}

#[cfg(test)]
mod tests {
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
    // Named like an addon so the installed check treats it as one.
    let out = std::env::temp_dir()
      .join("dmm-live-bridge-test")
      .join("pak01_dir.vpk");
    build(Path::new(&game), &out).unwrap();

    let files = VpkParser::parse_directory_from_file(&out).unwrap();
    let names: Vec<&str> = files.iter().map(|file| file.full_path.as_str()).collect();
    assert!(names.contains(&SCRIPT_RESOURCE));
    assert!(names.contains(&TEAM_LAYOUT));
    let addons = out.parent().unwrap();
    let game = Path::new(&game);
    let current = BridgeStatus {
      installed: true,
      outdated: false,
    };
    assert_eq!(status(game, addons), current);

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
    assert!(status(game, addons).outdated);

    let copy = addons.join("library-copy.vpk");
    update(game, addons, Some(&copy)).unwrap();
    assert_eq!(status(game, addons), current);
    assert_eq!(fs::read(&copy).unwrap(), fs::read(&out).unwrap());
    let _ = fs::remove_dir_all(&stale);
    let _ = fs::remove_dir_all(out.parent().unwrap());
  }

  #[test]
  fn refuses_a_file_that_is_not_a_layout() {
    assert!(patch_layout(b"not a resource").is_err());
  }
}
