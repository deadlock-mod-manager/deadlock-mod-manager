use crate::errors::Error;
use crate::mod_manager::shard::{self, ProfileBase};
use std::{fs, io::ErrorKind, path::Path};

pub fn ensure_file_writable(path: &Path) -> Result<(), Error> {
  let metadata = match fs::metadata(path) {
    Ok(metadata) => metadata,
    Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
    Err(error) => return Err(error.into()),
  };
  #[cfg(unix)]
  let readonly = {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o200 == 0
  };
  #[cfg(windows)]
  let readonly = metadata.permissions().readonly();
  if metadata.is_file() && readonly {
    return Err(Error::ReadOnlyFile(path.to_path_buf()));
  }
  Ok(())
}

pub fn prepare_profile_for_write(addons_path: &Path) -> Result<(), Error> {
  fs::create_dir_all(addons_path)?;
  let base = ProfileBase::from_snapshot(addons_path)?;
  for (_, directory) in base.existing_shards() {
    for entry in fs::read_dir(directory)? {
      ensure_file_writable(&entry?.path())?;
    }
  }
  Ok(())
}

pub fn make_file_writable(game_path: &Path, path: &Path) -> Result<(), Error> {
  let change = || -> Result<(), Error> {
    let citadel = game_path.join("game/citadel").canonicalize()?;
    let resolved = path.canonicalize()?;
    let relative = resolved
      .strip_prefix(&citadel)
      .map_err(|_| Error::UnauthorizedPath(path.display().to_string()))?;
    let gameinfo = ["gameinfo.gi", "gameinfo.gi.bak", "gameinfo.gi.tmp"]
      .iter()
      .any(|name| relative == Path::new(name));
    let in_addons = shard::all_shards().any(|shard| relative.starts_with(shard.root_name()));
    let metadata = fs::metadata(&resolved)?;
    if !(gameinfo || in_addons) || !metadata.is_file() {
      return Err(Error::UnauthorizedPath(path.display().to_string()));
    }
    let mut permissions = metadata.permissions();
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      permissions.set_mode(permissions.mode() | 0o200);
    }
    #[cfg(windows)]
    #[allow(clippy::permissions_set_readonly_false)]
    permissions.set_readonly(false);
    fs::set_permissions(&resolved, permissions)?;
    Ok(())
  };
  change().map_err(|error| match error {
    Error::Io(source) => Error::MakeWritableFailed {
      path: path.to_path_buf(),
      source,
    },
    error => error,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn set_readonly(path: &Path) {
    let mut permissions = fs::metadata(path).unwrap().permissions();
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      permissions.set_mode(permissions.mode() & !0o222);
    }
    #[cfg(windows)]
    permissions.set_readonly(true);
    fs::set_permissions(path, permissions).unwrap();
  }

  #[test]
  fn readonly_error_names_the_file_and_serializes_its_path() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("gameinfo.gi");
    fs::write(&path, b"fixture").unwrap();
    set_readonly(&path);
    let error = ensure_file_writable(&path).unwrap_err();
    assert!(matches!(&error, Error::ReadOnlyFile(file) if file == &path));
    let json = serde_json::to_value(error).unwrap();
    assert_eq!(json["kind"], "readOnlyFile");
    assert_eq!(json["path"], path.to_str().unwrap());
    #[cfg(windows)]
    {
      let mut permissions = fs::metadata(&path).unwrap().permissions();
      permissions.set_readonly(false);
      fs::set_permissions(&path, permissions).unwrap();
    }
  }

  #[test]
  fn make_writable_only_changes_allowed_files() {
    let temp = tempfile::tempdir().unwrap();
    let game = temp.path();
    let citadel = game.join("game/citadel");
    fs::create_dir_all(citadel.join("addons2/profile")).unwrap();
    for name in ["gameinfo.gi", "addons2/profile/pak01_dir.vpk"] {
      let file = citadel.join(name);
      fs::write(&file, b"fixture").unwrap();
      set_readonly(&file);
      make_file_writable(game, &file).unwrap();
      ensure_file_writable(&file).unwrap();
      assert_eq!(fs::read(file).unwrap(), b"fixture");
    }
    for file in [game.join("outside.txt"), citadel.join("protected.txt")] {
      fs::write(&file, b"untouched").unwrap();
      let before = fs::metadata(&file).unwrap().permissions();
      assert!(matches!(
        make_file_writable(game, &file),
        Err(Error::UnauthorizedPath(_))
      ));
      assert_eq!(fs::metadata(file).unwrap().permissions(), before);
    }
    let directory = citadel.join("addons2/profile");
    let before = fs::metadata(&directory).unwrap().permissions();
    assert!(matches!(
      make_file_writable(game, &directory),
      Err(Error::UnauthorizedPath(_))
    ));
    assert_eq!(fs::metadata(directory).unwrap().permissions(), before);
  }

  #[cfg(windows)]
  #[test]
  fn make_writable_rejects_junctions_outside_citadel() {
    let temp = tempfile::tempdir().unwrap();
    let game = temp.path();
    let addons = game.join("game/citadel/addons");
    let outside = game.join("outside");
    fs::create_dir_all(&addons).unwrap();
    fs::create_dir_all(&outside).unwrap();
    let file = outside.join("fixture.vpk");
    fs::write(&file, b"untouched").unwrap();
    set_readonly(&file);
    junction::create(&outside, addons.join("linked")).unwrap();
    assert!(matches!(
      make_file_writable(game, &addons.join("linked/fixture.vpk")),
      Err(Error::UnauthorizedPath(_))
    ));
    assert!(fs::metadata(&file).unwrap().permissions().readonly());
    junction::delete(addons.join("linked")).unwrap();
    let mut permissions = fs::metadata(&file).unwrap().permissions();
    permissions.set_readonly(false);
    fs::set_permissions(file, permissions).unwrap();
  }

  #[test]
  fn make_writable_failure_includes_path_and_os_error() {
    let temp = tempfile::tempdir().unwrap();
    fs::create_dir_all(temp.path().join("game/citadel")).unwrap();
    let missing = temp.path().join("game/citadel/gameinfo.gi");
    let error = make_file_writable(temp.path(), &missing).unwrap_err();
    assert!(
      matches!(&error, Error::MakeWritableFailed { path, source } if path == &missing && source.kind() == ErrorKind::NotFound)
    );
    let serialized = serde_json::to_value(&error).unwrap();
    assert_eq!(serialized["kind"], "makeWritableFailed");
    assert_eq!(serialized["path"], missing.to_str().unwrap());
    assert!(error.to_string().contains("os error"));
  }

  #[cfg(unix)]
  #[test]
  fn make_writable_preserves_other_mode_bits_and_rejects_symlink_escapes() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let temp = tempfile::tempdir().unwrap();
    let game = temp.path();
    let addons = game.join("game/citadel/addons");
    fs::create_dir_all(&addons).unwrap();
    let file = addons.join("fixture.vpk");
    fs::write(&file, b"fixture").unwrap();
    fs::set_permissions(&file, fs::Permissions::from_mode(0o451)).unwrap();
    make_file_writable(game, &file).unwrap();
    assert_eq!(
      fs::metadata(file).unwrap().permissions().mode() & 0o777,
      0o651
    );
    let outside = game.join("outside");
    fs::write(&outside, b"fixture").unwrap();
    symlink(&outside, addons.join("link.vpk")).unwrap();
    assert!(matches!(
      make_file_writable(game, &addons.join("link.vpk")),
      Err(Error::UnauthorizedPath(_))
    ));
  }

  #[test]
  fn missing_addons_is_created_and_readonly_shards_are_rejected() {
    let temp = tempfile::tempdir().unwrap();
    let addons = temp.path().join("citadel/addons/profile");
    prepare_profile_for_write(&addons).unwrap();
    assert!(addons.is_dir());
    let shard = temp.path().join("citadel/addons2/profile");
    fs::create_dir_all(&shard).unwrap();
    let file = shard.join("pak01_dir.vpk");
    fs::write(&file, b"fixture").unwrap();
    set_readonly(&file);
    assert!(
      matches!(prepare_profile_for_write(&addons), Err(Error::ReadOnlyFile(path)) if path == file)
    );
    #[cfg(windows)]
    {
      let mut permissions = fs::metadata(&file).unwrap().permissions();
      permissions.set_readonly(false);
      fs::set_permissions(file, permissions).unwrap();
    }
  }
}
