use super::naming;
use crate::errors::Error;
use crate::mod_manager::fs_retry;
use crate::mod_manager::shard::{ProfileBase, ShardLocator, StagedName};
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const JOURNAL_FILENAME: &str = ".transaction.jsonl";

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "camelCase")]
enum JournalEvent {
  Stage {
    original: String,
  },
  Place {
    original: String,
    destination: String,
  },
  Create {
    path: String,
  },
  Manifest {
    manifest: ProfileVpkManifest,
  },
}

pub enum RecoveryMode {
  /// Fail if a staged file's original slot is occupied. Used where the caller
  /// knows nothing else can have taken it.
  Strict,
  /// Give a staged file the next free `pak##_dir.vpk` slot when its own is
  /// taken. A reorder interrupted mid-placement leaves exactly that state.
  AvoidEnabledCollisions,
}

/// Put the files of an interrupted operation back where they came from.
pub fn recover_staging_directory(
  base: &ProfileBase,
  staging_dir: &Path,
  mode: RecoveryMode,
  manifest: &ProfileVpkManifest,
) -> Result<(), Error> {
  if !staging_dir.is_dir() {
    return Ok(());
  }

  let journal_path = staging_dir.join(JOURNAL_FILENAME);
  if journal_path.is_file() {
    return recover_journaled_staging(base, staging_dir, &journal_path, manifest);
  }

  for entry in fs::read_dir(staging_dir)? {
    let staged_path = entry?.path();
    let staged_name = staged_path
      .file_name()
      .and_then(|name| name.to_str())
      .ok_or_else(|| Error::ModInvalid("Invalid VPK staging filename".to_string()))?;
    let staged = StagedName::parse(staged_name)?;
    let destination_dir = base.shard_dir(staged.shard);
    fs::create_dir_all(&destination_dir)?;
    let mut destination = destination_dir.join(staged.filename);
    if destination.exists() {
      match mode {
        RecoveryMode::Strict => {
          return Err(Error::ModInvalid(format!(
            "Cannot recover VPK staging because {} already exists",
            destination.display()
          )));
        }
        RecoveryMode::AvoidEnabledCollisions => {
          destination = destination_dir.join(naming::next_free_enabled_vpk_name(&destination_dir)?);
        }
      }
    }
    fs::rename(staged_path, destination)?;
  }
  fs::remove_dir(staging_dir)?;
  Ok(())
}

fn recover_journaled_staging(
  base: &ProfileBase,
  staging_dir: &Path,
  journal_path: &Path,
  manifest: &ProfileVpkManifest,
) -> Result<(), Error> {
  let contents = fs::read_to_string(journal_path)?;
  let lines: Vec<&str> = contents.lines().collect();
  let mut originals = Vec::new();
  let mut placements = std::collections::BTreeMap::new();
  let mut created = BTreeSet::new();
  let mut expected_manifest = None;

  for (index, line) in lines.iter().enumerate() {
    if line.trim().is_empty() {
      continue;
    }
    let event = match serde_json::from_str::<JournalEvent>(line) {
      Ok(event) => event,
      Err(error) if index + 1 == lines.len() && !contents.ends_with('\n') => {
        log::warn!(
          "Ignoring incomplete final VPK transaction journal record at {}: {error}",
          journal_path.display()
        );
        break;
      }
      Err(error) => {
        return Err(Error::ModInvalid(format!(
          "Invalid VPK transaction journal at {}: {error}",
          journal_path.display()
        )));
      }
    };
    match event {
      JournalEvent::Stage { original } => {
        if !originals.contains(&original) {
          originals.push(original);
        }
      }
      JournalEvent::Place {
        original,
        destination,
      } => {
        placements.insert(original, destination);
      }
      JournalEvent::Create { path } => {
        created.insert(path);
      }
      JournalEvent::Manifest {
        manifest: expected,
      } => expected_manifest = Some(expected),
    }
  }

  if expected_manifest.as_ref() == Some(manifest) {
    fs::remove_dir_all(staging_dir)?;
    return Ok(());
  }

  let mut files = Vec::new();
  for original in originals {
    let locator = ShardLocator::parse(&original)?;
    let parked = staging_dir.join(StagedName::new(locator.shard, &locator.filename).encode());
    let current = placements
      .get(&original)
      .map(|path| ShardLocator::parse(path))
      .transpose()?
      .map(|path| base.locator_path(&path))
      .unwrap_or_else(|| parked.clone());
    files.push((base.locator_path(&locator), parked, current));
  }

  for (_, parked, current) in &files {
    if current == parked || !current.exists() {
      continue;
    }
    if parked.exists() {
      return Err(Error::ModInvalid(format!(
        "Cannot recover VPK transaction because both {} and {} exist",
        current.display(),
        parked.display()
      )));
    }
    fs::rename(current, parked)?;
  }

  for path in created {
    let locator = ShardLocator::parse(&path)?;
    let path = base.locator_path(&locator);
    if path.is_file() {
      fs::remove_file(path)?;
    }
  }

  for (original, parked, _) in files.into_iter().rev() {
    if !parked.exists() {
      continue;
    }
    if original.is_file() {
      fs::remove_file(&original)?;
    }
    if let Some(parent) = original.parent() {
      fs::create_dir_all(parent)?;
    }
    fs::rename(parked, original)?;
  }
  fs::remove_dir_all(staging_dir)?;
  Ok(())
}

