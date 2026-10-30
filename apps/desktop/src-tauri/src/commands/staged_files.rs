use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::staged_files;
use std::path::{Component, Path, PathBuf};

/// Moves a staged file into a mod's folder. Kept out of the renderer: bytes
/// cross the IPC boundary as a JSON number array, so a large mod would cost
/// gigabytes there. Unguarded: it only touches app data, and the later install
/// into the game is guarded.
#[tauri::command]
pub async fn place_staged_file(
  app_handle: AppHandle,
  path: String,
  destination: String,
) -> Result<(), Error> {
  let staged = staged_files::peek(&path)?;
  let mods_root = crate::mod_manager::mods_store::dir(&app_handle)?;
  let destination = contained_destination(&mods_root, &destination)?;

  // Rename and copy both replace an existing file, such as another mod's metadata.
  if tokio::fs::try_exists(&destination).await? {
    return Err(Error::InvalidInput(format!(
      "{} already exists",
      destination.display()
    )));
  }

  if let Some(parent) = destination.parent() {
    tokio::fs::create_dir_all(parent).await?;
  }

  if tokio::fs::rename(&staged, &destination).await.is_err() {
    tokio::fs::copy(&staged, &destination).await?;
  }

  Ok(())
}

/// Checked rather than trusted, since it comes from the renderer. Traversal is
/// refused outright rather than normalised away.
fn contained_destination(mods_root: &Path, destination: &str) -> Result<PathBuf, Error> {
  let destination = PathBuf::from(destination);

  let escapes = destination
    .components()
    .any(|component| matches!(component, Component::ParentDir));

  if escapes || !destination.starts_with(mods_root) {
    return Err(Error::UnauthorizedPath(destination.display().to_string()));
  }

  Ok(destination)
}

#[cfg(test)]
mod tests {
  use super::contained_destination;
  use std::path::{Path, PathBuf};

  #[test]
  fn accepts_a_path_inside_the_mods_folder() {
    let root = Path::new("/home/u/.local/share/app/mods");
    let inside = "/home/u/.local/share/app/mods/local-1/files/mod.vpk";
    assert_eq!(
      contained_destination(root, inside).expect("should be allowed"),
      PathBuf::from(inside)
    );
  }

  #[test]
  fn refuses_anything_outside_the_mods_folder() {
    let root = Path::new("/home/u/.local/share/app/mods");
    for outside in [
      "/home/u/.bashrc",
      "/home/u/.local/share/app/mods/../../../.bashrc",
      "/home/u/.local/share/app/modsevil/mod.vpk",
      "relative/mod.vpk",
    ] {
      assert!(
        contained_destination(root, outside).is_err(),
        "{outside} should be refused"
      );
    }
  }
}
