use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use vpk_parser::VpkParser;

use crate::error::{Result, Source2Error};

const VPK_SIGNATURE: u32 = 0x55aa1234;

struct EntryInfo {
    full_path: String,
    archive_index: u16,
    entry_offset: u32,
    entry_length: u32,
    preload: Vec<u8>,
}

/// Suffix of the sidecar that redirects companion-archive lookups: a file named
/// `<name>.vpk.origin` beside a VPK holds the absolute directory its `_NNN.vpk`
/// companions live in.
///
/// This exists for staged copies. A `_dir.vpk` can be copied somewhere else and
/// parsed from there, but copying its companions along is not always viable —
/// the base game's pak is a 6 MB directory file in front of ~100 companion
/// archives totalling tens of gigabytes. The sidecar lets the staged directory
/// file resolve entry payloads read-only from where the companions actually are.
pub const ORIGIN_SIDECAR_SUFFIX: &str = ".origin";

/// Path of the origin sidecar belonging to `vpk_path`.
pub fn origin_sidecar_path(vpk_path: &Path) -> PathBuf {
    let mut name = vpk_path.file_name().unwrap_or_default().to_os_string();
    name.push(ORIGIN_SIDECAR_SUFFIX);
    vpk_path.with_file_name(name)
}

/// Directory to resolve `_NNN.vpk` companions in: the one named by the origin
/// sidecar when it exists and still points at a directory, else the VPK's own.
pub fn companion_dir(vpk_path: &Path) -> PathBuf {
    if let Ok(text) = fs::read_to_string(origin_sidecar_path(vpk_path)) {
        let origin = PathBuf::from(text.trim());
        if origin.is_dir() {
            return origin;
        }
    }
    vpk_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf()
}

pub struct VpkArchive {
    path: PathBuf,
    companion_dir: PathBuf,
    data_section_start: usize,
    inline_data_length: Option<u32>,
    entries: Vec<EntryInfo>,
    entry_index: HashMap<String, usize>,
    /// An unpacked file tree that shadows the archive. When the Foundry has an
    /// editable workspace open, a file present there is the user's edited
    /// version of that entry, so previews must read it instead of the packed
    /// original.
    overlay_dir: Option<PathBuf>,
}

impl VpkArchive {
    pub fn open(vpk_path: &Path) -> Result<Self> {
        let mut file = fs::File::open(vpk_path)?;
        let mut buffer = [0u8; 12];
        file.read_exact(&mut buffer)?;

        let sig = u32::from_le_bytes(buffer[0..4].try_into().unwrap());
        if sig != VPK_SIGNATURE {
            return Err(Source2Error::Vpk("bad VPK signature".into()));
        }

        let version = u32::from_le_bytes(buffer[4..8].try_into().unwrap());
        if version != 1 && version != 2 {
            return Err(Source2Error::Vpk(format!(
                "unsupported VPK version {version}"
            )));
        }
        let tree_length = u32::from_le_bytes(buffer[8..12].try_into().unwrap()) as usize;
        let tree_start: usize = if version >= 2 { 28 } else { 12 };
        let data_section_start = tree_start + tree_length;
        let inline_data_length = if version == 2 {
            let mut rest = [0; 16];
            file.read_exact(&mut rest)?;
            Some(u32::from_le_bytes(rest[..4].try_into().unwrap()))
        } else {
            None
        };

        let parsed_entries = VpkParser::parse_directory_with_preload_from_file(vpk_path)
            .map_err(|e| Source2Error::Vpk(format!("failed to parse VPK directory: {e}")))?;

        let entries: Vec<EntryInfo> = parsed_entries
            .into_iter()
            .map(|(entry, preload)| EntryInfo {
                full_path: entry.full_path,
                archive_index: entry.archive_index,
                entry_offset: entry.entry_offset,
                entry_length: entry.entry_length,
                preload,
            })
            .collect();
        let mut entry_index = HashMap::new();
        for (index, entry) in entries.iter().enumerate() {
            entry_index
                .entry(entry.full_path.to_ascii_lowercase())
                .or_insert(index);
        }

        Ok(Self {
            path: vpk_path.to_path_buf(),
            companion_dir: companion_dir(vpk_path),
            data_section_start,
            inline_data_length,
            entries,
            entry_index,
            overlay_dir: None,
        })
    }

