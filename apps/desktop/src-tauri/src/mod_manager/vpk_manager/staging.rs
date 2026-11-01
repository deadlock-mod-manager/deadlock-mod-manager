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
  /// The manifest already committed the removal; validate before cleanup.
  Discard,
}

/// Put the files of an interrupted operation back where they came from.
pub fn recover_staging_directory(
  base: &ProfileBase,
  staging_dir: &Path,
  mode: RecoveryMode,
  manifest: &ProfileVpkManifest,
) -> Result<(), Error> {
  match recover_staging_directory_inner(base, staging_dir, mode, manifest) {
    Err(error @ (Error::ModInvalid(_) | Error::InvalidInput(_))) => {
      quarantine_staging_directory(staging_dir, &error.to_string())
    }
    result => result,
  }
}

pub(crate) fn quarantine_staging_directory(staging_dir: &Path, reason: &str) -> Result<(), Error> {
  let destination = staging_dir.with_file_name(format!(
    ".dmm-recovered-{}",
    chrono::Utc::now().format("%Y%m%dT%H%M%S%.9fZ")
  ));
  fs::rename(staging_dir, &destination)?;
  log::warn!(
    "Moved unrecoverable VPK staging {} to {}: {reason}",
    staging_dir.display(),
    destination.display()
  );
  Ok(())
}

fn recover_staging_directory_inner(
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
    return recover_journaled_staging(
      base,
      staging_dir,
      &journal_path,
      manifest,
      matches!(mode, RecoveryMode::Discard),
    );
  }

  let mut moves = Vec::new();
  let mut reserved = BTreeSet::new();
  for entry in fs::read_dir(staging_dir)? {
    let staged_path = entry?.path();
    let staged_name = staged_path
      .file_name()
      .and_then(|name| name.to_str())
      .ok_or_else(|| Error::ModInvalid("Invalid VPK staging filename".to_string()))?;
    let staged = StagedName::parse(staged_name)?;
    if matches!(mode, RecoveryMode::Discard) {
      continue;
    }
    let destination_dir = base.shard_dir(staged.shard);
    let mut destination = destination_dir.join(staged.filename);
    if destination.exists() || reserved.contains(&destination) {
      match mode {
        RecoveryMode::Strict => {
          return Err(Error::ModInvalid(format!(
            "Cannot recover VPK staging because {} already exists",
            destination.display()
          )));
        }
        RecoveryMode::AvoidEnabledCollisions => {
          let count = reserved
            .iter()
            .filter(|path: &&PathBuf| path.parent() == Some(destination_dir.as_path()))
            .count()
            + 1;
          destination = naming::allocate_enabled_vpk_names(&destination_dir, count)?
            .into_iter()
            .map(|name| destination_dir.join(name))
            .find(|path| !reserved.contains(path))
            .unwrap();
        }
        RecoveryMode::Discard => unreachable!(),
      }
    }
    reserved.insert(destination.clone());
    moves.push((staged_path, destination));
  }
  if matches!(mode, RecoveryMode::Discard) {
    fs::remove_dir_all(staging_dir)?;
    return Ok(());
  }
  for (source, destination) in moves {
    fs::create_dir_all(destination.parent().unwrap())?;
    fs::rename(source, destination)?;
  }
  fs::remove_dir(staging_dir)?;
  Ok(())
}

