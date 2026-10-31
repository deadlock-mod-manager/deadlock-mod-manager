//! `files.snapshot`: wait until a granted file settles, then stage a
//! verified, content-addressed copy under a host quota. VPKs are validated
//! down to every resource CRC; other files only need to hold still. Which
//! snapshots a plugin keeps in its history is its own business.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

pub const MAX_SNAPSHOT_BYTES: u64 = 512 * 1024 * 1024;
pub const MAX_SNAPSHOTS: usize = 12;
pub const MAX_STAGED_BYTES: u64 = 3 * 1024 * 1024 * 1024;
pub const STABLE_FOR: Duration = Duration::from_secs(3);
pub const SNAPSHOT_FILE: &str = "snapshot_dir.vpk";

pub type Stamp = (u64, SystemTime);

#[derive(Debug)]
pub enum SnapshotError {
  Invalid(String),
  Changed,
  Quota(String),
  Io(std::io::Error),
}

impl From<std::io::Error> for SnapshotError {
  fn from(error: std::io::Error) -> Self {
    Self::Io(error)
  }
}

impl std::fmt::Display for SnapshotError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::Invalid(message) | Self::Quota(message) => f.write_str(message),
      Self::Changed => f.write_str("The file changed while staging; waiting for it to settle"),
      Self::Io(error) => write!(f, "{error}"),
    }
  }
}

fn invalid(message: impl Into<String>) -> SnapshotError {
  SnapshotError::Invalid(message.into())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
  pub hash: String,
  pub size: u64,
  /// VPK resource count; absent for other files.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub resources: Option<usize>,
  pub staged_at: String,
}

pub fn is_vpk(path: &Path) -> bool {
  path
    .extension()
    .and_then(|extension| extension.to_str())
    .is_some_and(|extension| extension.eq_ignore_ascii_case("vpk"))
}

#[derive(Debug, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Inspection {
  Missing,
  Changing,
  WaitingForMarker,
  Invalid {
    message: String,
  },
  Ready {
    snapshot: Snapshot,
    /// This inspection staged a build the store did not hold yet.
    #[serde(skip)]
    staged: bool,
  },
}

#[derive(Debug, Default)]
pub struct Observation {
  stamp: Option<Stamp>,
  since: Option<Instant>,
  accepted: Option<(Stamp, String)>,
  rejected: Option<(Stamp, String)>,
}

pub fn stamp(path: &Path) -> Result<Stamp, SnapshotError> {
  let meta = fs::metadata(path)?;
  if !meta.is_file() || meta.len() > MAX_SNAPSHOT_BYTES {
    return Err(invalid(
      "Snapshots need a regular file smaller than 512 MiB",
    ));
  }
  Ok((meta.len(), meta.modified()?))
}

pub fn hash(path: &Path) -> Result<String, SnapshotError> {
  let mut file = fs::File::open(path)?.take(MAX_SNAPSHOT_BYTES + 1);
  let mut digest = Sha256::new();
  let mut buffer = [0; 65536];
  let mut total = 0u64;
  loop {
    let read = file.read(&mut buffer)?;
    if read == 0 {
      break;
    }
    total += read as u64;
    if total > MAX_SNAPSHOT_BYTES {
      return Err(invalid("The file grew beyond the 512 MiB limit"));
    }
    digest.update(&buffer[..read]);
  }
  Ok(format!("{:x}", digest.finalize()))
}

