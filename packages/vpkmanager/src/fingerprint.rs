//! The identity a mod manager stamps into a VPK so it can always find it again.
//!
//! A profile's ledger records where every mod's VPKs are, but a filename is a
//! weak key: users rename files, drag them between `addons` folders, restore an
//! old backup, or copy a VPK in by hand. A fingerprint survives all of that. It
//! is a small JSON document stored *inside* the VPK, at `.dmm/fingerprint.dmm`,
//! so wherever the file ends up its owning mod can be read straight back out of
//! it.
//!
//! Stamping is deliberately additive: [`crate::vpkdir`] appends the entry
//! without moving any existing file's bytes, and the `dmm` extension is one no
//! Source 2 asset uses, so the engine loads a stamped VPK exactly as it loaded
//! the unstamped one.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{Result, VpkManagerError};
use crate::vpkdir::VpkDir;

/// Where the stamp lives inside the VPK: `.dmm/fingerprint.dmm`.
pub const FINGERPRINT_EXT: &str = "dmm";
pub const FINGERPRINT_DIR: &str = ".dmm";
pub const FINGERPRINT_NAME: &str = "fingerprint";

/// Payload format version, bumped when the fields below change meaning.
pub const FINGERPRINT_VERSION: u32 = 1;

/// Distinguishes two stamps issued in the same second for identical content.
///
/// Seeded from the process id and start time: a plain counter would restart at
/// zero, so two runs of the app stamping copies of one download within the same
/// second would mint the same id and the ledger would lose one of the files.
static ISSUE_COUNTER: LazyLock<AtomicU64> = LazyLock::new(|| {
    let mut hasher = Sha256::new();
    hasher.update(std::process::id().to_le_bytes());
    hasher.update(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|since| since.as_nanos())
            .unwrap_or_default()
            .to_le_bytes(),
    );
    let digest = hasher.finalize();
    AtomicU64::new(u64::from_le_bytes(
        digest[..8].try_into().unwrap_or_default(),
    ))
});

/// The stamp carried by a VPK the mod manager has taken responsibility for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VpkFingerprint {
    pub version: u32,
    /// Unique per physical VPK file, even between two copies of one download.
    pub id: String,
    /// The mod this file belongs to, as the mod manager knows it.
    pub mod_id: String,
    /// The filename the mod shipped with, before any `pak##_dir.vpk` renaming.
    pub original_name: String,
    /// Unix seconds; when this stamp was issued.
    pub issued_at: u64,
    /// SHA-256 of the VPK's canonical unstamped form. Equal for two copies of
    /// the same file, so it identifies *content* where `id` identifies a file.
    pub content_hash: String,
}

impl VpkFingerprint {
    fn new(mod_id: &str, original_name: &str, content_hash: String) -> Self {
        let issued_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|since| since.as_secs())
            .unwrap_or_default();
        let nonce = ISSUE_COUNTER.fetch_add(1, Ordering::Relaxed);

        let mut hasher = Sha256::new();
        hasher.update(content_hash.as_bytes());
        hasher.update(mod_id.as_bytes());
        hasher.update(original_name.as_bytes());
        hasher.update(issued_at.to_le_bytes());
        hasher.update(nonce.to_le_bytes());
        let id = hasher
            .finalize()
            .iter()
            .take(16)
            .map(|byte| format!("{byte:02x}"))
            .collect();

        Self {
            version: FINGERPRINT_VERSION,
            id,
            mod_id: mod_id.to_string(),
            original_name: original_name.to_string(),
            issued_at,
            content_hash,
        }
    }
}

/// Read the fingerprint out of VPK bytes already in memory.
pub fn read_from_bytes(bytes: &[u8]) -> Result<Option<VpkFingerprint>> {
    let dir = VpkDir::parse(bytes.to_vec())?;
    Ok(read_from_dir(&dir))
}

/// Read the fingerprint of a VPK on disk.
///
/// Only the VPK's header, entry tree and the stamp itself are read, so this
/// stays cheap enough to run over every file in a profile.
///
/// Returns `Ok(None)` both for a VPK that has never been stamped and for one
/// whose stamp is unreadable — a caller reconciling state wants to treat those
/// the same way, by re-stamping.
pub fn read(path: &Path) -> Result<Option<VpkFingerprint>> {
    let payload = crate::vpkdir::read_entry_from_file(
        path,
        FINGERPRINT_EXT,
        FINGERPRINT_DIR,
        FINGERPRINT_NAME,
    )?;
    Ok(payload.as_deref().and_then(parse_payload))
}

fn read_from_dir(dir: &VpkDir) -> Option<VpkFingerprint> {
    let entry = dir.find(FINGERPRINT_EXT, FINGERPRINT_DIR, FINGERPRINT_NAME)?;
    parse_payload(dir.entry_data(entry)?)
}

