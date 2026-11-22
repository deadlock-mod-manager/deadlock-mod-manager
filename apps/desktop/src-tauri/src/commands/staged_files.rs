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
  resolves_within(&mods_root, &destination)?;

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

/// A symlink or junction inside the mods folder passes the lexical check while
/// pointing elsewhere, so the deepest folder that exists is resolved as well.
fn resolves_within(mods_root: &Path, destination: &Path) -> Result<(), Error> {
  let unauthorized = || Error::UnauthorizedPath(destination.display().to_string());
  let root = mods_root.canonicalize().map_err(|_| unauthorized())?;
  let existing = destination
    .ancestors()
    .find(|ancestor| ancestor.exists())
    .ok_or_else(unauthorized)?;
  let resolved = existing.canonicalize().map_err(|_| unauthorized())?;

  if resolved.starts_with(&root) {
    Ok(())
  } else {
    Err(unauthorized())
  }
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

  #[cfg(unix)]
  #[test]
  fn refuses_a_symlink_inside_the_mods_folder_that_points_out() {
    use super::resolves_within;

    let workspace = tempfile::tempdir().unwrap();
    let mods_root = workspace.path().join("mods");
    let outside = workspace.path().join("outside");
    std::fs::create_dir_all(&mods_root).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    std::os::unix::fs::symlink(&outside, mods_root.join("local-1")).unwrap();

    let through_link = mods_root.join("local-1/files/mod.vpk");
    assert!(contained_destination(&mods_root, &through_link.to_string_lossy()).is_ok());
    assert!(resolves_within(&mods_root, &through_link).is_err());
    assert!(resolves_within(&mods_root, &mods_root.join("local-2/files/mod.vpk")).is_ok());
  }
}