/// Checks the VPK header, directory tree and every resource CRC, so a file
/// that is still being written or was truncated never gets staged.
pub fn validate_vpk(path: &Path) -> Result<usize, SnapshotError> {
  let mut file = fs::File::open(path)?;
  let size = file.metadata()?.len();
  let mut header = [0u8; 12];
  file
    .read_exact(&mut header)
    .map_err(|_| invalid("Incomplete VPK header"))?;
  let version = u32::from_le_bytes([header[4], header[5], header[6], header[7]]);
  let tree = u64::from(u32::from_le_bytes([
    header[8], header[9], header[10], header[11],
  ]));
  let header_size = match version {
    1 => 12,
    2 => 28,
    _ => return Err(invalid("Unsupported VPK version")),
  };
  if tree > 16 * 1024 * 1024 || header_size + tree > size {
    return Err(invalid("Incomplete or oversized VPK directory"));
  }
  let entries = vpk_parser::VpkParser::parse_directory_with_preload_from_file(path)
    .map_err(|error| invalid(error.to_string()))?;
  if entries.is_empty() || entries.len() > 100_000 {
    return Err(invalid("VPK must contain 1-100000 resources"));
  }
  let table: [u32; 256] = std::array::from_fn(|index| {
    let mut crc = index as u32;
    for _ in 0..8 {
      crc = (crc >> 1) ^ if crc & 1 != 0 { 0xedb88320 } else { 0 };
    }
    crc
  });
  let mut buffer = [0; 65536];
  let mut total_payload = 0u64;
  for (entry, preload) in &entries {
    total_payload += u64::from(entry.entry_length) + preload.len() as u64;
    if total_payload > MAX_SNAPSHOT_BYTES {
      return Err(invalid("VPK resource data exceeds the analysis budget"));
    }
    if entry.archive_index != 0x7fff {
      return Err(invalid(
        "Multipart VPKs are unsupported; export a standalone VPK",
      ));
    }
    let start = header_size + tree + u64::from(entry.entry_offset);
    if start + u64::from(entry.entry_length) > size {
      return Err(invalid("Incomplete VPK payload"));
    }
    let mut crc = u32::MAX;
    for byte in preload {
      crc = table[((crc ^ u32::from(*byte)) & 255) as usize] ^ (crc >> 8);
    }
    file.seek(SeekFrom::Start(start))?;
    let mut remaining = u64::from(entry.entry_length);
    while remaining > 0 {
      let count = remaining.min(buffer.len() as u64) as usize;
      file.read_exact(&mut buffer[..count])?;
      for byte in &buffer[..count] {
        crc = table[((crc ^ u32::from(*byte)) & 255) as usize] ^ (crc >> 8);
      }
      remaining -= count as u64;
    }
    if format!("{:08x}", !crc) != entry.crc32_hex.to_ascii_lowercase() {
      return Err(invalid("VPK resource checksum mismatch"));
    }
  }
  Ok(entries.len())
}

pub struct SnapshotStore {
  dir: PathBuf,
}