struct StagedFile {
  original_locator: String,
  original: PathBuf,
  current: PathBuf,
  /// Where this file sits while parked in the staging directory. Always a
  /// `StagedName`, so a crash mid-rollback leaves a directory that
  /// [`recover_staging_directory`] can still put back.
  parked: PathBuf,
}

/// Moves VPKs aside into a staging directory and puts them back unless
/// committed, including on an unwind. Files parked here survive a crash: the
/// next manifest load recovers them via [`recover_staging_directory`].
pub struct VpkStaging {
  base: ProfileBase,
  dir: PathBuf,
  files: Vec<StagedFile>,
  created: BTreeSet<PathBuf>,
  finalized: bool,
}

impl VpkStaging {
  pub fn claim(base: &ProfileBase, name: &str) -> Result<Self, Error> {
    fs::create_dir_all(base.path())?;
    let dir = base.join(name);
    fs::create_dir(&dir).map_err(|error| {
      if error.kind() == std::io::ErrorKind::AlreadyExists {
        Error::ModInvalid(format!(
          "Cannot start VPK operation while stale staging exists at {}",
          dir.display()
        ))
      } else {
        error.into()
      }
    })?;

    OpenOptions::new()
      .create_new(true)
      .write(true)
      .open(dir.join(JOURNAL_FILENAME))?
      .sync_all()?;

    Ok(Self {
      base: base.clone(),
      dir,
      files: Vec::new(),
      created: BTreeSet::new(),
      finalized: false,
    })
  }

  fn append_journal(&self, event: &JournalEvent) -> Result<(), Error> {
    let mut journal = OpenOptions::new()
      .append(true)
      .open(self.dir.join(JOURNAL_FILENAME))?;
    serde_json::to_writer(&mut journal, event)
      .map_err(|error| Error::ModInvalid(format!("Failed to write VPK journal: {error}")))?;
    journal.write_all(b"\n")?;
    journal.sync_all()?;
    Ok(())
  }

  fn locator_for(&self, path: &Path) -> Result<String, Error> {
    let shard = path
      .parent()
      .and_then(|parent| self.base.shard_of_dir(parent))
      .ok_or_else(|| {
        Error::ModInvalid(format!(
          "Cannot journal VPK outside profile shards: {}",
          path.display()
        ))
      })?;
    let filename = path
      .file_name()
      .and_then(|name| name.to_str())
      .ok_or_else(|| Error::ModInvalid("VPK filename is not valid UTF-8".to_string()))?;
    Ok(ShardLocator::new(shard, filename).to_wire())
  }

