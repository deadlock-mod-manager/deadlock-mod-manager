use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use log;
use std::{
  collections::HashSet,
  fs,
  path::{Component, Path, PathBuf},
};

const MANAGED_CONFIG_DIR: &str = ".dmm-config-mods";
const DISABLED_DIR: &str = "disabled";
const BACKUP_DIR: &str = "backup";
const CONFIG_EXTENSIONS: [&str; 2] = ["cfg", "ini"];

pub struct ConfigModManager {
  filesystem: FileSystemHelper,
}

impl ConfigModManager {
  pub fn new() -> Self {
    Self {
      filesystem: FileSystemHelper::new(),
    }
  }

  pub fn is_supported_config_file(path: &Path) -> bool {
    path
      .extension()
      .and_then(|extension| extension.to_str())
      .map(|extension| extension.to_ascii_lowercase())
      .is_some_and(|extension| CONFIG_EXTENSIONS.contains(&extension.as_str()))
  }

  pub fn collect_config_files_from_dir(
    &self,
    source_dir: &Path,
  ) -> Result<Vec<(PathBuf, String, u64)>, Error> {
    let mut files = Vec::new();
    self.collect_config_files_internal(source_dir, source_dir, &mut files)?;
    files.sort_by(|a, b| a.1.cmp(&b.1));
    Ok(files)
  }

  pub fn copy_config_files_to_staging(
    &self,
    source_dir: &Path,
    config_root: &Path,
    mod_id: &str,
    file_tree: Option<&crate::mod_manager::file_tree::ModFileTree>,
  ) -> Result<Vec<String>, Error> {
    Self::validate_mod_id(mod_id)?;
    let config_files = self.collect_config_files_from_dir(source_dir)?;
    let selected_paths = file_tree.map(|tree| {
      tree
        .files
        .iter()
        .filter(|file| file.is_selected && file.kind.is_config())
        .map(|file| file.path.replace('\\', "/"))
        .collect::<HashSet<_>>()
    });

    let disabled_dir = Self::disabled_dir(config_root, mod_id);
    let mut staged = Vec::new();

    for (source_path, relative_path, _) in config_files {
      if selected_paths
        .as_ref()
        .is_some_and(|selected| !selected.contains(&relative_path))
      {
        continue;
      }

      let relative = Self::safe_relative_path(&relative_path)?;
      let destination = disabled_dir.join(relative);
      self.filesystem.copy_file(&source_path, &destination)?;
      staged.push(relative_path);
    }

    staged.sort();
    staged.dedup();
    Ok(staged)
  }

  pub fn find_staged_config_files(
    &self,
    config_root: &Path,
    mod_id: &str,
  ) -> Result<Vec<String>, Error> {
    Self::validate_mod_id(mod_id)?;
    let disabled_dir = Self::disabled_dir(config_root, mod_id);
    if !disabled_dir.exists() {
      return Ok(Vec::new());
    }

    let mut files = Vec::new();
    self.collect_staged_files_internal(&disabled_dir, &disabled_dir, &mut files)?;
    files.sort();
    Ok(files)
  }

  pub fn enable_config_files(
    &self,
    config_root: &Path,
    mod_id: &str,
    staged_files: &[String],
  ) -> Result<Vec<String>, Error> {
    Self::validate_mod_id(mod_id)?;
    self.filesystem.create_directories(config_root)?;

    let disabled_dir = Self::disabled_dir(config_root, mod_id);
    let backup_dir = Self::backup_dir(config_root, mod_id);
    let mut enabled = Vec::new();

    for relative_path in staged_files {
      let relative = Self::safe_relative_path(relative_path)?;
      let source = disabled_dir.join(&relative);
      if !source.exists() {
        log::warn!(
          "Staged config file missing for mod {mod_id}: {}",
          relative_path
        );
        continue;
      }

      let destination = config_root.join(&relative);
      if destination.exists() {
        let backup = backup_dir.join(&relative);
        if !backup.exists() {
          self.filesystem.copy_file(&destination, &backup)?;
          log::info!(
            "Backed up existing config before enabling mod {mod_id}: {}",
            relative_path
          );
        }
      }

      self.filesystem.copy_file(&source, &destination)?;
      enabled.push(relative_path.replace('\\', "/"));
      log::info!("Enabled config file for mod {mod_id}: {relative_path}");
    }

    enabled.sort();
    enabled.dedup();
    Ok(enabled)
  }

