use super::modding_workspace::{ModdingAddon, mount};
use crate::errors::Error;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::Path;

pub(super) fn select(sdk: &Path, addon: Option<&ModdingAddon>) -> Result<String, Error> {
  let mut root_name = None;
  let name = if let Some(addon) = addon {
    mount(addon, sdk)?;
    let game = Path::new(&addon.game_path).canonicalize()?;
    let content = Path::new(&addon.content_path).canonicalize()?;
    let game_parent = game
      .parent()
      .ok_or_else(|| Error::InvalidInput("Missing addon game parent".into()))?;
    let content_parent = content
      .parent()
      .ok_or_else(|| Error::InvalidInput("Missing addon content parent".into()))?;
    if game_parent != sdk.join("game/citadel_addons").canonicalize()? {
      let identity = format!(
        "{:x}",
        Sha256::digest(game_parent.to_string_lossy().as_bytes())
      );
      let alias = format!("dmm_external_{}", &identity[..16]);
      // Addon discovery skips links to individual addons. Link their parent so
      // the engine enumerates the original directories and derives both trees.
      for (tree, original) in [("game", game_parent), ("content", content_parent)] {
        let linked = sdk.join(tree).join(&alias);
        if linked.symlink_metadata().is_ok() {
          if linked.canonicalize()? != original {
            return Err(Error::InvalidInput(
              "Another directory occupies the editor addon root".into(),
            ));
          }
        } else {
          crate::mod_manager::filesystem_helper::FileSystemHelper::new()
            .create_directory_symlink(original, &linked)?;
        }
      }
      root_name = Some(alias);
    }
    game
      .file_name()
      .and_then(|name| name.to_str())
      .ok_or_else(|| Error::InvalidInput("Invalid addon name".into()))?
      .to_owned()
  } else {
    source2_tools::WORKBENCH_ADDON.to_owned()
  };
  let path = sdk.join("game/citadel/gameinfo.gi");
  let previous = std::fs::read_to_string(&path)?;
  let updated = source2_tools::editor_addon_root(&previous, root_name.as_deref())
    .map_err(|error| Error::InvalidInput(error.to_string()))?;
  if previous != updated {
    let mut file = tempfile::NamedTempFile::new_in(
      path
        .parent()
        .ok_or_else(|| Error::InvalidInput("Missing SDK project directory".into()))?,
    )?;
    file.write_all(updated.as_bytes())?;
    file.as_file().sync_all()?;
    file.persist(path).map_err(|error| error.error)?;
  }
  Ok(name)
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn editor_mounts_original_addon_parents_and_keeps_edits_in_the_original_folders() {
    let temp = tempfile::tempdir().unwrap();
    let sdk = temp.path().join("prepared");
    let original = temp.path().join("original");
    for directory in [
      "game/citadel",
      "game/citadel_addons/dmm_workbench",
      "content/citadel_addons",
    ] {
      std::fs::create_dir_all(sdk.join(directory)).unwrap();
    }
    std::fs::create_dir_all(sdk.join("game/citadel/tools")).unwrap();
    std::fs::write(
      sdk.join("game/citadel/tools/modeldoc_editor_presets.txt"),
      "fixture",
    )
    .unwrap();
    std::fs::write(
      sdk.join("game/citadel_addons/dmm_workbench/toolscenelightrigs.vdata_c"),
      "fixture",
    )
    .unwrap();
    std::fs::write(
      sdk.join("game/citadel/gameinfo.gi"),
      "FileSystem { SearchPaths {\n Game citadel\n AddonRoot citadel_addons\n } }",
    )
    .unwrap();
    let game = original.join("game/citadel_addons/beeskulls");
    let content = original.join("content/citadel_addons/beeskulls");
    std::fs::create_dir_all(&game).unwrap();
    std::fs::create_dir_all(&content).unwrap();
    let addon = ModdingAddon {
      id: "0123456789abcdef0123456789abcdef".into(),
      name: "beeskulls".into(),
      sdk_root: original.to_string_lossy().into_owned(),
      content_path: content.to_string_lossy().into_owned(),
      game_path: game.to_string_lossy().into_owned(),
      archive_path: String::new(),
    };
    assert_eq!(select(&sdk, Some(&addon)).unwrap(), "beeskulls");
    let metadata = std::fs::read_to_string(sdk.join("game/citadel/gameinfo.gi")).unwrap();
    let alias = metadata
      .lines()
      .find_map(|line| line.trim().strip_prefix("AddonRoot dmm_external_"))
      .unwrap();
    let root = format!("dmm_external_{alias}");
    assert!(
      std::fs::symlink_metadata(sdk.join("game").join(&root).join("beeskulls"))
        .unwrap()
        .is_dir()
    );
    let mounted_content = sdk.join("content").join(&root).join("beeskulls");
    std::fs::write(mounted_content.join("edited.txt"), "original edit").unwrap();
    assert_eq!(
      std::fs::read_to_string(content.join("edited.txt")).unwrap(),
      "original edit"
    );
    assert_eq!(select(&sdk, Some(&addon)).unwrap(), "beeskulls");
    assert_eq!(
      std::fs::read_to_string(sdk.join("game/citadel/gameinfo.gi")).unwrap(),
      metadata
    );
    assert_eq!(select(&sdk, None).unwrap(), source2_tools::WORKBENCH_ADDON);
    assert!(
      !std::fs::read_to_string(sdk.join("game/citadel/gameinfo.gi"))
        .unwrap()
        .contains("dmm_external_")
    );
  }
}