  pub fn stage(&mut self, base: &ProfileBase, source: &Path) -> Result<PathBuf, Error> {
    let shard = source
      .parent()
      .and_then(|parent| base.shard_of_dir(parent))
      .ok_or_else(|| {
        Error::ModInvalid(format!(
          "Cannot stage VPK outside profile shards: {}",
          source.display()
        ))
      })?;
    let filename = source
      .file_name()
      .and_then(|name| name.to_str())
      .ok_or_else(|| Error::ModInvalid("VPK filename is not valid UTF-8".to_string()))?;
    let staged = self.dir.join(StagedName::new(shard, filename).encode());
    let original_locator = ShardLocator::new(shard, filename).to_wire();
    self.append_journal(&JournalEvent::Stage {
      original: original_locator.clone(),
    })?;
    self.files.push(StagedFile {
      original_locator,
      original: source.to_path_buf(),
      current: staged.clone(),
      parked: staged.clone(),
    });
    fs::rename(source, &staged)?;
    Ok(staged)
  }

  pub fn place(&mut self, staged: &Path, destination: &Path) -> Result<(), Error> {
    if destination.exists() {
      return Err(Error::ModInvalid(format!(
        "Cannot place staged VPK because {} already exists",
        destination.display()
      )));
    }
    if let Some(parent) = destination.parent() {
      fs::create_dir_all(parent)?;
    }
    let index = self
      .files
      .iter()
      .position(|file| file.current == staged)
      .ok_or_else(|| Error::ModInvalid(format!("Untracked staged VPK: {}", staged.display())))?;
    self.append_journal(&JournalEvent::Place {
      original: self.files[index].original_locator.clone(),
      destination: self.locator_for(destination)?,
    })?;
    fs::rename(staged, destination)?;
    self.files[index].current = destination.to_path_buf();
    Ok(())
  }

  pub fn track_created(&mut self, path: &Path) -> Result<(), Error> {
    let locator = self.locator_for(path)?;
    if self.created.insert(path.to_path_buf()) {
      self.append_journal(&JournalEvent::Create { path: locator })?;
    }
    Ok(())
  }

  fn prepare_manifest_commit(&self, manifest: &ProfileVpkManifest) -> Result<(), Error> {
    self.append_journal(&JournalEvent::Manifest {
      manifest: manifest.clone(),
    })
  }

  pub fn commit(mut self) {
    self.finalized = true;
    if let Err(error) = fs::remove_dir_all(&self.dir) {
      log::warn!(
        "VPK operation committed, but staging cleanup failed at {}: {error}",
        self.dir.display()
      );
    }
  }

  pub fn rollback(mut self, original_error: Error) -> Error {
    let failures = self.restore_files();
    self.finalized = true;
    let _ = fs::remove_dir(&self.dir);
    if failures.is_empty() {
      original_error
    } else {
      Error::RollbackFailed(format!(
        "Original error: {original_error}. Failed to roll back: {}",
        failures.join("; ")
      ))
    }
  }

  fn restore_files(&mut self) -> Vec<String> {
    let mut failures = Vec::new();
    // Park every file back in the staging directory first. Restoring in place
    // could otherwise fail on a file whose original path is still occupied by
    // another file this transaction has yet to move.
    for file in self.files.iter_mut() {
      if file.current == file.parked || !file.current.exists() {
        continue;
      }
      if let Err(error) = fs::rename(&file.current, &file.parked) {
        failures.push(format!(
          "{} -> {}: {error}",
          file.current.display(),
          file.parked.display()
        ));
        continue;
      }
      file.current = file.parked.clone();
    }

    for path in &self.created {
      if path.is_file()
        && let Err(error) = fs::remove_file(path)
      {
        failures.push(format!("failed to remove {}: {error}", path.display()));
      }
    }

    for file in self.files.iter().rev() {
      if !file.parked.exists() {
        continue;
      }
      if let Some(parent) = file.original.parent()
        && let Err(error) = fs::create_dir_all(parent)
      {
        failures.push(format!("failed to create {}: {error}", parent.display()));
        continue;
      }
      if file.original.is_file()
        && let Err(error) = fs::remove_file(&file.original)
      {
        failures.push(format!("failed to remove {}: {error}", file.original.display()));
        continue;
      }
      if let Err(error) = fs::rename(&file.parked, &file.original) {
        failures.push(format!(
          "{} -> {}: {error}",
          file.parked.display(),
          file.original.display()
        ));
      }
    }
    failures
  }
}