    /// Open the archive with an unpacked tree shadowing it (see `overlay_dir`).
    pub fn open_with_overlay(vpk_path: &Path, overlay_dir: Option<&Path>) -> Result<Self> {
        let mut archive = Self::open(vpk_path)?;
        archive.overlay_dir = overlay_dir
            .filter(|dir| dir.is_dir())
            .map(Path::to_path_buf);
        Ok(archive)
    }

    /// The overlay's path for an entry, if the overlay holds one. Entry paths
    /// come from the VPK directory, so they are already relative and separator-
    /// normalized, but a `..` is rejected rather than trusted.
    fn overlay_path(&self, entry_path: &str) -> Option<PathBuf> {
        let overlay_dir = self.overlay_dir.as_ref()?;
        let normalized = entry_path.replace('\\', "/");
        if normalized
            .split('/')
            .any(|part| part == ".." || part.is_empty())
        {
            return None;
        }
        let path = overlay_dir.join(normalized);
        path.is_file().then_some(path)
    }

    pub fn list_entries(&self) -> Vec<String> {
        self.entries
            .iter()
            .map(|entry| entry.full_path.clone())
            .collect()
    }

    pub fn contains_entry(&self, entry_path: &str) -> bool {
        self.overlay_path(entry_path).is_some()
            || self
                .entry_index
                .contains_key(&entry_path.replace('\\', "/").to_ascii_lowercase())
    }

    /// Whether an entry stores a prefix in the directory tree. Extraction includes this prefix.
    pub fn has_preload_bytes(&self, entry_path: &str) -> bool {
        let key = entry_path.replace('\\', "/").to_ascii_lowercase();
        self.entry_index
            .get(&key)
            .and_then(|index| self.entries.get(*index))
            .is_some_and(|entry| !entry.preload.is_empty())
    }

    pub fn extract_entry(&self, entry_path: &str) -> Result<Vec<u8>> {
        if let Some(overlay) = self.overlay_path(entry_path) {
            return Ok(fs::read(overlay)?);
        }
        let key = entry_path.replace('\\', "/").to_ascii_lowercase();
        let entry = self
            .entry_index
            .get(&key)
            .and_then(|index| self.entries.get(*index))
            .ok_or_else(|| Source2Error::EntryNotFound(entry_path.to_string()))?;
        self.read_entry(entry)
    }

    /// Read the bytes of one already-resolved entry, pulling from inline data or
    /// the matching `_NNN.vpk` companion archive.
    fn read_entry(&self, entry: &EntryInfo) -> Result<Vec<u8>> {
        let mut bytes = entry.preload.clone();
        if entry.entry_length == 0 {
            return Ok(bytes);
        }

        if entry.archive_index == 0x7fff {
            if self.inline_data_length.is_some_and(|length| {
                u64::from(entry.entry_offset) + u64::from(entry.entry_length) > u64::from(length)
            }) {
                return Err(Source2Error::Vpk(
                    "inline entry exceeds the VPK data section".into(),
                ));
            }
            let start = self.data_section_start as u64 + u64::from(entry.entry_offset);
            let mut file = fs::File::open(&self.path)?;
            if start + u64::from(entry.entry_length) > file.metadata()?.len() {
                return Err(Source2Error::Vpk(
                    "inline entry exceeds the VPK file".into(),
                ));
            }
            file.seek(SeekFrom::Start(start))?;
            let prefix = bytes.len();
            bytes.resize(prefix + entry.entry_length as usize, 0);
            file.read_exact(&mut bytes[prefix..])?;
            return Ok(bytes);
        }

        let stem = self.path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let base = stem.strip_suffix("_dir").unwrap_or(stem);
        let archive_name = format!("{base}_{:03}.vpk", entry.archive_index);
        let archive_path = self.companion_dir.join(&archive_name);
        let mut archive_file = fs::File::open(&archive_path)?;
        if u64::from(entry.entry_offset) + u64::from(entry.entry_length)
            > archive_file.metadata()?.len()
        {
            return Err(Source2Error::Vpk(
                "entry exceeds its companion archive".into(),
            ));
        }
        archive_file.seek(SeekFrom::Start(u64::from(entry.entry_offset)))?;
        let prefix = bytes.len();
        bytes.resize(prefix + entry.entry_length as usize, 0);
        archive_file.read_exact(&mut bytes[prefix..])?;
        Ok(bytes)
    }

