use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use crate::mod_manager::fs_retry;
use crate::mod_manager::shard;
use log;
use regex::Regex;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

/// Final placement of a mod's enabled VPKs after a sharded reorder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShardPlacement {
  pub mod_id: String,
  /// 1-based shard index the VPKs now live in.
  pub shard: u32,
  /// New `pak##_dir.vpk` filenames within that shard, in order.
  pub vpks: Vec<String>,
}

#[derive(Debug)]
struct StagedVpk {
  staged_path: PathBuf,
}

/// How to handle enabled VPK files that are recorded but missing on disk.
pub enum MissingVpkPolicy {
  /// Fail if any recorded enabled VPK file is missing (variant switch, swap).
  Strict,
  /// Filter missing files, warn, and proceed with those that exist (uninstall/disable).
  Reconcile,
}

/// Manages VPK file operations and installation
pub struct VpkManager {
  filesystem: FileSystemHelper,
}

impl VpkManager {
  pub fn new() -> Self {
    Self {
      filesystem: FileSystemHelper::new(),
    }
  }

  /// Count enabled `pak##_dir.vpk` files directly inside `dir` (non-recursive).
  pub fn count_enabled_vpks(dir: &Path) -> u32 {
    let Ok(entries) = fs::read_dir(dir) else {
      return 0;
    };
    entries
      .flatten()
      .filter(|entry| {
        let path = entry.path();
        path.is_file()
          && path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(Self::is_enabled_vpk_name)
      })
      .count() as u32
  }