  pub fn disable_config_files(
    &self,
    config_root: &Path,
    mod_id: &str,
    current_files: &[String],
  ) -> Result<Vec<String>, Error> {
    Self::validate_mod_id(mod_id)?;
    let disabled_dir = Self::disabled_dir(config_root, mod_id);
    let backup_dir = Self::backup_dir(config_root, mod_id);
    let mut disabled = Vec::new();

    for relative_path in current_files {
      let relative = Self::safe_relative_path(relative_path)?;
      let active = config_root.join(&relative);
      let staged = disabled_dir.join(&relative);

      if active.exists() {
        self.filesystem.copy_file(&active, &staged)?;
        self.filesystem.remove_file(&active)?;
        self.remove_empty_parent_dirs(config_root, active.parent())?;
      }

      let backup = backup_dir.join(&relative);
      if backup.exists() {
        self.filesystem.copy_file(&backup, &active)?;
        self.filesystem.remove_file(&backup)?;
        self.remove_empty_parent_dirs(&backup_dir, backup.parent())?;
      }

      if staged.exists() {
        disabled.push(relative_path.replace('\\', "/"));
      }
    }

    disabled.sort();
    disabled.dedup();
    Ok(disabled)
  }

  pub fn remove_config_files(
    &self,
    config_root: &Path,
    mod_id: &str,
    current_files: &[String],
  ) -> Result<(), Error> {
    Self::validate_mod_id(mod_id)?;
    let backup_dir = Self::backup_dir(config_root, mod_id);

    for relative_path in current_files {
      let relative = Self::safe_relative_path(relative_path)?;
      let active = config_root.join(&relative);
      if active.exists() {
        self.filesystem.remove_file(&active)?;
        self.remove_empty_parent_dirs(config_root, active.parent())?;
      }

      let backup = backup_dir.join(&relative);
      if backup.exists() {
        self.filesystem.copy_file(&backup, &active)?;
        self.filesystem.remove_file(&backup)?;
        self.remove_empty_parent_dirs(&backup_dir, backup.parent())?;
      }
    }

    let mod_dir = Self::mod_storage_dir(config_root, mod_id);
    self.filesystem.remove_directory_recursive(&mod_dir)?;
    Ok(())
  }

  fn collect_config_files_internal(
    &self,
    root: &Path,
    dir: &Path,
    files: &mut Vec<(PathBuf, String, u64)>,
  ) -> Result<(), Error> {
    if !dir.exists() {
      return Ok(());
    }

    for entry in fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();
      let metadata = fs::symlink_metadata(&path)?;
      let file_type = metadata.file_type();

      if file_type.is_symlink() {
        continue;
      }

      if file_type.is_dir() {
        self.collect_config_files_internal(root, &path, files)?;
      } else if file_type.is_file()
        && Self::is_supported_config_file(&path)
        && let Some(relative_path) = Self::config_relative_path(root, &path)?
      {
        files.push((path, relative_path, metadata.len()));
      }
    }

    Ok(())
  }

  fn collect_staged_files_internal(
    &self,
    root: &Path,
    dir: &Path,
    files: &mut Vec<String>,
  ) -> Result<(), Error> {
    for entry in fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();
      let metadata = fs::symlink_metadata(&path)?;
      let file_type = metadata.file_type();

      if file_type.is_symlink() {
        continue;
      }

      if file_type.is_dir() {
        self.collect_staged_files_internal(root, &path, files)?;
      } else if file_type.is_file() && Self::is_supported_config_file(&path) {
        let relative = path
          .strip_prefix(root)
          .map_err(|_| Error::InvalidInput("Invalid staged config path".to_string()))?
          .to_string_lossy()
          .replace('\\', "/");
        files.push(relative);
      }
    }

    Ok(())
  }

  fn config_relative_path(root: &Path, file_path: &Path) -> Result<Option<String>, Error> {
    let relative = file_path
      .strip_prefix(root)
      .map_err(|_| Error::InvalidInput("Invalid config source path".to_string()))?;

    let mut parts = Vec::new();
    for component in relative.components() {
      match component {
        Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
        Component::CurDir => {}
        _ => {
          return Err(Error::InvalidInput(format!(
            "Invalid config file path: {}",
            relative.display()
          )));
        }
      }
    }

    if let Some(cfg_index) = parts
      .iter()
      .position(|part| part.eq_ignore_ascii_case("cfg"))
    {
      parts = parts.split_off(cfg_index + 1);
    }

    if parts.is_empty() {
      return Ok(None);
    }

    let relative_path = parts.join("/");
    Self::safe_relative_path(&relative_path)?;
    Ok(Some(relative_path))
  }

  fn safe_relative_path(relative_path: &str) -> Result<PathBuf, Error> {
    if relative_path.trim().is_empty() {
      return Err(Error::InvalidInput(
        "Config file path cannot be empty".to_string(),
      ));
    }

    let path = Path::new(relative_path);
    if path.is_absolute() {
      return Err(Error::InvalidInput(format!(
        "Config file path must be relative: {relative_path}"
      )));
    }

    let mut safe_path = PathBuf::new();
    for component in path.components() {
      match component {
        Component::Normal(part) => safe_path.push(part),
        Component::CurDir => {}
        _ => {
          return Err(Error::InvalidInput(format!(
            "Config file path contains unsafe components: {relative_path}"
          )));
        }
      }
    }

    if safe_path.as_os_str().is_empty() {
      return Err(Error::InvalidInput(
        "Config file path cannot be empty".to_string(),
      ));
    }

    Ok(safe_path)
  }

  fn validate_mod_id(mod_id: &str) -> Result<(), Error> {
    if mod_id.is_empty() || mod_id.contains('/') || mod_id.contains('\\') || mod_id.contains("..") {
      return Err(Error::InvalidInput(format!(
        "Invalid mod ID for config files: {mod_id}"
      )));
    }

    Ok(())
  }

  fn mod_storage_dir(config_root: &Path, mod_id: &str) -> PathBuf {
    config_root.join(MANAGED_CONFIG_DIR).join(mod_id)
  }

  fn disabled_dir(config_root: &Path, mod_id: &str) -> PathBuf {
    Self::mod_storage_dir(config_root, mod_id).join(DISABLED_DIR)
  }

  fn backup_dir(config_root: &Path, mod_id: &str) -> PathBuf {
    Self::mod_storage_dir(config_root, mod_id).join(BACKUP_DIR)
  }

  fn remove_empty_parent_dirs(&self, stop_at: &Path, start: Option<&Path>) -> Result<(), Error> {
    let Some(mut current) = start.map(Path::to_path_buf) else {
      return Ok(());
    };

    while current.starts_with(stop_at) && current != stop_at {
      match fs::read_dir(&current) {
        Ok(mut entries) => {
          if entries.next().is_some() {
            break;
          }

          fs::remove_dir(&current)?;
          if let Some(parent) = current.parent() {
            current = parent.to_path_buf();
          } else {
            break;
          }
        }
        _ => break,
      }
    }

    Ok(())
  }
}