/// Copies files aside before they are overwritten and restores them unless
/// committed. Used where an operation rewrites content in place rather than
/// renaming it, so there is nothing to move back.
pub struct VpkSnapshot {
  temp: tempfile::TempDir,
  originals: Vec<(PathBuf, PathBuf)>,
  touched: BTreeSet<PathBuf>,
  finalized: bool,
}

enum PendingGuard {
  Staging(VpkStaging),
  Snapshot(VpkSnapshot),
}

/// A completed filesystem mutation that remains reversible until its metadata
/// commit succeeds.
pub struct PendingVpkOperation<T> {
  value: T,
  guard: PendingGuard,
}

impl<T> PendingVpkOperation<T> {
  pub(super) fn with_staging(value: T, staging: VpkStaging) -> Self {
    Self {
      value,
      guard: PendingGuard::Staging(staging),
    }
  }

  pub(super) fn with_snapshot(value: T, snapshot: VpkSnapshot) -> Self {
    Self {
      value,
      guard: PendingGuard::Snapshot(snapshot),
    }
  }

  pub fn value(&self) -> &T {
    &self.value
  }

  pub fn commit(self) -> T {
    match self.guard {
      PendingGuard::Staging(staging) => staging.commit(),
      PendingGuard::Snapshot(snapshot) => snapshot.commit(),
    }
    self.value
  }

  pub fn commit_manifest(
    mut self,
    manifest: &ProfileVpkManifest,
    addons_path: &Path,
  ) -> Result<T, Error> {
    if let PendingGuard::Staging(staging) = &mut self.guard {
      staging.prepare_manifest_commit(manifest)?;
    }
    if let Err(error) = manifest.save(addons_path) {
      return Err(self.rollback(error));
    }
    Ok(self.commit())
  }

  pub fn rollback(self, original_error: Error) -> Error {
    match self.guard {
      PendingGuard::Staging(staging) => staging.rollback(original_error),
      PendingGuard::Snapshot(snapshot) => snapshot.rollback(original_error),
    }
  }
}

/// Tracks ordinary path renames and reverses them unless explicitly committed.
///
/// This covers enable/disable operations that do not need a persistent staging
/// directory but still must undo earlier renames when a later step fails.
pub struct RenameTransaction {
  renamed: Vec<(PathBuf, PathBuf)>,
  finalized: bool,
}

impl RenameTransaction {
  pub fn new() -> Self {
    Self {
      renamed: Vec::new(),
      finalized: false,
    }
  }

  pub fn record(&mut self, current: PathBuf, original: PathBuf) {
    self.renamed.push((current, original));
  }

  pub fn len(&self) -> usize {
    self.renamed.len()
  }

  pub fn commit(mut self) {
    self.finalized = true;
  }

  pub fn rollback(mut self, original_error: Error) -> Error {
    let failures = self.restore();
    self.finalized = true;
    if failures.is_empty() {
      original_error
    } else {
      Error::RollbackFailed(format!(
        "Original error: {original_error}. Failed to roll back: {}",
        failures.join("; ")
      ))
    }
  }

  fn restore(&self) -> Vec<String> {
    let mut failures = Vec::new();
    for (current, original) in self.renamed.iter().rev() {
      let label = current.to_string_lossy();
      if let Err(error) =
        fs_retry::retry_file_operation("rollback rename", &label, || fs::rename(current, original))
      {
        failures.push(format!(
          "{} -> {}: {error}",
          current.display(),
          original.display()
        ));
      }
    }
    failures
  }
}

impl VpkSnapshot {
  pub fn new() -> Result<Self, Error> {
    Ok(Self {
      temp: tempfile::tempdir()?,
      originals: Vec::new(),
      touched: BTreeSet::new(),
      finalized: false,
    })
  }