  pub fn has_out_of_range_enabled_vpks(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
      return false;
    };
    entries.flatten().any(|entry| {
      entry
        .file_name()
        .to_str()
        .and_then(Self::enabled_vpk_number)
        .is_some_and(|number| number > shard::SHARD_CAPACITY)
    })
  }

  pub fn find_next_available_vpk_number(&self, addons_path: &Path) -> Result<u32, Error> {
    if !addons_path.exists() {
      return Ok(1);
    }

    let mut used_numbers = std::collections::HashSet::new();

    for entry in fs::read_dir(addons_path)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_file()
        && path.extension().is_some_and(|ext| ext == "vpk")
        && let Some(name) = path.file_name().and_then(|n| n.to_str())
        && let Some(num) = Self::enabled_vpk_number(name)
      {
        used_numbers.insert(num);
      }
    }

    // Find first available number starting from 1
    let mut next_number = 1u32;
    while used_numbers.contains(&next_number) {
      next_number += 1;
    }

    Ok(next_number)
  }

  /// Reorder enabled VPKs across shard directories.
  ///
  /// `ordered_mods` is `(mod_id, current_shard, current pak filenames)` already
  /// sorted by desired global order. Mods are packed sequentially into shards
  /// (`SHARD_CAPACITY` VPKs each), never splitting a single mod across shards, so
  /// the global load order is preserved: shard 1 (base) holds the lowest-order
  /// mods, shard 2 the next block, and so on.
  pub fn reorder_vpks_sharded(
    &self,
    ordered_mods: &[(String, u32, Vec<String>)],
    base: &Path,
  ) -> Result<Vec<ShardPlacement>, Error> {
    self.reorder_vpks_sharded_with_commit(ordered_mods, base, |_| Ok(()))
  }

  pub fn reorder_vpks_sharded_with_commit<F>(
    &self,
    ordered_mods: &[(String, u32, Vec<String>)],
    base: &Path,
    commit: F,
  ) -> Result<Vec<ShardPlacement>, Error>
  where
    F: FnOnce(&[ShardPlacement]) -> Result<(), Error>,
  {
    if !base.exists() {
      return Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Addons path not found: {base:?}"),
      )));
    }

    log::info!(
      "Starting sharded VPK reordering for {} mods",
      ordered_mods.len()
    );

    let temp_dir = base.join(".dmm-reorder");
    if temp_dir.exists() {
      log::warn!("Recovering VPK files left by an interrupted reorder");
      Self::restore_staged_files(base, &temp_dir)?;
      fs::remove_dir_all(&temp_dir)?;
    }

    let duplicate_assignments = Self::duplicate_sharded_assignments(ordered_mods);
    if !duplicate_assignments.is_empty() {
      return Err(Error::ModInvalid(format!(
        "Cannot reorder mods because VPK files are assigned to multiple mods: {}",
        duplicate_assignments.join("; ")
      )));
    }

    let mut missing_vpks = Vec::new();
    for (mod_id, shard_index, old_vpk_names) in ordered_mods {
      let dir = shard::shard_dir(base, *shard_index);
      for old_vpk_name in old_vpk_names {
        let filename = Self::vpk_filename(old_vpk_name);
        if !dir.join(&filename).exists() {
          missing_vpks.push(format!("{mod_id}:{filename}"));
        }
      }
    }

    if !missing_vpks.is_empty() {
      return Err(Error::ModInvalid(format!(
        "Cannot reorder mods because enabled VPK files are missing: {}",
        missing_vpks.join(", ")
      )));
    }

    let owned_vpks: std::collections::HashSet<(u32, String)> = ordered_mods
      .iter()
      .flat_map(|(_, shard_index, vpks)| {
        vpks
          .iter()
          .map(|vpk| (*shard_index, Self::vpk_filename(vpk)))
      })
      .collect();
    let orphan_sources = Self::find_orphaned_enabled_vpks(base, &owned_vpks)?;
    Self::validate_reorder_capacity(ordered_mods, orphan_sources.len() as u32)?;

    fs::create_dir_all(&temp_dir)?;

    let result = Self::reorder_sharded_inner(ordered_mods, orphan_sources, base, &temp_dir, commit);

    match &result {
      Ok(_) => {
        let _ = fs::remove_dir_all(&temp_dir);
        Self::prune_empty_shard_dirs(base);
        log::info!("Sharded VPK reordering completed successfully");
      }
      Err(e) => {
        log::error!("Sharded reorder failed and was rolled back: {e}");
        if fs::read_dir(&temp_dir)
          .ok()
          .is_some_and(|mut entries| entries.next().is_none())
        {
          let _ = fs::remove_dir(&temp_dir);
        }
      }
    }

    result
  }

  /// Move every enabled VPK into `temp_dir` (grouped by mod, orphans last), then
  /// place them back sequentially across shards. Uses `?`; on early return any
  /// files still in `temp_dir` are recovered by the caller.
  fn reorder_sharded_inner<F>(
    ordered_mods: &[(String, u32, Vec<String>)],
    orphan_sources: Vec<(u32, PathBuf)>,
    base: &Path,
    temp_dir: &Path,
    commit: F,
  ) -> Result<Vec<ShardPlacement>, Error>
  where
    F: FnOnce(&[ShardPlacement]) -> Result<(), Error>,
  {
    let mut staged_by_mod: Vec<(String, Vec<StagedVpk>)> = Vec::new();
    let mut orphan_staged = Vec::new();
    let mut placed: Vec<(PathBuf, PathBuf)> = Vec::new();

    let result = (|| {
      for (mod_id, shard_index, vpks) in ordered_mods {
        let dir = shard::shard_dir(base, *shard_index);
        let mut staged = Vec::new();
        for vpk in vpks {
          staged.push(Self::stage_vpk(
            temp_dir,
            *shard_index,
            dir.join(Self::vpk_filename(vpk)),
          )?);
        }
        staged_by_mod.push((mod_id.clone(), staged));
      }

      for (shard_index, source) in orphan_sources {
        orphan_staged.push(Self::stage_vpk(temp_dir, shard_index, source)?);
      }

      let mut placements = Vec::new();
      let mut current_shard = 1u32;
      let mut used = 0u32;

      for (mod_id, staged) in &staged_by_mod {
        let (shard_used, names) =
          Self::place_staged_group(base, &mut current_shard, &mut used, staged, &mut placed)?;
        placements.push(ShardPlacement {
          mod_id: mod_id.clone(),
          shard: shard_used,
          vpks: names,
        });
      }

      for orphan in &orphan_staged {
        Self::place_staged_group(
          base,
          &mut current_shard,
          &mut used,
          std::slice::from_ref(orphan),
          &mut placed,
        )?;
      }

      commit(&placements)?;
      Ok(placements)
    })();

    if let Err(error) = result {
      return Err(Self::rollback_reorder(base, temp_dir, placed, error));
    }

    result
  }

  fn stage_vpk(
    temp_dir: &Path,
    shard_index: u32,
    original_path: PathBuf,
  ) -> Result<StagedVpk, Error> {
    let filename = original_path
      .file_name()
      .and_then(|name| name.to_str())
      .ok_or_else(|| Error::ModInvalid("VPK filename is not valid UTF-8".to_string()))?;
    let staged_path = temp_dir.join(format!("s{shard_index}__{filename}"));
    fs::rename(&original_path, &staged_path)?;
    Ok(StagedVpk { staged_path })
  }

  /// Move a group of staged files into the current shard, opening a new shard
  /// first if the group would overflow `SHARD_CAPACITY`. The whole group always
  /// lands in one shard so a mod's VPKs stay together. Returns the shard used
  /// and the new pak filenames.
  fn place_staged_group(
    base: &Path,
    current_shard: &mut u32,
    used: &mut u32,
    staged: &[StagedVpk],
    placed: &mut Vec<(PathBuf, PathBuf)>,
  ) -> Result<(u32, Vec<String>), Error> {
    let count = staged.len() as u32;
    if count > 0 && *used + count > shard::SHARD_CAPACITY {
      *current_shard += 1;
      *used = 0;
      if *current_shard > shard::MAX_SHARDS {
        return Err(Error::ModInvalid(format!(
          "Cannot enable this many VPK files: all {} addon shard folders are full ({} files each, ~{} total). Disable some mods first.",
          shard::MAX_SHARDS,
          shard::SHARD_CAPACITY,
          shard::MAX_SHARDS * shard::SHARD_CAPACITY
        )));
      }
    }
    let dir = shard::shard_dir(base, *current_shard);
    fs::create_dir_all(&dir)?;
    let mut names = Vec::new();
    for staged_vpk in staged {
      *used += 1;
      let new_name = format!("pak{:02}_dir.vpk", *used);
      let destination = dir.join(&new_name);
      fs::rename(&staged_vpk.staged_path, &destination)?;
      placed.push((destination, staged_vpk.staged_path.clone()));
      names.push(new_name);
    }
    Ok((*current_shard, names))
  }

  fn rollback_reorder(
    base: &Path,
    temp_dir: &Path,
    placed: Vec<(PathBuf, PathBuf)>,
    original_error: Error,
  ) -> Error {
    let mut failures = Vec::new();
    for (current, staged) in placed.into_iter().rev() {
      if let Err(error) = fs::rename(&current, &staged) {
        failures.push(format!(
          "{} -> {}: {error}",
          current.display(),
          staged.display()
        ));
      }
    }
    if let Err(error) = Self::restore_staged_files(base, temp_dir) {
      failures.push(error.to_string());
    }

    if failures.is_empty() {
      original_error
    } else {
      Error::RollbackFailed(format!(
        "Original error: {original_error}. Failed to roll back: {}",
        failures.join("; ")
      ))
    }
  }

  fn restore_staged_files(base: &Path, temp_dir: &Path) -> Result<(), Error> {
    if !temp_dir.exists() {
      return Ok(());
    }

    for entry in fs::read_dir(temp_dir)? {
      let staged_path = entry?.path();
      let Some(staged_name) = staged_path.file_name().and_then(|name| name.to_str()) else {
        continue;
      };
      let Some((shard_prefix, filename)) = staged_name.split_once("__") else {
        return Err(Error::RollbackFailed(format!(
          "Cannot recover unrecognized reorder file {}",
          staged_path.display()
        )));
      };
      let shard_index = shard_prefix
        .strip_prefix('s')
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|value| (1..=shard::MAX_SHARDS).contains(value))
        .ok_or_else(|| {
          Error::RollbackFailed(format!(
            "Cannot recover reorder file with invalid shard: {}",
            staged_path.display()
          ))
        })?;
      let original_dir = shard::shard_dir(base, shard_index);
      fs::create_dir_all(&original_dir)?;
      let mut destination = original_dir.join(filename);
      if destination.exists() {
        // If a hard crash interrupted the placement phase, some files were
        // already written to their new `pak##` names while others are still
        // staged here. Restoring a staged file onto an already-placed name
        // would overwrite and destroy another mod's VPK, so recover it into a
        // free slot instead. No content is lost; the manifest (never committed
        // for an interrupted reorder) is reconciled from disk on the next
        // reorder.
        let recovered = Self::next_free_enabled_vpk_path(&original_dir);
        log::warn!(
          "Reorder recovery: {} already exists, restoring staged file as {}",
          destination.display(),
          recovered.display()
        );
        destination = recovered;
      }
      fs::rename(&staged_path, &destination)?;
    }
    Ok(())
  }

  /// Lowest-unused `pak##_dir.vpk` path in `dir`. Used by crash recovery to
  /// place a staged file without clobbering one an interrupted placement phase
  /// already wrote.
  fn next_free_enabled_vpk_path(dir: &Path) -> PathBuf {
    let mut used = std::collections::HashSet::new();
    if let Ok(entries) = fs::read_dir(dir) {
      for entry in entries.flatten() {
        if let Some(number) = entry.file_name().to_str().and_then(Self::enabled_vpk_number) {
          used.insert(number);
        }
      }
    }
    let mut number = 1u32;
    while used.contains(&number) {
      number += 1;
    }
    dir.join(format!("pak{number:02}_dir.vpk"))
  }

  fn find_orphaned_enabled_vpks(
    base: &Path,
    owned_vpks: &std::collections::HashSet<(u32, String)>,
  ) -> Result<Vec<(u32, PathBuf)>, Error> {
    let mut orphans = Vec::new();
    for shard_index in 1..=shard::MAX_SHARDS {
      let dir = shard::shard_dir(base, shard_index);
      if !dir.exists() {
        continue;
      }
      for entry in fs::read_dir(&dir)? {
        let path = entry?.path();
        let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
          continue;
        };
        if path.is_file()
          && Self::is_enabled_vpk_name(filename)
          && !owned_vpks.contains(&(shard_index, filename.to_string()))
        {
          orphans.push((shard_index, path));
        }
      }
    }
    orphans.sort_by_key(|(shard_index, path)| {
      (
        *shard_index,
        path
          .file_name()
          .and_then(|name| name.to_str())
          .and_then(Self::enabled_vpk_number)
          .unwrap_or(u32::MAX),
      )
    });
    Ok(orphans)
  }

  fn validate_reorder_capacity(
    ordered_mods: &[(String, u32, Vec<String>)],
    orphan_count: u32,
  ) -> Result<(), Error> {
    let mut current_shard = 1u32;
    let mut used = 0u32;
    for (mod_id, _, vpks) in ordered_mods {
      let count = vpks.len() as u32;
      if count > shard::SHARD_CAPACITY {
        return Err(Error::ModInvalid(format!(
          "Mod {mod_id} has {count} VPK files and cannot fit in one addon folder"
        )));
      }
      if used + count > shard::SHARD_CAPACITY {
        current_shard += 1;
        used = 0;
      }
      used += count;
    }
    let remaining_in_current = shard::SHARD_CAPACITY - used;
    let additional_shards = orphan_count
      .saturating_sub(remaining_in_current)
      .div_ceil(shard::SHARD_CAPACITY);
    if current_shard + additional_shards > shard::MAX_SHARDS {
      return Err(Error::ModInvalid(format!(
        "Cannot reorder VPKs: all {} addon folders would be exceeded",
        shard::MAX_SHARDS
      )));
    }
    Ok(())
  }

  pub(crate) fn prune_empty_shard_dirs(base: &Path) {
    for shard_index in 2..=shard::MAX_SHARDS {
      let dir = shard::shard_dir(base, shard_index);
      if dir.exists()
        && let Ok(mut entries) = fs::read_dir(&dir)
        && entries.next().is_none()
      {
        let _ = fs::remove_dir(&dir);
      }
    }
  }

  fn duplicate_sharded_assignments(ordered_mods: &[(String, u32, Vec<String>)]) -> Vec<String> {
    let mut owners_by_vpk: BTreeMap<(u32, String), Vec<String>> = BTreeMap::new();

    for (mod_id, shard_index, vpk_names) in ordered_mods {
      for vpk_name in vpk_names {
        owners_by_vpk
          .entry((*shard_index, Self::vpk_filename(vpk_name)))
          .or_default()
          .push(mod_id.clone());
      }
    }

    owners_by_vpk
      .into_iter()
      .filter_map(|((_, vpk_name), owners)| {
        if owners.len() > 1 {
          Some(format!("{vpk_name} -> {}", owners.join(", ")))
        } else {
          None
        }
      })
      .collect()
  }

  /// Roll back a sequence of `(current_path, original_path)` renames by moving
  /// each file back to where it came from, most-recent first. Works across
  /// directories (e.g. shard dir -> base dir).
  fn rollback_path_renames_on_failure(
    renamed: Vec<(PathBuf, PathBuf)>,
    original_error: Error,
  ) -> Error {
    let mut rollback_failures = Vec::new();
    for (current, original) in renamed.into_iter().rev() {
      let label = current.to_string_lossy().to_string();
      if let Err(rb_err) = fs_retry::retry_file_operation("rollback rename", &label, || {
        fs::rename(&current, &original)
      }) {
        log::error!("Rollback failed for {current:?} -> {original:?}: {rb_err}");
        rollback_failures.push(format!("{current:?} -> {original:?}: {rb_err}"));
      } else {
        log::info!("Rolled back VPK: {current:?} -> {original:?}");
      }
    }
    if rollback_failures.is_empty() {
      original_error
    } else {
      Error::RollbackFailed(format!(
        "Original error: {original_error}. Failed to roll back: {}",
        rollback_failures.join(", ")
      ))
    }
  }

  pub fn clear_all_vpks_with_commit<F>(&self, addons_path: &Path, commit: F) -> Result<(), Error>
  where
    F: FnOnce() -> Result<(), Error>,
  {
    let staging_dir = addons_path.join(".dmm-clear");
    if staging_dir.exists() {
      return Err(Error::ModInvalid(format!(
        "Cannot clear VPKs while stale staging exists at {}",
        staging_dir.display()
      )));
    }

    let mut sources = Vec::new();
    for shard_index in 1..=shard::MAX_SHARDS {
      let dir = shard::shard_dir(addons_path, shard_index);
      for vpk_path in self.filesystem.get_files_with_extension(&dir, "vpk")? {
        let filename = vpk_path
          .file_name()
          .and_then(|name| name.to_str())
          .ok_or_else(|| Error::ModInvalid("VPK filename is not valid UTF-8".to_string()))?
          .to_string();
        sources.push((shard_index, vpk_path, filename));
      }
    }

    fs::create_dir_all(&staging_dir)?;
    let mut staged = Vec::new();
    for (shard_index, source, filename) in sources {
      let pending = staging_dir.join(format!("s{shard_index}__{filename}.pending"));
      if let Err(error) = fs::rename(&source, &pending) {
        let error = Self::rollback_staged_files(staged, error.into());
        let _ = fs::remove_dir(&staging_dir);
        return Err(error);
      }
      staged.push((pending, source));
    }

    if let Err(error) = commit() {
      let error = Self::rollback_staged_files(staged, error);
      let _ = fs::remove_dir(&staging_dir);
      return Err(error);
    }

    if let Err(error) = fs::remove_dir_all(&staging_dir) {
      log::warn!("Failed to remove completed clear staging directory: {error}");
    }
    Self::prune_empty_shard_dirs(addons_path);

    Ok(())
  }

  fn rollback_staged_files(staged: Vec<(PathBuf, PathBuf)>, original_error: Error) -> Error {
    let mut failures = Vec::new();
    for (pending, source) in staged.into_iter().rev() {
      if let Some(parent) = source.parent()
        && let Err(error) = fs::create_dir_all(parent)
      {
        failures.push(format!("failed to recreate {}: {error}", parent.display()));
        continue;
      }
      if let Err(error) = fs::rename(&pending, &source) {
        failures.push(format!(
          "{} -> {}: {error}",
          pending.display(),
          source.display()
        ));
      }
    }
    if failures.is_empty() {
      original_error
    } else {
      Error::RollbackFailed(format!(
        "Original error: {original_error}. Failed to roll back: {}",
        failures.join("; ")
      ))
    }
  }

  /// Copy selected VPK files from extracted directory based on file tree selection
  pub fn copy_selected_vpks_with_prefix(
    &self,
    source_dir: &Path,
    destination_dir: &Path,
    mod_id: &str,
    file_tree: &crate::mod_manager::file_tree::ModFileTree,
  ) -> Result<Vec<String>, Error> {
    let mut prefixed_vpks = Vec::new();

    // Get all VPK files from source directory with their relative paths
    let mut all_vpk_files = Vec::new();
    self.collect_vpks_from_dir(source_dir, &mut all_vpk_files)?;

    log::info!(
      "Found {} VPK files in source directory for mod {}",
      all_vpk_files.len(),
      mod_id
    );

    // Create a map of relative paths to full paths
    let mut vpk_map: std::collections::HashMap<String, std::path::PathBuf> =
      std::collections::HashMap::new();
    for vpk_path in all_vpk_files {
      if let Ok(relative_path) = vpk_path.strip_prefix(source_dir) {
        let relative_str = relative_path.to_string_lossy().replace('\\', "/");
        log::debug!(
          "Mapping VPK path: {} -> {}",
          relative_str,
          vpk_path.display()
        );
        vpk_map.insert(relative_str, vpk_path);
      }
    }

    log::info!(
      "File tree has {} files, {} are selected",
      file_tree.files.len(),
      file_tree.files.iter().filter(|f| f.is_selected).count()
    );

    // Copy only selected files
    for file in &file_tree.files {
      log::debug!(
        "Processing file: {} (selected: {}, path: {})",
        file.name,
        file.is_selected,
        file.path
      );

      if !file.is_selected {
        continue;
      }

      // Match file path (normalize separators)
      let normalized_path = file.path.replace('\\', "/");
      if let Some(vpk_path) = vpk_map.get(&normalized_path) {
        if let Some(file_name) = vpk_path.file_name().and_then(|n| n.to_str()) {
          let prefixed_name = format!("{mod_id}_{file_name}");
          let dest_path = destination_dir.join(&prefixed_name);

          self.filesystem.copy_file(vpk_path, &dest_path)?;
          prefixed_vpks.push(prefixed_name.clone());

          log::info!(
            "Copied selected VPK with prefix: {} -> {prefixed_name}",
            vpk_path.display()
          );
        }
      } else {
        log::warn!(
          "Selected VPK file not found in extracted directory: {}",
          file.path
        );
      }
    }

    Ok(prefixed_vpks)
  }

  /// Copy VPK files from source directory to addons with mod ID prefix
  pub fn copy_vpks_with_prefix(
    &self,
    source_dir: &Path,
    destination_dir: &Path,
    mod_id: &str,
  ) -> Result<Vec<String>, Error> {
    let mut prefixed_vpks = Vec::new();
    let mut vpk_files = Vec::new();

    // Recursively collect all VPK files
    self.collect_vpks_from_dir(source_dir, &mut vpk_files)?;
    vpk_files.sort();

    for vpk_path in vpk_files {
      if let Some(file_name) = vpk_path.file_name().and_then(|n| n.to_str()) {
        let prefixed_name = format!("{mod_id}_{file_name}");
        let dest_path = destination_dir.join(&prefixed_name);

        self.filesystem.copy_file(&vpk_path, &dest_path)?;
        prefixed_vpks.push(prefixed_name.clone());

        log::info!(
          "Copied VPK with prefix: {} -> {prefixed_name}",
          vpk_path.display()
        );
      }
    }

    Ok(prefixed_vpks)
  }

  /// Helper method to recursively collect VPK files
  fn collect_vpks_from_dir(
    &self,
    dir: &Path,
    vpk_files: &mut Vec<std::path::PathBuf>,
  ) -> Result<(), Error> {
    for entry in fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_dir() {
        self.collect_vpks_from_dir(&path, vpk_files)?;
      } else if path.extension().is_some_and(|ext| ext == "vpk") {
        vpk_files.push(path);
      }
    }
    Ok(())
  }

  /// Find all VPK files with a specific mod ID prefix
  pub fn find_prefixed_vpks(&self, addons_path: &Path, mod_id: &str) -> Result<Vec<String>, Error> {
    let mut prefixed_vpks = Vec::new();

    if !addons_path.exists() {
      return Ok(prefixed_vpks);
    }

    let prefix = format!("{mod_id}_");

    for entry in fs::read_dir(addons_path)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_file()
        && path.extension().is_some_and(|ext| ext == "vpk")
        && let Some(file_name) = path.file_name().and_then(|n| n.to_str())
        && file_name.starts_with(&prefix)
      {
        prefixed_vpks.push(file_name.to_string());
      }
    }

    prefixed_vpks.sort();
    Ok(prefixed_vpks)
  }

  /// Enable VPKs, taking the prefixed sources from `disabled_dir` (always the
  /// profile base) and writing the enabled `pak##_dir.vpk` into `enabled_dir`
  /// (the target shard directory). The two are equal for shard 1.
  pub fn enable_vpks_in(
    &self,
    disabled_dir: &Path,
    enabled_dir: &Path,
    mod_id: &str,
    prefixed_vpks: &[String],
  ) -> Result<Vec<String>, Error> {
    if prefixed_vpks.is_empty() {
      return Ok(Vec::new());
    }

    // Reject any missing source before touching the filesystem so a mod can
    // never be left partially enabled with silently dropped VPKs.
    let missing: Vec<String> = prefixed_vpks
      .iter()
      .filter(|name| !disabled_dir.join(name).exists())
      .cloned()
      .collect();
    if !missing.is_empty() {
      return Err(Error::ModInvalid(format!(
        "Cannot enable mod {mod_id} because source VPK files are missing: {}",
        missing.join(", ")
      )));
    }

    if enabled_dir != disabled_dir {
      fs::create_dir_all(enabled_dir)?;
    }

    let source_count = prefixed_vpks.len() as u32;
    let used = Self::count_enabled_vpks(enabled_dir);
    if used + source_count > shard::SHARD_CAPACITY {
      return Err(Error::ModInvalid(format!(
        "Enabling mod {mod_id} would exceed the {} VPK files allowed in one addon folder",
        shard::SHARD_CAPACITY
      )));
    }

    // Track successful renames (enabled path, original prefixed path) for rollback.
    let mut renamed: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut new_names = Vec::new();

    for prefixed_name in prefixed_vpks {
      let old_path = disabled_dir.join(prefixed_name);

      // Find next available number in the target shard (fills gaps)
      let next_number = self.find_next_available_vpk_number(enabled_dir)?;
      let new_name = format!("pak{next_number:02}_dir.vpk");
      let new_path = enabled_dir.join(&new_name);

      if let Err(e) =
        fs_retry::retry_file_operation("rename", prefixed_name, || fs::rename(&old_path, &new_path))
      {
        log::error!(
          "Failed to enable VPK {prefixed_name}: {e}, rolling back {count} already-renamed file(s)",
          count = renamed.len()
        );
        return Err(Self::rollback_path_renames_on_failure(
          renamed,
          fs_retry::map_file_lock_error("enable", prefixed_name, e),
        ));
      }

      renamed.push((new_path, old_path));
      new_names.push(new_name.clone());
      log::info!("Enabled VPK for mod {mod_id}: {prefixed_name} -> {new_name}");
    }

    Ok(new_names)
  }

  fn filter_existing_vpk_pairs(
    enabled_dir: &Path,
    installed_vpks: &[String],
    original_names: &[String],
  ) -> Vec<(String, String)> {
    installed_vpks
      .iter()
      .zip(original_names.iter())
      .filter_map(|(installed_vpk, original_name)| {
        let vpk_name = Self::vpk_filename(installed_vpk);
        if enabled_dir.join(&vpk_name).exists() {
          Some((vpk_name, original_name.clone()))
        } else {
          log::warn!("Enabled VPK file missing during disable: {vpk_name}");
          None
        }
      })
      .collect()
  }

  /// Disable VPKs, reading the enabled `pak##_dir.vpk` from `enabled_dir` (the
  /// mod's current shard) and writing the prefixed `{mod_id}_*.vpk` results into
  /// `disabled_dir` (always the profile base). The two are equal for shard 1.
  pub fn disable_vpks_in(
    &self,
    enabled_dir: &Path,
    disabled_dir: &Path,
    mod_id: &str,
    installed_vpks: &[String],
    original_names: &[String],
    missing_policy: MissingVpkPolicy,
  ) -> Result<Vec<String>, Error> {
    if installed_vpks.is_empty() {
      return Ok(Vec::new());
    }

    if original_names.len() != installed_vpks.len() {
      return Err(Error::ModInvalid(format!(
        "Cannot disable mod because original VPK name count ({}) does not match installed VPK count ({})",
        original_names.len(),
        installed_vpks.len()
      )));
    }

    let missing_vpks: Vec<String> = installed_vpks
      .iter()
      .map(|vpk_name| Self::vpk_filename(vpk_name))
      .filter(|vpk_name| !enabled_dir.join(vpk_name).exists())
      .collect();

    if !missing_vpks.is_empty() {
      match missing_policy {
        MissingVpkPolicy::Strict => {
          return Err(Error::ModInvalid(format!(
            "Cannot disable mod because enabled VPK files are missing: {}",
            missing_vpks.join(", ")
          )));
        }
        MissingVpkPolicy::Reconcile => {
          if missing_vpks.len() == installed_vpks.len() {
            log::warn!(
              "Mod {mod_id} is marked enabled but none of its enabled VPK files exist; marking it disabled without renaming files"
            );
            return Ok(Vec::new());
          }

          log::warn!(
            "Mod {mod_id} is missing some enabled VPK files; disabling only the files that still exist"
          );
        }
      }
    }

    let vpk_pairs = match missing_policy {
      MissingVpkPolicy::Strict => installed_vpks
        .iter()
        .zip(original_names.iter())
        .map(|(installed_vpk, original_name)| {
          (Self::vpk_filename(installed_vpk), original_name.clone())
        })
        .collect::<Vec<_>>(),
      MissingVpkPolicy::Reconcile => {
        Self::filter_existing_vpk_pairs(enabled_dir, installed_vpks, original_names)
      }
    };

    if vpk_pairs.is_empty() {
      return Ok(Vec::new());
    }

    if enabled_dir != disabled_dir {
      fs::create_dir_all(disabled_dir)?;
    }

    // Track successful renames (prefixed path, original enabled path) for rollback.
    let mut renamed: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut prefixed_out = Vec::new();

    for (vpk_name, original_name) in vpk_pairs {
      let old_path = enabled_dir.join(&vpk_name);

      let prefixed_name = format!("{mod_id}_{original_name}");
      let new_path = disabled_dir.join(&prefixed_name);

      if new_path.exists() {
        log::info!(
          "Prefixed destination already exists (newly staged variant), removing old active VPK: {vpk_name}"
        );
        if let Err(e) =
          fs_retry::retry_file_operation("remove", &vpk_name, || fs::remove_file(&old_path))
        {
          log::error!(
            "Failed to remove old active VPK {vpk_name}: {e}, rolling back {count} already-renamed file(s)",
            count = renamed.len()
          );
          return Err(Self::rollback_path_renames_on_failure(
            renamed,
            fs_retry::map_file_lock_error("disable", &vpk_name, e),
          ));
        }
        // This was a deletion, not a rename: `new_path` already existed and is
        // not something we can restore, so it must not enter the rollback list.
        // Rolling it back would move the pre-existing staged variant into the
        // active slot and corrupt state.
      } else {
        if let Err(e) =
          fs_retry::retry_file_operation("rename", &vpk_name, || fs::rename(&old_path, &new_path))
        {
          log::error!(
            "Failed to disable VPK {vpk_name}: {e}, rolling back {count} already-renamed file(s)",
            count = renamed.len()
          );
          return Err(Self::rollback_path_renames_on_failure(
            renamed,
            fs_retry::map_file_lock_error("disable", &vpk_name, e),
          ));
        }
        renamed.push((new_path, old_path));
      }

      prefixed_out.push(prefixed_name.clone());
      log::info!("Disabled VPK for mod {mod_id}: {vpk_name} -> {prefixed_name}");
    }

    Ok(prefixed_out)
  }

  /// Extract mod ID from a prefixed VPK filename
  pub fn extract_mod_id_from_prefix(filename: &str) -> Option<String> {
    if Self::is_enabled_vpk_name(filename) {
      return None;
    }

    if let Some(underscore_pos) = filename.find('_') {
      let potential_id = &filename[..underscore_pos];
      if !potential_id.is_empty()
        && (potential_id.chars().all(|c| c.is_ascii_digit()) || potential_id.starts_with("local-"))
      {
        return Some(potential_id.to_string());
      }
    }
    None
  }

  fn is_enabled_vpk_name(filename: &str) -> bool {
    Self::enabled_vpk_number(filename).is_some()
  }

  pub(crate) fn enabled_vpk_number(filename: &str) -> Option<u32> {
    static ENABLED_VPK_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
      Regex::new(r"^pak(\d+)_dir\.vpk$").expect("enabled VPK regex must be valid")
    });

    ENABLED_VPK_PATTERN
      .captures(filename)?
      .get(1)?
      .as_str()
      .parse()
      .ok()
  }

  fn vpk_filename(vpk_name: &str) -> String {
    std::path::Path::new(vpk_name)
      .file_name()
      .map(|f| f.to_string_lossy().to_string())
      .unwrap_or_else(|| vpk_name.to_string())
  }

  #[allow(clippy::too_many_arguments)]
  pub fn swap_enabled_vpks_with_commit<F>(
    &self,
    addons_path: &Path,
    current_enabled_dir: &Path,
    target_enabled_dir: &Path,
    mod_id: &str,
    current_installed_vpks: &[String],
    current_original_names: &[String],
    new_selection_original_names: &[String],
    commit: F,
  ) -> Result<Vec<String>, Error>
  where
    F: FnOnce(&[String]) -> Result<(), Error>,
  {
    if !addons_path.exists() {
      return Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Addons path not found: {addons_path:?}"),
      )));
    }

    log::info!(
      "Swapping enabled VPKs for mod {mod_id}: {} currently enabled -> {} newly selected",
      current_installed_vpks.len(),
      new_selection_original_names.len()
    );
    let unique_selection: std::collections::HashSet<&String> =
      new_selection_original_names.iter().collect();
    if unique_selection.len() != new_selection_original_names.len() {
      return Err(Error::InvalidInput(
        "Selected VPK filenames must be unique".to_string(),
      ));
    }

    let snapshot_dir = tempfile::tempdir()?;
    let mut snapshot = Vec::new();
    for (index, current_vpk) in current_installed_vpks.iter().enumerate() {
      let source = current_enabled_dir.join(Self::vpk_filename(current_vpk));
      if !source.is_file() {
        return Err(Error::ModFileNotFound);
      }
      let backup = snapshot_dir.path().join(format!("active-{index}.pending"));
      fs::copy(&source, &backup)?;
      snapshot.push((source, backup));
    }
    for (index, prefixed) in self
      .find_prefixed_vpks(addons_path, mod_id)?
      .into_iter()
      .enumerate()
    {
      let source = addons_path.join(prefixed);
      let backup = snapshot_dir
        .path()
        .join(format!("disabled-{index}.pending"));
      fs::copy(&source, &backup)?;
      snapshot.push((source, backup));
    }

    if !current_installed_vpks.is_empty()
      && let Err(error) = self.disable_vpks_in(
        current_enabled_dir,
        addons_path,
        mod_id,
        current_installed_vpks,
        current_original_names,
        MissingVpkPolicy::Strict,
      )
    {
      return Err(self.restore_swap_snapshot(
        addons_path,
        current_enabled_dir,
        target_enabled_dir,
        mod_id,
        current_installed_vpks,
        &[],
        &snapshot,
        error,
      ));
    }

    let prefixed_to_enable: Vec<String> = new_selection_original_names
      .iter()
      .map(|name| format!("{mod_id}_{name}"))
      .collect();

    for prefixed in &prefixed_to_enable {
      if !addons_path.join(prefixed).exists() {
        return Err(self.restore_swap_snapshot(
          addons_path,
          current_enabled_dir,
          target_enabled_dir,
          mod_id,
          current_installed_vpks,
          &[],
          &snapshot,
          Error::ModFileNotFound,
        ));
      }
    }

    let installed =
      match self.enable_vpks_in(addons_path, target_enabled_dir, mod_id, &prefixed_to_enable) {
        Ok(installed) => installed,
        Err(error) => {
          return Err(self.restore_swap_snapshot(
            addons_path,
            current_enabled_dir,
            target_enabled_dir,
            mod_id,
            current_installed_vpks,
            &[],
            &snapshot,
            error,
          ));
        }
      };

    if let Err(error) = commit(&installed) {
      return Err(self.restore_swap_snapshot(
        addons_path,
        current_enabled_dir,
        target_enabled_dir,
        mod_id,
        current_installed_vpks,
        &installed,
        &snapshot,
        error,
      ));
    }

    Ok(installed)
  }

  #[allow(clippy::too_many_arguments)]
  fn restore_swap_snapshot(
    &self,
    addons_path: &Path,
    current_enabled_dir: &Path,
    target_enabled_dir: &Path,
    mod_id: &str,
    current_installed_vpks: &[String],
    new_installed_vpks: &[String],
    snapshot: &[(PathBuf, PathBuf)],
    original_error: Error,
  ) -> Error {
    let mut failures = Vec::new();
    let mut active_paths = std::collections::HashSet::new();
    for vpk in current_installed_vpks {
      active_paths.insert(current_enabled_dir.join(Self::vpk_filename(vpk)));
    }
    for vpk in new_installed_vpks {
      active_paths.insert(target_enabled_dir.join(Self::vpk_filename(vpk)));
    }
    for path in active_paths {
      if path.exists()
        && let Err(error) = fs::remove_file(&path)
      {
        failures.push(format!("failed to remove {}: {error}", path.display()));
      }
    }
    match self.find_prefixed_vpks(addons_path, mod_id) {
      Ok(prefixed) => {
        for name in prefixed {
          let path = addons_path.join(name);
          if let Err(error) = fs::remove_file(&path) {
            failures.push(format!("failed to remove {}: {error}", path.display()));
          }
        }
      }
      Err(error) => failures.push(format!("failed to list disabled VPKs: {error}")),
    }
    for (destination, backup) in snapshot {
      if let Some(parent) = destination.parent()
        && let Err(error) = fs::create_dir_all(parent)
      {
        failures.push(format!("failed to create {}: {error}", parent.display()));
        continue;
      }
      if let Err(error) = fs::copy(backup, destination) {
        failures.push(format!(
          "failed to restore {}: {error}",
          destination.display()
        ));
      }
    }
    if failures.is_empty() {
      original_error
    } else {
      Error::RollbackFailed(format!(
        "Original error: {original_error}. Failed to restore VPK snapshot: {}",
        failures.join("; ")
      ))
    }
  }

  /// Replace VPK files for a mod with new ones
  /// Handles both enabled (pak##_dir.vpk) and disabled (modid_*.vpk) mods
  pub fn replace_vpks(
    &self,
    addons_path: &Path,
    enabled_dir: &Path,
    mod_id: &str,
    source_vpk_paths: &[std::path::PathBuf],
    installed_vpks: &[String],
  ) -> Result<(), Error> {
    if source_vpk_paths.is_empty() {
      return Err(Error::InvalidInput(
        "No VPK files provided for replacement".into(),
      ));
    }

    if !addons_path.exists() {
      return Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Addons path not found: {addons_path:?}"),
      )));
    }

    log::info!(
      "Replacing {} VPK file(s) for mod {mod_id}",
      source_vpk_paths.len()
    );

    // Determine if mod is enabled (has installed_vpks) or disabled (has prefixed VPKs)
    let is_enabled = !installed_vpks.is_empty();

    if is_enabled {
      // Mod is enabled - replace pak##_dir.vpk files
      if source_vpk_paths.len() != installed_vpks.len() {
        return Err(Error::InvalidInput(format!(
          "Replacement VPK count ({}) does not match installed VPK count ({})",
          source_vpk_paths.len(),
          installed_vpks.len()
        )));
      }

      for (source_path, installed_vpk) in source_vpk_paths.iter().zip(installed_vpks.iter()) {
        let dest_path = enabled_dir.join(Self::vpk_filename(installed_vpk));

        if !dest_path.exists() {
          log::warn!("Installed VPK not found: {installed_vpk}");
          continue;
        }

        self.filesystem.copy_file(source_path, &dest_path)?;
        log::info!(
          "Replaced enabled VPK: {installed_vpk} with {:?}",
          source_path.file_name().unwrap_or_default()
        );
      }
    } else {
      // Mod is disabled - replace prefixed VPKs
      log::info!("Looking for prefixed VPKs with pattern: {mod_id}_*.vpk");
      let prefixed_vpks = self.find_prefixed_vpks(addons_path, mod_id)?;
      log::info!(
        "Found {} prefixed VPK(s): {prefixed_vpks:?}",
        prefixed_vpks.len()
      );

      if prefixed_vpks.is_empty() {
        // List all VPK files in addons to help debug
        let all_vpks: Vec<String> = fs::read_dir(addons_path)
          .ok()
          .map(|entries| {
            entries
              .filter_map(|e| e.ok())
              .filter(|e| e.path().extension().is_some_and(|ext| ext == "vpk"))
              .filter_map(|e| e.file_name().to_str().map(String::from))
              .collect()
          })
          .unwrap_or_default();
        log::warn!("No prefixed VPKs found. All VPKs in addons: {all_vpks:?}");
        return Err(Error::ModFileNotFound);
      }

      if source_vpk_paths.len() != prefixed_vpks.len() {
        return Err(Error::InvalidInput(format!(
          "Replacement VPK count ({}) does not match mod VPK count ({})",
          source_vpk_paths.len(),
          prefixed_vpks.len()
        )));
      }

      for (source_path, prefixed_vpk) in source_vpk_paths.iter().zip(prefixed_vpks.iter()) {
        let dest_path = addons_path.join(prefixed_vpk);

        if !dest_path.exists() {
          log::warn!("Prefixed VPK not found: {prefixed_vpk}");
          continue;
        }

        self.filesystem.copy_file(source_path, &dest_path)?;
        log::info!(
          "Replaced disabled VPK: {prefixed_vpk} with {:?}",
          source_path.file_name().unwrap_or_default()
        );
      }
    }

    log::info!("VPK replacement completed successfully for mod {mod_id}");
    Ok(())
  }
}