    /// Unpack every entry to `dest_dir`, preserving the VPK's internal directory
    /// layout. Returns the number of files written. Entries whose path would
    /// escape `dest_dir` (contain `..`, absolute/root components) are skipped.
    /// This only reads the source VPK; nothing is moved or removed.
    pub fn extract_all_to(&self, dest_dir: &Path) -> Result<usize> {
        let mut written = 0usize;
        for entry in &self.entries {
            written += self.write_entry(entry, dest_dir)?;
        }
        Ok(written)
    }

    /// Unpack only the named entries to `dest_dir` (case-insensitive match),
    /// preserving their internal directory layout. Used to pull a single hero's
    /// assets out of the shared base-game pak without unpacking gigabytes.
    pub fn extract_entries_to(&self, dest_dir: &Path, entry_paths: &[String]) -> Result<usize> {
        let mut written = 0usize;
        for entry_path in entry_paths {
            let key = entry_path.replace('\\', "/").to_ascii_lowercase();
            if let Some(entry) = self
                .entry_index
                .get(&key)
                .and_then(|index| self.entries.get(*index))
            {
                written += self.write_entry(entry, dest_dir)?;
            }
        }
        Ok(written)
    }

    /// Write one entry's bytes under `dest_dir` at its sanitized relative path.
    /// Returns 1 if written, 0 if the path was rejected as unsafe.
    fn write_entry(&self, entry: &EntryInfo, dest_dir: &Path) -> Result<usize> {
        let Some(rel) = sanitize_relative(&entry.full_path) else {
            return Ok(0);
        };
        let out_path = dest_dir.join(&rel);
        let data = self.read_entry(entry)?;
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&out_path, &data)?;
        Ok(1)
    }
}

/// Turn a VPK entry path into a safe relative path under an output dir: forward
/// slashes, no `..`/root/prefix components. Returns `None` if nothing is left.
fn sanitize_relative(entry_path: &str) -> Option<PathBuf> {
    use std::path::Component;
    let normalized = entry_path.replace('\\', "/");
    let mut out = PathBuf::new();
    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return None;
            }
        }
    }
    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}

/// Read the raw bytes of a single entry inside a VPK, resolving inline data and
/// companion `_NNN.vpk` archives. Mirrors the game's VPK v2 layout.
pub fn extract_entry(vpk_path: &Path, entry_path: &str) -> Result<Vec<u8>> {
    VpkArchive::open(vpk_path)?.extract_entry(entry_path)
}

/// List every entry path in a VPK (used to resolve the actual texture path when
/// the caller only knows a filename).
pub fn list_entries(vpk_path: &Path) -> Result<Vec<String>> {
    Ok(VpkArchive::open(vpk_path)?.list_entries())
}

/// Unpack an entire VPK into `dest_dir`, preserving its directory layout.
/// Read-only with respect to the source VPK. Returns the file count written.
pub fn extract_all(vpk_path: &Path, dest_dir: &Path) -> Result<usize> {
    VpkArchive::open(vpk_path)?.extract_all_to(dest_dir)
}