fn recover_journaled_staging(
  base: &ProfileBase,
  staging_dir: &Path,
  journal_path: &Path,
  manifest: &ProfileVpkManifest,
  discard: bool,
) -> Result<(), Error> {
  let contents = fs::read_to_string(journal_path).map_err(|error| {
    if error.kind() == std::io::ErrorKind::InvalidData {
      Error::ModInvalid(format!(
        "Invalid VPK transaction journal at {}: {error}",
        journal_path.display()
      ))
    } else {
      Error::Io(error)
    }
  })?;
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
      JournalEvent::Manifest { manifest: expected } => expected_manifest = Some(expected),
    }
  }

  for entry in fs::read_dir(staging_dir)? {
    let entry = entry?;
    if entry.file_name() == JOURNAL_FILENAME {
      continue;
    }
    let name = entry.file_name();
    let staged = StagedName::parse(&name.to_string_lossy())?;
    let locator = ShardLocator::new(staged.shard, staged.filename).to_wire();
    if !originals.contains(&locator) {
      return Err(Error::ModInvalid(format!(
        "Unjournaled VPK staging payload: {locator}"
      )));
    }
  }

  for path in originals.iter().chain(placements.values()) {
    ShardLocator::parse(path)?;
  }
  let created: BTreeSet<_> = created
    .iter()
    .map(|path| ShardLocator::parse(path).map(|locator| base.locator_path(&locator)))
    .collect::<Result<_, _>>()?;

  if discard || expected_manifest.as_ref() == Some(manifest) {
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

  for (original, parked, current) in &files {
    if (parked.exists() || (current != parked && current.exists()))
      && original.exists()
      && original != current
      && !files
        .iter()
        .any(|(_, other_parked, other)| other == original && other != other_parked)
      && !created.contains(original)
    {
      return Err(Error::ModInvalid(format!(
        "Cannot recover VPK transaction because {} already exists",
        original.display()
      )));
    }
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
  }
  for (_, parked, current) in &files {
    if current != parked && current.exists() {
      fs::rename(current, parked)?;
    }
  }

  for path in created {
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
    crate::mod_manager::file_permissions::ensure_file_writable(source)?;
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
    fs::rename(source, &staged).map_err(|error| Error::io_context("move VPK", source, error))?;
    Ok(staged)
  }

  pub fn place(&mut self, staged: &Path, destination: &Path) -> Result<(), Error> {
    crate::mod_manager::file_permissions::ensure_file_writable(destination)?;
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
    #[cfg(feature = "e2e-harness")]
    crate::e2e_faults::checkpoint("placed", &self.base)?;
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
    let failures = self.restore_and_clean_up();
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

  fn restore_and_clean_up(&mut self) -> Vec<String> {
    let mut failures = self.restore_files();
    // Keep the journal and parked payloads when restoration is incomplete.
    // A completed rollback must discard its journal before the next mutation
    // can mistake the old placements for an interrupted transaction.
    if failures.is_empty() {
      if let Err(error) = fs::remove_file(self.dir.join(JOURNAL_FILENAME)) {
        failures.push(format!("failed to remove rolled-back journal: {error}"));
      } else if let Err(error) = fs::remove_dir(&self.dir) {
        failures.push(format!(
          "failed to remove rolled-back staging directory: {error}"
        ));
      }
    }
    failures
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
        failures.push(format!(
          "failed to remove {}: {error}",
          file.original.display()
        ));
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
  pub(crate) fn with_staging(value: T, staging: VpkStaging) -> Self {
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
    self,
    manifest: &ProfileVpkManifest,
    addons_path: &Path,
  ) -> Result<T, Error> {
    self.commit_manifest_with_checkpoint(manifest, addons_path, || {
      #[cfg(feature = "e2e-harness")]
      crate::e2e_faults::checkpoint("committed", addons_path)?;
      Ok(())
    })
  }

  fn commit_manifest_with_checkpoint(
    mut self,
    manifest: &ProfileVpkManifest,
    addons_path: &Path,
    checkpoint: impl FnOnce() -> Result<(), Error>,
  ) -> Result<T, Error> {
    if let PendingGuard::Staging(staging) = &mut self.guard {
      staging.prepare_manifest_commit(manifest)?;
    }
    if let Err(error) = manifest.save(addons_path) {
      return Err(self.rollback(error));
    }
    let checkpoint_result = checkpoint();
    // The manifest is durable. A returning checkpoint error must not undo its files.
    let value = self.commit();
    checkpoint_result?;
    Ok(value)
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
  /// either way â€” so a path that is about to be created is restored by deleting
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
    for failure in self.restore_and_clean_up() {
      log::error!("Failed to roll back dropped VPK staging transaction: {failure}");
    }
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

  #[cfg(windows)]
  #[test]
  fn staging_locked_vpk_reports_source_path_without_losing_files() {
    use std::os::windows::fs::OpenOptionsExt;

    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let original = base.join("pak01_dir.vpk");
    fs::write(&original, b"locked VPK").unwrap();
    let lock = OpenOptions::new()
      .read(true)
      .share_mode(1)
      .open(&original)
      .unwrap();
    let mut staging = VpkStaging::claim(&base, ".dmm-update-test").unwrap();

    let error = staging.stage(&base, &original).unwrap_err();
    let serialized = serde_json::to_value(&error).unwrap();
    assert_eq!(serialized["kind"], "io");
    assert!(
      serialized["message"]
        .as_str()
        .unwrap()
        .contains(original.to_str().unwrap())
    );
    drop(lock);

    let error = staging.rollback(error);
    assert!(matches!(error, Error::Io(_)));
    assert_eq!(fs::read(&original).unwrap(), b"locked VPK");
    assert!(!base.join(".dmm-update-test").exists());
  }

  #[test]
  fn occupied_recovery_target_preserves_both_files_without_partial_replay() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let dir = base.join(".dmm-update-test");
    fs::create_dir(&dir).unwrap();
    fs::write(dir.join("s1__pak01_dir.vpk.pending"), b"first").unwrap();
    fs::write(dir.join("s1__pak02_dir.vpk.pending"), b"second").unwrap();
    fs::write(base.join("pak02_dir.vpk"), b"occupied").unwrap();
    recover_staging_directory(
      &base,
      &dir,
      RecoveryMode::Strict,
      &ProfileVpkManifest::default(),
    )
    .unwrap();
    assert!(!base.join("pak01_dir.vpk").exists());
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), b"occupied");
    let quarantine = fs::read_dir(&base)
      .unwrap()
      .map(|entry| entry.unwrap().path())
      .find(|path| {
        path
          .file_name()
          .unwrap()
          .to_string_lossy()
          .starts_with(".dmm-recovered-")
      })
      .unwrap();
    assert_eq!(
      fs::read(quarantine.join("s1__pak01_dir.vpk.pending")).unwrap(),
      b"first"
    );
    assert_eq!(
      fs::read(quarantine.join("s1__pak02_dir.vpk.pending")).unwrap(),
      b"second"
    );
  }

  #[test]
  fn journal_collision_is_quarantined_before_moving_any_placements() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let dir = base.join(".dmm-reorder");
    fs::create_dir(&dir).unwrap();
    fs::write(
      dir.join(JOURNAL_FILENAME),
      "{\"event\":\"stage\",\"original\":\"pak01_dir.vpk\"}\n",
    )
    .unwrap();
    fs::write(dir.join("s1__pak01_dir.vpk.pending"), b"staged").unwrap();
    fs::write(base.join("pak01_dir.vpk"), b"occupied").unwrap();
    recover_staging_directory(
      &base,
      &dir,
      RecoveryMode::Strict,
      &ProfileVpkManifest::default(),
    )
    .unwrap();
    assert!(!dir.exists());
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"occupied");
  }

  #[test]
  fn occupied_original_does_not_get_overwritten_by_a_placed_payload() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let original = base.join("pak01_dir.vpk");
    let placed = base.join("pak02_dir.vpk");
    fs::write(&original, b"staged").unwrap();
    let mut staging = VpkStaging::claim(&base, ".dmm-reorder").unwrap();
    let parked = staging.stage(&base, &original).unwrap();
    staging.place(&parked, &placed).unwrap();
    std::mem::forget(staging);
    fs::write(&original, b"occupied").unwrap();
    recover_staging_directory(
      &base,
      &base.join(".dmm-reorder"),
      RecoveryMode::Strict,
      &ProfileVpkManifest::default(),
    )
    .unwrap();
    assert_eq!(fs::read(original).unwrap(), b"occupied");
    assert_eq!(fs::read(placed).unwrap(), b"staged");
    assert!(!base.join(".dmm-reorder").exists());
  }

  #[test]
  fn incomplete_final_journal_record_keeps_unjournaled_payloads() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let dir = base.join(".dmm-reorder");
    fs::create_dir(&dir).unwrap();
    fs::write(dir.join(JOURNAL_FILENAME), "{truncated").unwrap();
    fs::write(dir.join("s1__pak01_dir.vpk.pending"), b"retained").unwrap();
    recover_staging_directory(
      &base,
      &dir,
      RecoveryMode::Strict,
      &ProfileVpkManifest::default(),
    )
    .unwrap();
    assert!(!dir.exists());
    assert!(!base.join("pak01_dir.vpk").exists());
    assert!(fs::read_dir(&base).unwrap().any(|entry| {
      entry
        .unwrap()
        .path()
        .join("s1__pak01_dir.vpk.pending")
        .is_file()
    }));
  }

  #[test]
  fn committed_cleanup_discards_valid_payloads_but_quarantines_invalid_journals() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let dir = base.join(".dmm-clear");
    fs::create_dir(&dir).unwrap();
    fs::write(dir.join("s1__pak01_dir.vpk.pending"), b"committed deletion").unwrap();
    recover_staging_directory(
      &base,
      &dir,
      RecoveryMode::Discard,
      &ProfileVpkManifest::default(),
    )
    .unwrap();
    assert!(!dir.exists());
    assert!(!base.join("pak01_dir.vpk").exists());
    fs::create_dir(&dir).unwrap();
    fs::write(dir.join(JOURNAL_FILENAME), "invalid\n").unwrap();
    fs::write(dir.join("s1__pak01_dir.vpk.pending"), b"retained").unwrap();
    recover_staging_directory(
      &base,
      &dir,
      RecoveryMode::Discard,
      &ProfileVpkManifest::default(),
    )
    .unwrap();
    assert!(fs::read_dir(&base).unwrap().any(|entry| {
      entry
        .unwrap()
        .path()
        .join("s1__pak01_dir.vpk.pending")
        .is_file()
    }));
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
    assert!(!base.join(".test-staging").exists());
  }

  #[test]
  fn incomplete_rollback_retains_journal_and_payload_for_recovery() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let original = base.join("pak01_dir.vpk");
    fs::write(&original, b"retained").unwrap();
    let mut staging = VpkStaging::claim(&base, ".test-staging").unwrap();
    let parked = staging.stage(&base, &original).unwrap();
    fs::create_dir(&original).unwrap();
    fs::write(original.join("blocker"), b"protected").unwrap();

    let error = staging.rollback(Error::InvalidInput("interrupted".into()));
    assert!(matches!(error, Error::RollbackFailed(_)));
    assert_eq!(fs::read(&parked).unwrap(), b"retained");
    assert!(base.join(".test-staging").join(JOURNAL_FILENAME).is_file());
    assert_eq!(fs::read(original.join("blocker")).unwrap(), b"protected");
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
  fn checkpoint_error_preserves_files_after_manifest_commit() {
    let temp = tempfile::tempdir().unwrap();
    let base = base(&temp);
    let original = base.join("pak01_dir.vpk");
    fs::write(&original, b"vpk").unwrap();
    let mut staging = VpkStaging::claim(&base, ".test-staging").unwrap();
    staging.stage(&base, &original).unwrap();
    let manifest = ProfileVpkManifest::default();
    let pending = PendingVpkOperation::with_staging((), staging);

    let error = pending
      .commit_manifest_with_checkpoint(&manifest, base.path(), || {
        Err(Error::InvalidInput("crash marker write failed".to_string()))
      })
      .unwrap_err();

    assert!(matches!(error, Error::InvalidInput(_)));
    assert!(!original.exists(), "committed deletion must not roll back");
    assert!(!base.join(".test-staging").exists());
    let saved: ProfileVpkManifest =
      serde_json::from_slice(&fs::read(base.join(".dmm.json")).unwrap()).unwrap();
    assert_eq!(saved, manifest);
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