impl Default for VpkManager {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::vpk_manager::MissingVpkPolicy;
  use std::fs;

  fn write_vpk(addons_path: &std::path::Path, name: &str) {
    fs::write(addons_path.join(name), b"test vpk").unwrap();
  }

  /// `shard_dir` resolves shard roots relative to a `citadel/addons` base, so
  /// reorder tests must run against an addons-rooted path (not a bare tempdir),
  /// otherwise shards 2..=MAX collapse onto the base directory.
  fn addons_base(temp: &tempfile::TempDir) -> std::path::PathBuf {
    let addons_path = temp.path().join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    addons_path
  }

  #[test]
  fn detects_disabled_local_mod_prefixes() {
    assert_eq!(
      VpkManager::extract_mod_id_from_prefix("local-abc-123_mod.vpk"),
      Some("local-abc-123".to_string())
    );
    assert_eq!(
      VpkManager::extract_mod_id_from_prefix("123456_mod.vpk"),
      Some("123456".to_string())
    );
    assert_eq!(
      VpkManager::extract_mod_id_from_prefix("pak01_dir.vpk"),
      None
    );
  }

  #[test]
  fn reorder_keeps_disabled_local_vpks_disabled() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = addons_base(&temp);
    let addons_path = addons_path.as_path();
    write_vpk(addons_path, "pak01_dir.vpk");
    write_vpk(addons_path, "local-abc-123_original.vpk");