  /// Take a copy of `path` if it exists, and mark it for removal on rollback
  /// either way — so a path that is about to be created is restored by deleting
  /// it, and one that is about to be overwritten is restored from the copy.
  pub fn capture(&mut self, path: &Path) -> Result<(), Error> {
    if !self.touched.insert(path.to_path_buf()) || !path.is_file() {
      return Ok(());
    }
    let backup = self
      .temp
      .path()
      .join(format!("snapshot-{}", self.originals.len()));
    fs::copy(path, &backup)?;
    self.originals.push((path.to_path_buf(), backup));
    Ok(())
  }

  /// Mark a path this operation will create, without reading it first.
  pub fn track(&mut self, path: impl Into<PathBuf>) {
    self.touched.insert(path.into());
  }

  pub fn commit(mut self) {
    self.finalized = true;
  }

  pub fn rollback(mut self, original_error: Error) -> Error {
    let failures = self.restore();
    self.finalized = true;
    if failures.is_empty() {
      original_error
    } else {
      Error::RollbackFailed(format!(
        "Original error: {original_error}. Failed to restore VPK snapshot: {}",
        failures.join("; ")
      ))
    }
  }

  fn restore(&self) -> Vec<String> {
    let mut failures = Vec::new();
    // Only paths without a backup were created by this operation and have to be
    // deleted. Anything backed up is put back by overwriting it below, so
    // removing it first would open a window where the file does not exist.
    let backed_up: BTreeSet<&PathBuf> = self
      .originals
      .iter()
      .map(|(destination, _)| destination)
      .collect();
    for path in &self.touched {
      if !backed_up.contains(path)
        && path.exists()
        && let Err(error) = fs::remove_file(path)
      {
        failures.push(format!("failed to remove {}: {error}", path.display()));
      }
    }
    for (destination, backup) in &self.originals {
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
    failures
  }
}

impl Drop for VpkSnapshot {
  fn drop(&mut self) {
    if self.finalized {
      return;
    }
    for failure in self.restore() {
      log::error!("Failed to restore dropped VPK snapshot: {failure}");
    }
  }
}

impl Drop for RenameTransaction {
  fn drop(&mut self) {
    if self.finalized {
      return;
    }
    for failure in self.restore() {
      log::error!("Failed to restore dropped VPK rename transaction: {failure}");
    }
  }
}

impl Drop for VpkStaging {
  fn drop(&mut self) {
    if self.finalized {
      return;
    }
    for failure in self.restore_files() {
      log::error!("Failed to roll back dropped VPK staging transaction: {failure}");
    }
    let _ = fs::remove_dir(&self.dir);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn base(temp: &tempfile::TempDir) -> ProfileBase {
    let path = temp.path().join("citadel").join("addons");
    fs::create_dir_all(&path).unwrap();
    ProfileBase::new(path).unwrap()
  }

  #[test]
  fn rollback_restores_staged_and_placed_files() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let original = base.join("pak01_dir.vpk");
    fs::write(&original, b"vpk").unwrap();

    let mut staging = VpkStaging::claim(&base, ".test-staging").unwrap();
    let staged = staging.stage(&base, &original).unwrap();
    let placed = base
      .shard_dir(crate::mod_manager::shard::ShardIndex::new(2).unwrap())
      .join("pak01_dir.vpk");
    staging.place(&staged, &placed).unwrap();

    let error = staging.rollback(Error::InvalidInput("commit failed".to_string()));

    assert!(matches!(error, Error::InvalidInput(_)));
    assert_eq!(fs::read(original).unwrap(), b"vpk");
    assert!(!placed.exists());
  }

  /// A reorder routinely gives file A the slot file B came from. Rolling that
  /// back has to park both files before restoring either, or the second rename
  /// lands on an occupied path. The parked name stays a valid `StagedName` so a
  /// crash between the two phases is still recoverable.
  #[test]
  fn rollback_restores_files_that_swapped_slots() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let first = base.join("pak01_dir.vpk");
    let second = base.join("pak02_dir.vpk");
    fs::write(&first, b"first").unwrap();
    fs::write(&second, b"second").unwrap();