fn is_hash(value: &str) -> bool {
  value.len() == 64
    && value
      .bytes()
      .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

impl SnapshotStore {
  pub fn new(data_dir: &Path) -> Self {
    Self {
      dir: data_dir.join("snapshots"),
    }
  }

  fn index_path(&self) -> PathBuf {
    self.dir.join("index.json")
  }

  pub fn path(&self, hash: &str) -> Option<PathBuf> {
    is_hash(hash).then(|| self.dir.join(hash).join(SNAPSHOT_FILE))
  }

  /// Staged artifacts, newest first. Entries whose file vanished are dropped
  /// and directories the index does not list are removed.
  pub fn list(&self) -> Result<Vec<Snapshot>, SnapshotError> {
    let mut index: Vec<Snapshot> = match fs::read(self.index_path()) {
      Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| invalid(error.to_string()))?,
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
      Err(error) => return Err(error.into()),
    };
    let before = index.len();
    index.retain(|snapshot| self.path(&snapshot.hash).is_some_and(|path| path.is_file()));
    if index.len() != before {
      self.save(&index)?;
    }
    if self.dir.is_dir() {
      for entry in fs::read_dir(&self.dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.file_type()?.is_dir() && !index.iter().any(|snapshot| snapshot.hash == name) {
          fs::remove_dir_all(entry.path())?;
        }
      }
    }
    Ok(index)
  }

  pub fn get(&self, hash: &str) -> Result<Option<Snapshot>, SnapshotError> {
    Ok(
      self
        .list()?
        .into_iter()
        .find(|snapshot| snapshot.hash == hash),
    )
  }

  fn save(&self, index: &[Snapshot]) -> Result<(), SnapshotError> {
    fs::create_dir_all(&self.dir)?;
    let bytes = serde_json::to_vec(index).map_err(|error| invalid(error.to_string()))?;
    let partial = self.dir.join("index.json.part");
    fs::write(&partial, bytes)?;
    fs::rename(partial, self.index_path())?;
    Ok(())
  }

  /// Copies `source`, validates and hashes the copy, then confirms the source
  /// did not change underneath it before keeping the copy under its hash.
  /// The flag is false when the store already held that build.
  pub fn stage(
    &self,
    source: &Path,
    observed: Stamp,
    pinned: &[String],
  ) -> Result<(Snapshot, bool), SnapshotError> {
    fs::create_dir_all(&self.dir)?;
    let temporary = self.dir.join("incoming.part");
    let copied = std::io::copy(
      &mut fs::File::open(source)?.take(MAX_SNAPSHOT_BYTES + 1),
      &mut fs::File::create(&temporary)?,
    );
    let result = copied.map_err(SnapshotError::from).and_then(|copied| {
      if copied > MAX_SNAPSHOT_BYTES {
        return Err(invalid("The file grew beyond the 512 MiB limit"));
      }
      let resources = if is_vpk(source) {
        Some(validate_vpk(&temporary)?)
      } else {
        None
      };
      let digest = hash(&temporary)?;
      if stamp(source)? != observed || hash(source)? != digest || stamp(source)? != observed {
        return Err(SnapshotError::Changed);
      }
      let mut index = self.list()?;
      if let Some(position) = index.iter().position(|snapshot| snapshot.hash == digest) {
        let snapshot = index.remove(position);
        index.insert(0, snapshot.clone());
        self.save(&index)?;
        return Ok((snapshot, false));
      }
      while index.len() >= MAX_SNAPSHOTS
        || index.iter().map(|snapshot| snapshot.size).sum::<u64>() + copied > MAX_STAGED_BYTES
      {
        let evict = index
          .iter()
          .rposition(|snapshot| !pinned.contains(&snapshot.hash))
          .ok_or_else(|| {
            SnapshotError::Quota("Snapshot quota is full of installed builds".into())
          })?;
        let removed = index.remove(evict);
        self.save(&index)?;
        fs::remove_dir_all(self.dir.join(&removed.hash))?;
      }
      let destination = self.dir.join(&digest);
      fs::create_dir_all(&destination)?;
      fs::rename(&temporary, destination.join(SNAPSHOT_FILE))?;
      let snapshot = Snapshot {
        hash: digest,
        size: copied,
        resources,
        staged_at: chrono::Utc::now().to_rfc3339(),
      };
      index.insert(0, snapshot.clone());
      self.save(&index)?;
      Ok((snapshot, true))
    });
    let _ = fs::remove_file(&temporary);
    result
  }

  /// One step of watching the granted output. Called on every `tick`, so it
  /// only does real work once the file has held still for [`STABLE_FOR`].
  pub fn inspect(
    &self,
    observation: &mut Observation,
    output: &Path,
    require_marker: bool,
    pinned: &[String],
  ) -> Result<Inspection, SnapshotError> {
    match fs::symlink_metadata(output) {
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
        *observation = Observation::default();
        return Ok(Inspection::Missing);
      }
      Err(error) => return Err(error.into()),
      Ok(_) => {}
    }
    if fs::canonicalize(output)? != output {
      return Ok(Inspection::Invalid {
        message: "The file now redirects to another path; grant it again".into(),
      });
    }
    let current = match stamp(output) {
      Ok(current) => current,
      Err(SnapshotError::Invalid(message)) => return Ok(Inspection::Invalid { message }),
      Err(error) => return Err(error),
    };
    if observation.stamp != Some(current) {
      observation.stamp = Some(current);
      observation.since = Some(Instant::now());
      return Ok(Inspection::Changing);
    }
    if let Some((accepted, hash)) = &observation.accepted
      && *accepted == current
      && let Some(snapshot) = self.get(hash)?
    {
      return Ok(Inspection::Ready {
        snapshot,
        staged: false,
      });
    }
    if let Some((rejected, message)) = &observation.rejected
      && *rejected == current
    {
      return Ok(Inspection::Invalid {
        message: message.clone(),
      });
    }
    if observation
      .since
      .is_none_or(|since| since.elapsed() < STABLE_FOR)
    {
      return Ok(Inspection::Changing);
    }
    if require_marker {
      let mut marker = output.as_os_str().to_owned();
      marker.push(".ready");
      let fresh = fs::metadata(PathBuf::from(marker))
        .and_then(|meta| meta.modified())
        .is_ok_and(|modified| modified >= current.1);
      if !fresh {
        return Ok(Inspection::WaitingForMarker);
      }
    }
    match self.stage(output, current, pinned) {
      Ok((snapshot, staged)) => {
        observation.accepted = Some((current, snapshot.hash.clone()));
        Ok(Inspection::Ready { snapshot, staged })
      }
      Err(SnapshotError::Changed) => {
        observation.stamp = None;
        Ok(Inspection::Changing)
      }
      Err(SnapshotError::Invalid(message)) => {
        observation.rejected = Some((current, message.clone()));
        Ok(Inspection::Invalid { message })
      }
      Err(error) => Err(error),
    }
  }
}