/// Unpack only the named entries from a VPK into `dest_dir`. Read-only with
/// respect to the source VPK. Returns the file count written.
pub fn extract_entries(vpk_path: &Path, dest_dir: &Path, entry_paths: &[String]) -> Result<usize> {
    VpkArchive::open(vpk_path)?.extract_entries_to(dest_dir, entry_paths)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn inline_vpk(preload: &[u8], data: &[u8]) -> Vec<u8> {
        let mut tree = Vec::new();
        tree.extend_from_slice(b"txt\0folder\0sample\0");
        tree.extend_from_slice(&0u32.to_le_bytes());
        tree.extend_from_slice(&u16::try_from(preload.len()).unwrap().to_le_bytes());
        tree.extend_from_slice(&0x7fffu16.to_le_bytes());
        tree.extend_from_slice(&0u32.to_le_bytes());
        tree.extend_from_slice(&u32::try_from(data.len()).unwrap().to_le_bytes());
        tree.extend_from_slice(&0xffffu16.to_le_bytes());
        tree.extend_from_slice(preload);
        tree.extend_from_slice(b"\0\0\0");

        let mut bytes = Vec::new();
        bytes.extend_from_slice(&VPK_SIGNATURE.to_le_bytes());
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&u32::try_from(tree.len()).unwrap().to_le_bytes());
        bytes.extend_from_slice(&tree);
        bytes.extend_from_slice(data);
        bytes
    }

    fn scratch_dir(label: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since_epoch| since_epoch.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("s2m-{label}-{unique}"));
        fs::create_dir_all(&dir).expect("create scratch dir");
        dir
    }

    #[test]
    fn companion_dir_defaults_to_the_vpk_s_own_directory() {
        let dir = scratch_dir("own");
        let vpk = dir.join("pak01_dir.vpk");
        assert_eq!(companion_dir(&vpk), dir);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn origin_sidecar_redirects_companion_lookups() {
        let staged = scratch_dir("staged");
        let origin = scratch_dir("origin");
        let vpk = staged.join("pak01_dir.vpk");

        fs::write(
            origin_sidecar_path(&vpk),
            origin.to_string_lossy().as_bytes(),
        )
        .expect("write sidecar");

        assert_eq!(companion_dir(&vpk), origin);
        let _ = fs::remove_dir_all(&staged);
        let _ = fs::remove_dir_all(&origin);
    }

    #[test]
    fn stale_origin_sidecar_falls_back_to_the_vpk_s_own_directory() {
        let staged = scratch_dir("stale");
        let vpk = staged.join("pak01_dir.vpk");
        fs::write(origin_sidecar_path(&vpk), b"C:/gone/citadel").expect("write sidecar");

        assert_eq!(companion_dir(&vpk), staged);
        let _ = fs::remove_dir_all(&staged);
    }

    #[test]
    fn origin_sidecar_path_appends_to_the_full_file_name() {
        let sidecar = origin_sidecar_path(Path::new("/tmp/staged/pak01_dir.vpk"));
        assert_eq!(
            sidecar.file_name().and_then(|name| name.to_str()),
            Some("pak01_dir.vpk.origin"),
        );
    }

    #[test]
    fn directory_only_open_preserves_entries_and_preload_metadata() {
        let dir = scratch_dir("directory-only");
        let ordinary_path = dir.join("ordinary_dir.vpk");
        fs::write(&ordinary_path, inline_vpk(&[], b"payload")).expect("write ordinary VPK");
        let ordinary = VpkArchive::open(&ordinary_path).expect("open ordinary VPK");
        assert_eq!(ordinary.list_entries(), vec!["folder/sample.txt"]);
        assert!(!ordinary.has_preload_bytes("FOLDER\\SAMPLE.TXT"));
        assert_eq!(
            ordinary.extract_entry("folder/sample.txt").unwrap(),
            b"payload"
        );

        let preload_path = dir.join("preload_dir.vpk");
        fs::write(&preload_path, inline_vpk(b"prefix", b"payload")).expect("write preload VPK");
        let preload = VpkArchive::open(&preload_path).expect("open preload VPK");
        assert!(preload.has_preload_bytes("folder/sample.txt"));
        assert_eq!(
            preload.extract_entry("folder/sample.txt").unwrap(),
            b"prefixpayload"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn extracts_preload_only_and_companion_entries_without_losing_the_prefix() {
        let dir = scratch_dir("preload");
        let vpk = dir.join("pak01_dir.vpk");
        fs::write(&vpk, inline_vpk(b"prefix", b"")).unwrap();
        assert_eq!(
            VpkArchive::open(&vpk)
                .unwrap()
                .extract_entry("folder/sample.txt")
                .unwrap(),
            b"prefix"
        );
        let mut bytes = inline_vpk(b"prefix", b"payload");
        let index_offset = 12 + b"txt\0folder\0sample\0".len() + 6;
        bytes[index_offset..index_offset + 2].copy_from_slice(&0u16.to_le_bytes());
        bytes.truncate(bytes.len() - b"payload".len());
        fs::write(&vpk, bytes).unwrap();
        fs::write(dir.join("pak01_000.vpk"), b"payload").unwrap();
        assert_eq!(
            VpkArchive::open(&vpk)
                .unwrap()
                .extract_entry("folder/sample.txt")
                .unwrap(),
            b"prefixpayload"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn validates_versions_and_payload_extents() {
        let dir = scratch_dir("invalid");
        let vpk = dir.join("pak01_dir.vpk");
        let mut bytes = inline_vpk(b"", b"payload");
        bytes[4..8].copy_from_slice(&3u32.to_le_bytes());
        fs::write(&vpk, &bytes).unwrap();
        assert!(VpkArchive::open(&vpk).is_err());
        bytes[4..8].copy_from_slice(&1u32.to_le_bytes());
        bytes.pop();
        fs::write(&vpk, &bytes).unwrap();
        assert!(
            VpkArchive::open(&vpk)
                .unwrap()
                .extract_entry("folder/sample.txt")
                .is_err()
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn extracts_v2_preloads_and_refuses_directory_or_data_section_overruns() {
        let dir = scratch_dir("v2-preload");
        let path = dir.join("pak01_dir.vpk");
        let v1 = inline_vpk(b"prefix", b"payload");
        let mut v2 = v1[..12].to_vec();
        v2[4..8].copy_from_slice(&2u32.to_le_bytes());
        v2.extend_from_slice(&7u32.to_le_bytes());
        v2.extend_from_slice(&[0; 12]);
        v2.extend_from_slice(&v1[12..]);
        fs::write(&path, &v2).unwrap();
        assert_eq!(
            VpkArchive::open(&path)
                .unwrap()
                .extract_entry("folder/sample.txt")
                .unwrap(),
            b"prefixpayload"
        );
        v2[12..16].copy_from_slice(&0u32.to_le_bytes());
        fs::write(&path, &v2).unwrap();
        assert!(
            VpkArchive::open(&path)
                .unwrap()
                .extract_entry("folder/sample.txt")
                .is_err()
        );
        v2[8..12].copy_from_slice(&u32::MAX.to_le_bytes());
        fs::write(&path, &v2).unwrap();
        assert!(VpkArchive::open(&path).is_err());
        let mut truncated_tree = v1;
        let tree_length = u32::from_le_bytes(truncated_tree[8..12].try_into().unwrap());
        truncated_tree[8..12].copy_from_slice(&(tree_length - 1).to_le_bytes());
        fs::write(&path, &truncated_tree).unwrap();
        assert!(VpkArchive::open(&path).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