fn parse_payload(payload: &[u8]) -> Option<VpkFingerprint> {
    match serde_json::from_slice::<VpkFingerprint>(payload) {
        Ok(fingerprint) if fingerprint.version <= FINGERPRINT_VERSION => Some(fingerprint),
        Ok(fingerprint) => {
            log::warn!(
                "Ignoring VPK fingerprint written by a newer version ({})",
                fingerprint.version
            );
            None
        }
        Err(error) => {
            log::warn!("Ignoring unreadable VPK fingerprint: {error}");
            None
        }
    }
}

/// Stamp `path` with a fingerprint for `mod_id`, replacing any stamp already
/// there, and return it.
///
/// The file is rewritten through a sibling temp file and renamed into place, so
/// an interrupted stamp leaves the original VPK untouched.
pub fn stamp(path: &Path, mod_id: &str, original_name: &str) -> Result<VpkFingerprint> {
    let mut dir = VpkDir::parse(fs::read(path)?)?;
    let content_hash = content_hash(&mut dir)?;
    let fingerprint = VpkFingerprint::new(mod_id, original_name, content_hash);
    write_stamp(path, dir, &fingerprint)?;
    Ok(fingerprint)
}

/// SHA-256 of the VPK with any existing stamp removed, so re-stamping the same
/// file does not change its content hash.
fn content_hash(dir: &mut VpkDir) -> Result<String> {
    dir.remove(FINGERPRINT_EXT, FINGERPRINT_DIR, FINGERPRINT_NAME);
    let mut hasher = Sha256::new();
    hasher.update(dir.to_bytes()?);
    Ok(format!("{:x}", hasher.finalize()))
}

fn write_stamp(path: &Path, mut dir: VpkDir, fingerprint: &VpkFingerprint) -> Result<()> {
    let payload = serde_json::to_vec(fingerprint)
        .map_err(|error| VpkManagerError::Vpk(format!("failed to encode fingerprint: {error}")))?;
    dir.upsert_inline(FINGERPRINT_EXT, FINGERPRINT_DIR, FINGERPRINT_NAME, &payload);
    let bytes = dir.to_bytes()?;

    let temp = temp_path(path);
    if temp.exists() {
        fs::remove_file(&temp)?;
    }
    fs::write(&temp, &bytes)?;
    if let Err(error) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(error.into());
    }
    Ok(())
}