#[cfg(test)]
pub(crate) mod tests {
  use super::*;

  pub(crate) fn vpk(name: &str) -> Vec<u8> {
    let mut tree = b"txt\0 \0".to_vec();
    tree.extend_from_slice(name.as_bytes());
    tree.push(0);
    tree.extend_from_slice(&0xcbf43926u32.to_le_bytes());
    tree.extend_from_slice(&0u16.to_le_bytes());
    tree.extend_from_slice(&0x7fffu16.to_le_bytes());
    tree.extend_from_slice(&0u32.to_le_bytes());
    tree.extend_from_slice(&9u32.to_le_bytes());
    tree.extend_from_slice(&0xffffu16.to_le_bytes());
    tree.extend_from_slice(&[0, 0, 0]);
    let mut bytes = 0x55aa1234u32.to_le_bytes().to_vec();
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&(tree.len() as u32).to_le_bytes());
    bytes.extend(tree);
    bytes.extend_from_slice(b"123456789");
    bytes
  }

  pub(crate) fn settle(observation: &mut Observation) {
    observation.since = Some(Instant::now() - STABLE_FOR - Duration::from_secs(1));
  }

  fn output(dir: &Path, bytes: &[u8]) -> PathBuf {
    let path = dir.join("output.vpk");
    fs::write(&path, bytes).unwrap();
    fs::canonicalize(path).unwrap()
  }

  #[test]
  fn waits_for_stability_rejects_incomplete_writes_and_deduplicates() {
    let dir = tempfile::tempdir().unwrap();
    let store = SnapshotStore::new(&dir.path().join("data"));
    let complete = vpk("first");
    let source = output(dir.path(), &complete[..complete.len() - 2]);
    let mut observation = Observation::default();
    assert!(matches!(
      store
        .inspect(&mut observation, &source, false, &[])
        .unwrap(),
      Inspection::Changing
    ));
    settle(&mut observation);
    assert!(matches!(
      store
        .inspect(&mut observation, &source, false, &[])
        .unwrap(),
      Inspection::Invalid { .. }
    ));
    assert!(store.list().unwrap().is_empty());

    fs::write(&source, &complete).unwrap();
    assert!(matches!(
      store
        .inspect(&mut observation, &source, false, &[])
        .unwrap(),
      Inspection::Changing
    ));
    settle(&mut observation);
    let Inspection::Ready {
      snapshot,
      staged: true,
    } = store
      .inspect(&mut observation, &source, false, &[])
      .unwrap()
    else {
      panic!("complete output must stage");
    };
    let staged = store.path(&snapshot.hash).unwrap();
    let staged_bytes = fs::read(&staged).unwrap();
    observation.accepted = None;
    assert!(matches!(
      store
        .inspect(&mut observation, &source, false, &[])
        .unwrap(),
      Inspection::Ready { staged: false, .. }
    ));
    assert_eq!(store.list().unwrap().len(), 1);
    fs::write(&source, b"next build is incomplete").unwrap();
    assert_eq!(fs::read(staged).unwrap(), staged_bytes);
  }

  #[test]
  fn stages_other_files_without_vpk_validation() {
    let dir = tempfile::tempdir().unwrap();
    let store = SnapshotStore::new(&dir.path().join("data"));
    let source = dir.path().join("notes.json");
    fs::write(&source, br#"{"not":"a vpk"}"#).unwrap();
    let (snapshot, staged) = store.stage(&source, stamp(&source).unwrap(), &[]).unwrap();
    assert!(staged);
    assert_eq!(snapshot.resources, None);
    let fake = dir.path().join("fake.vpk");
    fs::write(&fake, br#"{"not":"a vpk"}"#).unwrap();
    assert!(matches!(
      store.stage(&fake, stamp(&fake).unwrap(), &[]),
      Err(SnapshotError::Invalid(_))
    ));
  }

  #[test]
  fn requires_a_fresh_marker_when_asked() {
    let dir = tempfile::tempdir().unwrap();
    let store = SnapshotStore::new(&dir.path().join("data"));
    let source = output(dir.path(), &vpk("marker"));
    let mut observation = Observation::default();
    store.inspect(&mut observation, &source, true, &[]).unwrap();
    settle(&mut observation);
    assert!(matches!(
      store.inspect(&mut observation, &source, true, &[]).unwrap(),
      Inspection::WaitingForMarker
    ));
    fs::write(format!("{}.ready", source.display()), b"ready").unwrap();
    assert!(matches!(
      store.inspect(&mut observation, &source, true, &[]).unwrap(),
      Inspection::Ready { .. }
    ));
  }

  #[test]
  fn quota_evicts_unpinned_builds_first() {
    let dir = tempfile::tempdir().unwrap();
    let store = SnapshotStore::new(&dir.path().join("data"));
    let source = output(dir.path(), &vpk("skin-0"));
    let mut pinned = Vec::new();
    for index in 0..MAX_SNAPSHOTS + 4 {
      fs::write(&source, vpk(&format!("skin-{index}"))).unwrap();
      let (snapshot, _) = store
        .stage(&source, stamp(&source).unwrap(), &pinned)
        .unwrap();
      if index == 0 {
        pinned.push(snapshot.hash);
      }
    }
    let staged = store.list().unwrap();
    assert_eq!(staged.len(), MAX_SNAPSHOTS);
    assert!(staged.iter().any(|snapshot| snapshot.hash == pinned[0]));
    assert_eq!(validate_vpk(&store.path(&pinned[0]).unwrap()).unwrap(), 1);
    assert!(store.path("../../etc").is_none());
  }

  #[test]
  fn accepts_the_host_vpk_writer_and_rejects_corruption() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source");
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("skin.txt"), b"123456789").unwrap();
    let packed = dir.path().join("host_dir.vpk");
    vpkmanager::pack::pack_directory(&source, &packed).unwrap();
    assert_eq!(validate_vpk(&packed).unwrap(), 1);

    let path = dir.path().join("test.vpk");
    let mut bytes = vpk("skin");
    *bytes.last_mut().unwrap() = b'x';
    fs::write(&path, bytes).unwrap();
    assert!(validate_vpk(&path).is_err());
    let mut bytes = vpk("skin");
    let index = 12 + b"txt\0 \0skin\0".len() + 6;
    bytes[index..index + 2].copy_from_slice(&0u16.to_le_bytes());
    fs::write(&path, bytes).unwrap();
    assert!(validate_vpk(&path).is_err());
  }
}