impl Default for ConfigModManager {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn collects_cfg_and_ini_files_with_safe_relative_paths() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("game/citadel/cfg/nested")).unwrap();
    fs::write(root.join("game/citadel/cfg/autoexec.cfg"), b"exec test").unwrap();
    fs::write(root.join("game/citadel/cfg/nested/preset.ini"), b"[preset]").unwrap();
    fs::write(root.join("readme.txt"), b"ignored").unwrap();

    let files = ConfigModManager::new()
      .collect_config_files_from_dir(root)
      .unwrap();
    let paths: Vec<String> = files.into_iter().map(|(_, path, _)| path).collect();

    assert_eq!(
      paths,
      vec!["autoexec.cfg".to_string(), "nested/preset.ini".to_string()]
    );
  }

  #[test]
  fn enable_and_disable_config_files_restore_existing_user_file() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    let config_root = temp.path().join("cfg");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&config_root).unwrap();
    fs::write(source.join("autoexec.cfg"), b"modded").unwrap();
    fs::write(config_root.join("autoexec.cfg"), b"user").unwrap();

    let manager = ConfigModManager::new();
    let staged = manager
      .copy_config_files_to_staging(&source, &config_root, "local-test", None)
      .unwrap();
    assert_eq!(staged, vec!["autoexec.cfg".to_string()]);

    let enabled = manager
      .enable_config_files(&config_root, "local-test", &staged)
      .unwrap();
    assert_eq!(enabled, vec!["autoexec.cfg".to_string()]);
    assert_eq!(
      fs::read(config_root.join("autoexec.cfg")).unwrap(),
      b"modded"
    );

    let disabled = manager
      .disable_config_files(&config_root, "local-test", &enabled)
      .unwrap();
    assert_eq!(disabled, vec!["autoexec.cfg".to_string()]);
    assert_eq!(fs::read(config_root.join("autoexec.cfg")).unwrap(), b"user");
  }

  #[cfg(unix)]
  #[test]
  fn staged_config_scan_ignores_symlinks() {
    use std::os::unix::fs::symlink;

    let temp = tempfile::tempdir().unwrap();
    let config_root = temp.path().join("cfg");
    let disabled_dir = ConfigModManager::disabled_dir(&config_root, "local-test");
    fs::create_dir_all(&disabled_dir).unwrap();
    fs::write(temp.path().join("outside.cfg"), b"outside").unwrap();
    symlink(
      temp.path().join("outside.cfg"),
      disabled_dir.join("link.cfg"),
    )
    .unwrap();

    let files = ConfigModManager::new()
      .find_staged_config_files(&config_root, "local-test")
      .unwrap();

    assert!(files.is_empty());
  }
}