fn temp_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "vpk".to_string());
    path.with_file_name(format!(".{name}.dmm-stamp"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pack::pack_directory;

    /// Build a VPK holding a couple of files, the way a packed mod looks.
    fn sample_vpk(dir: &Path) -> PathBuf {
        let source = dir.join("src");
        fs::create_dir_all(source.join("models/heroes")).unwrap();
        fs::write(source.join("models/heroes/skin.vmdl_c"), b"model bytes").unwrap();
        fs::write(source.join("readme.txt"), b"hello").unwrap();
        let vpk = dir.join("mod.vpk");
        pack_directory(&source, &vpk).unwrap();
        vpk
    }

    fn entry_bytes(path: &Path, full_path: &str) -> Vec<u8> {
        let dir = VpkDir::parse(fs::read(path).unwrap()).unwrap();
        let entry = dir
            .entries()
            .iter()
            .find(|entry| entry.full_path() == full_path)
            .expect("entry is missing");
        dir.entry_data(entry).expect("entry has no data").to_vec()
    }

    #[test]
    fn stamping_preserves_every_other_file_in_the_vpk() {
        let temp = tempfile::tempdir().unwrap();
        let vpk = sample_vpk(temp.path());
        let before: Vec<_> = VpkDir::parse(fs::read(&vpk).unwrap())
            .unwrap()
            .entries()
            .iter()
            .map(|entry| (entry.full_path(), entry.crc32))
            .collect();

        stamp(&vpk, "650634", "cool_mod.vpk").unwrap();

        let after = VpkDir::parse(fs::read(&vpk).unwrap()).unwrap();
        for (full_path, crc32) in before {
            let entry = after
                .entries()
                .iter()
                .find(|entry| entry.full_path() == full_path)
                .unwrap_or_else(|| panic!("{full_path} disappeared"));
            assert_eq!(entry.crc32, crc32, "{full_path} changed");
            assert_eq!(
                crate::pack::checksum(after.entry_data(entry).unwrap()),
                crc32,
                "{full_path} no longer resolves to its own bytes"
            );
        }
        assert_eq!(
            entry_bytes(&vpk, "models/heroes/skin.vmdl_c"),
            b"model bytes"
        );
    }

    #[test]
    fn a_stamp_round_trips_through_the_file() {
        let temp = tempfile::tempdir().unwrap();
        let vpk = sample_vpk(temp.path());

        let written = stamp(&vpk, "650634", "cool_mod.vpk").unwrap();
        let read_back = read(&vpk).unwrap().unwrap();

        assert_eq!(read_back, written);
        assert_eq!(read_back.mod_id, "650634");
        assert_eq!(read_back.original_name, "cool_mod.vpk");
        assert_eq!(read_back.id.len(), 32);
    }

    #[test]
    fn an_unstamped_vpk_reports_no_fingerprint() {
        let temp = tempfile::tempdir().unwrap();
        let vpk = sample_vpk(temp.path());

        assert!(read(&vpk).unwrap().is_none());
    }

    /// Re-stamping must not pile up copies of the old payload, and must keep
    /// the content hash — the identity of the *content* — stable.
    #[test]
    fn restamping_replaces_the_previous_stamp() {
        let temp = tempfile::tempdir().unwrap();
        let vpk = sample_vpk(temp.path());

        let first = stamp(&vpk, "650634", "cool_mod.vpk").unwrap();
        let size_after_first = fs::metadata(&vpk).unwrap().len();
        let second = stamp(&vpk, "local-abc", "renamed.vpk").unwrap();
        let size_after_second = fs::metadata(&vpk).unwrap().len();

        assert_eq!(read(&vpk).unwrap().unwrap(), second);
        assert_eq!(second.content_hash, first.content_hash);
        assert_ne!(second.id, first.id);
        assert!(
            size_after_second <= size_after_first + 16,
            "re-stamping grew the VPK by {} bytes",
            size_after_second - size_after_first
        );

        let dir = VpkDir::parse(fs::read(&vpk).unwrap()).unwrap();
        assert_eq!(
            dir.entries()
                .iter()
                .filter(|entry| entry.ext == FINGERPRINT_EXT)
                .count(),
            1
        );
    }

    /// Two copies of one download are different files that must stay tellable
    /// apart, while still being recognizable as the same content.
    #[test]
    fn two_copies_of_one_vpk_get_different_ids_but_one_content_hash() {
        let temp = tempfile::tempdir().unwrap();
        let first = sample_vpk(temp.path());
        let second = temp.path().join("copy.vpk");
        fs::copy(&first, &second).unwrap();

        let left = stamp(&first, "650634", "cool_mod.vpk").unwrap();
        let right = stamp(&second, "650634", "cool_mod.vpk").unwrap();

        assert_ne!(left.id, right.id);
        assert_eq!(left.content_hash, right.content_hash);
    }

    /// The synthetic VPKs above are all written by our own packer. This one is
    /// a real Deadlock mod VPK, which is what stamping actually runs against.
    #[test]
    fn stamping_a_real_deadlock_vpk_keeps_every_entry_intact() {
        let sample = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../vpk-parser/data/pak95_dir.vpk")
            .canonicalize()
            .expect("sample VPK is missing");
        let temp = tempfile::tempdir().unwrap();
        let vpk = temp.path().join("pak95_dir.vpk");
        fs::copy(&sample, &vpk).unwrap();

        let before = VpkDir::parse(fs::read(&vpk).unwrap()).unwrap();
        let originals: Vec<_> = before
            .entries()
            .iter()
            .map(|entry| {
                (
                    entry.full_path(),
                    entry.crc32,
                    entry.archive_index,
                    entry.length,
                    before.entry_data(entry).map(<[u8]>::to_vec),
                )
            })
            .collect();
        assert!(!originals.is_empty(), "sample VPK parsed as empty");

        let fingerprint = stamp(&vpk, "650634", "cool_mod.vpk").unwrap();

        assert_eq!(read(&vpk).unwrap().unwrap(), fingerprint);
        let after = VpkDir::parse(fs::read(&vpk).unwrap()).unwrap();
        assert_eq!(after.entries().len(), originals.len() + 1);
        for (full_path, crc32, archive_index, length, data) in originals {
            let entry = after
                .entries()
                .iter()
                .find(|entry| entry.full_path() == full_path)
                .unwrap_or_else(|| panic!("{full_path} disappeared"));
            assert_eq!(entry.crc32, crc32, "{full_path}");
            assert_eq!(entry.archive_index, archive_index, "{full_path}");
            assert_eq!(entry.length, length, "{full_path}");
            assert_eq!(
                after.entry_data(entry).map(<[u8]>::to_vec),
                data,
                "{full_path}"
            );
            if let Some(bytes) = after.entry_data(entry) {
                assert_eq!(crate::pack::checksum(bytes), crc32, "{full_path}");
            }
        }
    }

    /// Entries stored in `_NNN.vpk` companions are addressed by archive index,
    /// so stamping the directory file must leave them pointing where they were.
    #[test]
    fn stamping_keeps_multipart_entries_addressable() {
        let temp = tempfile::tempdir().unwrap();
        let vpk = sample_vpk(temp.path());
        let mut dir = VpkDir::parse(fs::read(&vpk).unwrap()).unwrap();
        // Re-home one entry into a companion archive, as a split VPK would.
        let entries = dir.entries().to_vec();
        let mut external = entries[0].clone();
        external.archive_index = 3;
        external.offset = 4096;
        dir.remove(&external.ext, &external.path, &external.filename);
        dir.push(external.clone());
        fs::write(&vpk, dir.to_bytes().unwrap()).unwrap();

        stamp(&vpk, "650634", "cool_mod.vpk").unwrap();

        let after = VpkDir::parse(fs::read(&vpk).unwrap()).unwrap();
        let entry = after
            .find(&external.ext, &external.path, &external.filename)
            .unwrap();
        assert_eq!(entry.archive_index, 3);
        assert_eq!(entry.offset, 4096);
        assert_eq!(entry.length, external.length);
    }
}