    let manager = VpkManager::new();
    let updated = manager
      .reorder_vpks_sharded(
        &[("123456".to_string(), 1, vec!["pak01_dir.vpk".to_string()])],
        addons_path,
      )
      .unwrap();

    assert_eq!(updated.len(), 1);
    assert_eq!(updated[0].mod_id, "123456");
    assert_eq!(updated[0].shard, 1);
    assert_eq!(updated[0].vpks, vec!["pak01_dir.vpk".to_string()]);
    assert!(addons_path.join("local-abc-123_original.vpk").exists());
    assert!(!addons_path.join("pak02_dir.vpk").exists());
  }

  #[test]
  fn reorder_errors_before_mutating_when_vpk_is_assigned_to_multiple_mods() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = addons_base(&temp);
    let addons_path = addons_path.as_path();
    write_vpk(addons_path, "pak01_dir.vpk");

    let manager = VpkManager::new();
    let err = manager
      .reorder_vpks_sharded(
        &[
          ("first".to_string(), 1, vec!["pak01_dir.vpk".to_string()]),
          ("second".to_string(), 1, vec!["pak01_dir.vpk".to_string()]),
        ],
        addons_path,
      )
      .unwrap_err();

    assert!(err.to_string().contains(
      "Cannot reorder mods because VPK files are assigned to multiple mods: pak01_dir.vpk -> first, second"
    ));
    assert!(addons_path.join("pak01_dir.vpk").exists());
    assert!(!addons_path.join("temp_reorder").exists());
  }

  #[test]
  fn disable_errors_when_enabled_vpk_is_missing() {
    let temp = tempfile::tempdir().unwrap();
    let manager = VpkManager::new();

    let err = manager
      .disable_vpks_in(
        temp.path(),
        temp.path(),
        "123456",
        &["pak01_dir.vpk".to_string()],
        &["original.vpk".to_string()],
        MissingVpkPolicy::Strict,
      )
      .unwrap_err();

    assert!(err.to_string().contains("enabled VPK files are missing"));
  }

  #[test]
  fn disable_errors_when_original_name_count_does_not_match() {
    let temp = tempfile::tempdir().unwrap();
    write_vpk(temp.path(), "pak01_dir.vpk");
    write_vpk(temp.path(), "pak02_dir.vpk");
    let manager = VpkManager::new();

    let err = manager
      .disable_vpks_in(
        temp.path(),
        temp.path(),
        "123456",
        &["pak01_dir.vpk".to_string(), "pak02_dir.vpk".to_string()],
        &["first.vpk".to_string()],
        MissingVpkPolicy::Strict,
      )
      .unwrap_err();

    assert!(
      err
        .to_string()
        .contains("original VPK name count (1) does not match installed VPK count (2)")
    );
  }

  #[test]
  fn disable_reconciles_when_enabled_vpk_is_missing() {
    let temp = tempfile::tempdir().unwrap();
    let manager = VpkManager::new();

    let result = manager
      .disable_vpks_in(
        temp.path(),
        temp.path(),
        "123456",
        &["pak01_dir.vpk".to_string()],
        &["original.vpk".to_string()],
        MissingVpkPolicy::Reconcile,
      )
      .unwrap();

    assert!(result.is_empty());
  }

  #[test]
  fn disable_reconciles_partial_missing() {
    let temp = tempfile::tempdir().unwrap();
    write_vpk(temp.path(), "pak01_dir.vpk");
    let manager = VpkManager::new();

    let result = manager
      .disable_vpks_in(
        temp.path(),
        temp.path(),
        "123456",
        &["pak01_dir.vpk".to_string(), "pak02_dir.vpk".to_string()],
        &["first.vpk".to_string(), "second.vpk".to_string()],
        MissingVpkPolicy::Reconcile,
      )
      .unwrap();

    assert_eq!(result, vec!["123456_first.vpk".to_string()]);
    assert!(temp.path().join("123456_first.vpk").exists());
    assert!(!temp.path().join("pak01_dir.vpk").exists());
  }

  /// The core feature: more than 99 enabled VPKs are spread across sibling
  /// `addons`/`addons2` folders, bypassing the engine's 99-file-per-directory
  /// limit while preserving global load order.
  #[test]
  fn sharding_spreads_more_than_99_vpks_across_addon_folders() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = addons_base(&temp);
    let addons_path = addons_path.as_path();

    // 150 single-file mods, currently all crammed into the base folder
    // (the legacy "over the 99 limit" state on disk).
    let mut ordered = Vec::new();
    for i in 1..=150u32 {
      let name = format!("pak{i:02}_dir.vpk");
      write_vpk(addons_path, &name);
      ordered.push((format!("mod{i}"), 1u32, vec![name]));
    }

    let manager = VpkManager::new();
    let placements = manager.reorder_vpks_sharded(&ordered, addons_path).unwrap();

    let shard1 = shard::shard_dir(addons_path, 1);
    let shard2 = shard::shard_dir(addons_path, 2);

    // Shard 1 (citadel/addons) fills to capacity, shard 2 (citadel/addons2)
    // takes the overflow.
    assert_eq!(VpkManager::count_enabled_vpks(&shard1), 99);
    assert_eq!(VpkManager::count_enabled_vpks(&shard2), 51);

    // Load order preserved: mods 1..99 in shard 1, 100..150 in shard 2.
    assert_eq!(placements.len(), 150);
    assert_eq!(placements[0].shard, 1);
    assert_eq!(placements[98].shard, 1);
    assert_eq!(placements[99].shard, 2);
    assert_eq!(placements[149].shard, 2);
    assert!(shard2.join("pak01_dir.vpk").is_file());
    assert!(shard2.join("pak51_dir.vpk").is_file());
    // No mod is split: shard 2 numbering restarts at pak01.
    assert!(!shard2.join("pak100_dir.vpk").exists());
  }

  /// Fix regression guard: disabling a mod whose prefixed destination already
  /// exists (a newly staged variant) must remove the active copy and keep the
  /// pre-existing variant intact — never clobber it via a bogus rollback rename.
  #[test]
  fn disable_with_existing_prefixed_destination_removes_active_copy() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = addons_base(&temp);
    let addons_path = addons_path.as_path();
    write_vpk(addons_path, "pak01_dir.vpk"); // active
    write_vpk(addons_path, "123456_original.vpk"); // pre-existing staged variant

    let manager = VpkManager::new();
    let out = manager
      .disable_vpks_in(
        addons_path,
        addons_path,
        "123456",
        &["pak01_dir.vpk".to_string()],
        &["original.vpk".to_string()],
        MissingVpkPolicy::Strict,
      )
      .unwrap();

    assert_eq!(out, vec!["123456_original.vpk".to_string()]);
    assert!(!addons_path.join("pak01_dir.vpk").exists()); // active removed
    assert!(addons_path.join("123456_original.vpk").exists()); // preserved
  }

  /// Fix regression guard: enabling must reject a missing source up front
  /// instead of warn-and-skip, so a mod can never be left partially enabled.
  #[test]
  fn enable_rejects_missing_source_before_renaming() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = addons_base(&temp);
    let addons_path = addons_path.as_path();
    write_vpk(addons_path, "123456_a.vpk"); // 123456_b.vpk is intentionally missing

    let manager = VpkManager::new();
    let err = manager
      .enable_vpks_in(
        addons_path,
        addons_path,
        "123456",
        &["123456_a.vpk".to_string(), "123456_b.vpk".to_string()],
      )
      .unwrap_err();

    assert!(err.to_string().contains("source VPK files are missing"));
    // Nothing was renamed: existing source untouched, no pak## created.
    assert!(addons_path.join("123456_a.vpk").exists());
    assert!(!addons_path.join("pak01_dir.vpk").exists());
  }

  /// Fix regression guard: if a hard crash interrupts the placement phase, some
  /// files sit at their new `pak##` names and others are still staged. Recovery
  /// must never overwrite an already-placed file when restoring a staged one.
  #[test]
  fn reorder_recovery_does_not_clobber_already_placed_files() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    let base = base.as_path();

    // A file already written to its destination by the interrupted placement.
    fs::write(base.join("pak01_dir.vpk"), b"placed").unwrap();
    // A staged file whose original name collides with the placed one.
    let reorder = base.join(".dmm-reorder");
    fs::create_dir_all(&reorder).unwrap();
    fs::write(reorder.join("s1__pak01_dir.vpk"), b"staged").unwrap();

    VpkManager::restore_staged_files(base, &reorder).unwrap();

    // Neither file is lost: the placed file keeps its slot, the staged file is
    // recovered into a free one.
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"placed");
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), b"staged");
  }
}