    let mut staging = VpkStaging::claim(&base, ".test-staging").unwrap();
    let staged_first = staging.stage(&base, &first).unwrap();
    let staged_second = staging.stage(&base, &second).unwrap();
    for staged in [&staged_first, &staged_second] {
      let name = staged.file_name().unwrap().to_str().unwrap();
      assert!(
        StagedName::parse(name).is_ok(),
        "unparseable park name {name}"
      );
    }
    staging.place(&staged_first, &second).unwrap();
    staging.place(&staged_second, &first).unwrap();

    let error = staging.rollback(Error::InvalidInput("commit failed".to_string()));

    assert!(matches!(error, Error::InvalidInput(_)));
    assert_eq!(fs::read(&first).unwrap(), b"first");
    assert_eq!(fs::read(&second).unwrap(), b"second");
    assert!(!base.join(".test-staging").exists());
  }

  #[test]
  fn drop_rolls_back_uncommitted_staging() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let original = base.join("pak01_dir.vpk");
    fs::write(&original, b"vpk").unwrap();

    {
      let mut staging = VpkStaging::claim(&base, ".test-staging").unwrap();
      staging.stage(&base, &original).unwrap();
    }

    assert_eq!(fs::read(original).unwrap(), b"vpk");
    assert!(!base.join(".test-staging").exists());
  }

  #[test]
  fn commit_deletes_files_left_in_staging() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let original = base.join("pak01_dir.vpk");
    fs::write(&original, b"vpk").unwrap();

    let mut staging = VpkStaging::claim(&base, ".test-staging").unwrap();
    staging.stage(&base, &original).unwrap();
    staging.commit();

    assert!(!original.exists());
    assert!(!base.join(".test-staging").exists());
  }

  #[test]
  fn pending_operation_rolls_back_when_metadata_commit_fails() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let original = base.join("pak01_dir.vpk");
    fs::write(&original, b"vpk").unwrap();

    let mut staging = VpkStaging::claim(&base, ".test-staging").unwrap();
    staging.stage(&base, &original).unwrap();
    let pending = PendingVpkOperation::with_staging("result", staging);
    assert_eq!(pending.value(), &"result");

    let error = pending.rollback(Error::InvalidInput("manifest failed".to_string()));

    assert!(matches!(error, Error::InvalidInput(_)));
    assert_eq!(fs::read(original).unwrap(), b"vpk");
  }

  #[test]
  fn snapshot_restores_originals_and_removes_new_files() {
    let temp = tempfile::tempdir().unwrap();
    let original = temp.path().join("original.vpk");
    let created = temp.path().join("created.vpk");
    fs::write(&original, b"before").unwrap();

    let mut snapshot = VpkSnapshot::new().unwrap();
    snapshot.capture(&original).unwrap();
    snapshot.track(&created);
    fs::write(&original, b"after").unwrap();
    fs::write(&created, b"new").unwrap();

    let error = snapshot.rollback(Error::InvalidInput("commit failed".to_string()));

    assert!(matches!(error, Error::InvalidInput(_)));
    assert_eq!(fs::read(original).unwrap(), b"before");
    assert!(!created.exists());
  }

  /// Capturing a path that does not exist yet still has to register it, so a
  /// rollback deletes the file the operation went on to create.
  #[test]
  fn snapshot_removes_files_captured_before_they_existed() {
    let temp = tempfile::tempdir().unwrap();
    let created = temp.path().join("created.vpk");

    let mut snapshot = VpkSnapshot::new().unwrap();
    snapshot.capture(&created).unwrap();
    fs::write(&created, b"new").unwrap();

    snapshot.rollback(Error::InvalidInput("commit failed".to_string()));

    assert!(!created.exists());
  }

  #[test]
  fn dropped_rename_transaction_restores_original_path() {
    let temp = tempfile::tempdir().unwrap();
    let original = temp.path().join("disabled.vpk");
    let current = temp.path().join("pak01_dir.vpk");
    fs::write(&original, b"vpk").unwrap();

    {
      let mut transaction = RenameTransaction::new();
      fs::rename(&original, &current).unwrap();
      transaction.record(current.clone(), original.clone());
    }

    assert_eq!(fs::read(original).unwrap(), b"vpk");
    assert!(!current.exists());
  }
}
