use super::modding_workspace::ModdingAddon;
use crate::{app_runtime::AppHandle, errors::Error};
use std::path::Path;
fn create(sdk: &Path, name: &str) -> Result<(), Error> {
  if name.is_empty()
    || name.len() > 64
    || !name
      .bytes()
      .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
  {
    return Err(Error::InvalidInput(
      "Use 1–64 lowercase letters, numbers, or underscores for the addon name".into(),
    ));
  }
  if !sdk.join("game/citadel/gameinfo.gi").is_file() {
    return Err(Error::InvalidInput(
      "Select a CSDK12 installation before creating an addon".into(),
    ));
  }
  let content = sdk.join("content/citadel_addons").join(name);
  let game = sdk.join("game/citadel_addons").join(name);
  if content.symlink_metadata().is_ok() || game.symlink_metadata().is_ok() {
    return Err(Error::InvalidInput(
      "An addon with this name already exists".into(),
    ));
  }
  std::fs::create_dir_all(content.parent().unwrap())?;
  std::fs::create_dir_all(game.parent().unwrap())?;
  std::fs::create_dir(&content)?;
  if let Err(error) = std::fs::create_dir(&game) {
    std::fs::remove_dir(&content)?;
    return Err(error.into());
  }
  if let Err(error) = std::fs::write(
    game.join("addoninfo.txt"),
    format!("\"AddonInfo\"\n{{\n\t\"addontitle\" \"{name}\"\n}}\n"),
  ) {
    std::fs::remove_dir_all(&content)?;
    std::fs::remove_dir_all(&game)?;
    return Err(error.into());
  }
  Ok(())
}
#[tauri::command]
pub async fn create_modding_addon(app: AppHandle, name: String) -> Result<ModdingAddon, Error> {
  let config = super::modding_tools::get_modding_tools_config(app.clone())?;
  let sdk = if config.csdk.is_empty() {
    config.prepared_sdk
  } else {
    config.csdk
  };
  tauri::async_runtime::spawn_blocking(move || {
    create(Path::new(&sdk), &name)?;
    super::modding_workspace::list_modding_addons(app)?
      .into_iter()
      .find(|addon| addon.name == name && Path::new(&addon.sdk_root) == Path::new(&sdk))
      .ok_or_else(|| {
        Error::InvalidInput("Created addon was not discovered; refresh the addon list".into())
      })
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn creates_both_hierarchies_and_refuses_collisions_and_traversal() {
    let sdk = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(sdk.path().join("game/citadel")).unwrap();
    std::fs::write(sdk.path().join("game/citadel/gameinfo.gi"), b"fixture").unwrap();
    create(sdk.path(), "my_addon").unwrap();
    assert!(sdk.path().join("content/citadel_addons/my_addon").is_dir());
    assert!(
      sdk
        .path()
        .join("game/citadel_addons/my_addon/addoninfo.txt")
        .is_file()
    );
    for invalid in ["my_addon", "../escape", "Uppercase", "", "bad name"] {
      assert!(create(sdk.path(), invalid).is_err());
    }
  }
}
