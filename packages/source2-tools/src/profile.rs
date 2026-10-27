use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::ToolError;

#[derive(Deserialize)]
pub(crate) struct Profile {
    pub id: String,
    pub modules: Vec<Module>,
}

#[derive(Deserialize)]
pub(crate) struct Module {
    pub path: String,
    pub sha256: String,
    #[serde(default)]
    pub accepted_sha256: Vec<String>,
    pub source: String,
    pub source_path: String,
}

impl Module {
    pub fn accepts_hash(&self, actual: &str) -> bool {
        actual == self.sha256 || self.accepted_sha256.iter().any(|hash| hash == actual)
    }
}

pub(crate) fn bundled_profile() -> Result<Profile, ToolError> {
    Ok(serde_json::from_str(include_str!(
        "../profiles/deadlock-2026-10-24.json"
    ))?)
}

#[derive(Debug, Serialize)]
pub struct ModuleCheck {
    pub path: String,
    pub expected_sha256: String,
    pub actual_sha256: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SdkInspection {
    pub profile: String,
    pub compatible: bool,
    pub checked_modules: usize,
    pub differences: Vec<ModuleCheck>,
}

pub(crate) fn file_hash(path: &Path) -> io::Result<Option<String>> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let mut digest = Sha256::new();
    let mut buffer = [0; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(Some(format!("{:x}", digest.finalize())))
}

#[derive(PartialEq, Eq)]
struct FileStamp {
    len: u64,
    modified: SystemTime,
    created: Option<SystemTime>,
}

impl FileStamp {
    fn read(path: &Path) -> io::Result<Self> {
        let metadata = std::fs::metadata(path)?;
        Ok(Self {
            len: metadata.len(),
            modified: metadata.modified()?,
            created: metadata.created().ok(),
        })
    }
}

#[derive(Default)]
struct HashCache {
    files: HashMap<PathBuf, (FileStamp, String)>,
}

impl HashCache {
    fn hash(&mut self, path: &Path) -> io::Result<Option<String>> {
        let stamp = match FileStamp::read(path) {
            Ok(stamp) => stamp,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                self.files.remove(path);
                return Ok(None);
            }
            Err(error) => return Err(error),
        };
        if let Some((previous, hash)) = self.files.get(path)
            && *previous == stamp
        {
            return Ok(Some(hash.clone()));
        }
        let hash = file_hash(path)?;
        if let Some(hash) = &hash
            && FileStamp::read(path)? == stamp
        {
            if self.files.len() >= 512 {
                self.files.clear();
            }
            self.files.insert(path.to_owned(), (stamp, hash.clone()));
        }
        Ok(hash)
    }
}

pub(crate) fn inspect_sdk_cached(root: &Path) -> Result<SdkInspection, ToolError> {
    static HASHES: LazyLock<Mutex<HashCache>> = LazyLock::new(Mutex::default);
    let mut hashes = HASHES
        .lock()
        .map_err(|error| ToolError::InvalidInput(error.to_string()))?;
    inspect_sdk_with(root, |path| hashes.hash(path))
}

fn check_model_metadata(root: &Path) -> Result<(), ToolError> {
    let path = root.join("game/bin/assettypes_common.txt");
    let source = std::fs::read_to_string(&path).map_err(|source| ToolError::Io { path, source })?;
    if crate::metadata::add_ag2_model_dependency(&source)? != source.replace("\r\n", "\n") {
        return Err(ToolError::InvalidInput(
            "The SDK metadata lacks AG2 skeleton dependencies; prepare a new SDK with the current workbench".into(),
        ));
    }
    if !root.join("game/citadel/maps/dl_hideout.vpk").is_file() {
        return Err(ToolError::InvalidInput(
            "The SDK is missing its preview map; prepare a new SDK with the current workbench"
                .into(),
        ));
    }
    for directory in ["citadel", "core"] {
        let path = root
            .join("game")
            .join(directory)
            .join("readonly_tools_asset_info.bin");
        let mut header = Vec::with_capacity(36);
        File::open(&path)
            .and_then(|file| file.take(36).read_to_end(&mut header))
            .map_err(|source| ToolError::Io { path, source })?;
        if header.len() < 36
            || !header.starts_with(&[0xe9, 0xac, 0xcc, 0xc4])
            || !matches!(header.get(4..8), Some([13 | 16, 0, 0, 0]))
        {
            return Err(ToolError::InvalidInput("The SDK is missing a compatible asset cache; prepare a new SDK with the current workbench".into()));
        }
    }
    Ok(())
}

pub fn inspect_sdk(root: &Path) -> Result<SdkInspection, ToolError> {
    inspect_sdk_with(root, file_hash)
}

fn inspect_sdk_with(
    root: &Path,
    mut hash_file: impl FnMut(&Path) -> io::Result<Option<String>>,
) -> Result<SdkInspection, ToolError> {
    let profile = bundled_profile()?;
    let mut differences = Vec::new();
    let checked_modules = profile.modules.len();
    for module in profile.modules {
        let path = root.join(&module.path);
        let actual_sha256 = hash_file(&path).map_err(|source| ToolError::Io { path, source })?;
        if !actual_sha256
            .as_deref()
            .is_some_and(|actual| module.accepts_hash(actual))
        {
            differences.push(ModuleCheck {
                path: module.path,
                expected_sha256: module.sha256,
                actual_sha256,
            });
        }
    }
    if differences.is_empty() {
        check_model_metadata(root)?;
    }
    Ok(SdkInspection {
        profile: profile.id,
        compatible: differences.is_empty(),
        checked_modules,
        differences,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approved_hotfixes_accept_both_releases_without_relaxing_patch_inputs() {
        let profile = bundled_profile().unwrap();
        for (path, hotfix) in [
            (
                "game/citadel/bin/win64/client.dll",
                "8da25ddcd11c1146eeb9770bca24fb25c594c7abdb28947035a44ec8f2945843",
            ),
            (
                "game/citadel/bin/win64/server.dll",
                "1cc0a966a89dac2bf93c78315b2202a9ebb81c371fac7746162d8c345a786696",
            ),
        ] {
            let module = profile
                .modules
                .iter()
                .find(|module| module.path == path)
                .unwrap();
            assert!(module.accepts_hash(&module.sha256));
            assert!(module.accepts_hash(hotfix));
            assert!(!module.accepts_hash(&crate::hash(b"unrecognized runtime")));
        }
        for module in profile.modules.iter().filter(|module| {
            module.path != "game/citadel/bin/win64/client.dll"
                && module.path != "game/citadel/bin/win64/server.dll"
        }) {
            assert!(module.accepted_sha256.is_empty(), "{}", module.path);
        }
    }

    #[test]
    fn original_profiles_keep_exact_hash_matching() {
        let module: Module = serde_json::from_str(r#"{
            "path": "module.dll", "sha256": "original", "source": "fixture", "source_path": "module.dll"
        }"#).unwrap();
        assert!(module.accepts_hash("original"));
        assert!(!module.accepts_hash("different"));
    }

    #[test]
    fn matching_binaries_do_not_make_legacy_model_metadata_usable() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("game/bin/assettypes_common.txt");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let legacy =
            "assettypes {\n\t\tmodel_asset = { m_CompileDependsOnResourceTypes = [ \"vmat\" ] } }";
        std::fs::write(&path, legacy).unwrap();
        assert!(check_model_metadata(root.path()).is_err());
        std::fs::write(
            &path,
            crate::metadata::add_ag2_model_dependency(legacy).unwrap(),
        )
        .unwrap();
        assert!(check_model_metadata(root.path()).is_err());
        std::fs::create_dir_all(root.path().join("game/citadel/maps")).unwrap();
        std::fs::write(
            root.path().join("game/citadel/maps/dl_hideout.vpk"),
            b"map fixture",
        )
        .unwrap();
        assert!(check_model_metadata(root.path()).is_err());
        for directory in ["citadel", "core"] {
            let path = root
                .path()
                .join("game")
                .join(directory)
                .join("readonly_tools_asset_info.bin");
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            let mut cache = [0; 36];
            cache[..8].copy_from_slice(&[0xe9, 0xac, 0xcc, 0xc4, 13, 0, 0, 0]);
            std::fs::write(path, cache).unwrap();
        }
        assert!(check_model_metadata(root.path()).is_ok());
    }

    #[test]
    fn missing_modules_do_not_claim_compatibility() {
        let root = tempfile::tempdir().unwrap();
        let report = inspect_sdk(root.path()).unwrap();
        assert!(!report.compatible);
        assert!(report.checked_modules > 100);
        assert_eq!(report.differences.len(), report.checked_modules);
        assert!(
            report
                .differences
                .iter()
                .all(|item| item.actual_sha256.is_none())
        );
    }

    #[test]
    fn fingerprints_stream_the_complete_file() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("resource");
        let mut data = vec![7; 131073];
        std::fs::write(&path, &data).unwrap();
        assert_eq!(file_hash(&path).unwrap(), Some(crate::hash(&data)));
        data[131072] = 8;
        std::fs::write(&path, &data).unwrap();
        assert_eq!(file_hash(&path).unwrap(), Some(crate::hash(&data)));
    }

    #[test]
    fn cached_hashes_track_modification_replacement_and_deletion() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("module.dll");
        let mut cache = HashCache::default();
        std::fs::write(&path, b"original").unwrap();
        assert_eq!(cache.hash(&path).unwrap(), Some(crate::hash(b"original")));
        assert_eq!(cache.hash(&path).unwrap(), Some(crate::hash(b"original")));
        std::fs::write(&path, b"changed!").unwrap();
        let changed = SystemTime::now() + std::time::Duration::from_secs(2);
        File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(changed))
            .unwrap();
        assert_eq!(cache.hash(&path).unwrap(), Some(crate::hash(b"changed!")));
        std::fs::remove_file(&path).unwrap();
        assert_eq!(cache.hash(&path).unwrap(), None);
        std::fs::write(&path, b"replacement").unwrap();
        assert_eq!(
            cache.hash(&path).unwrap(),
            Some(crate::hash(b"replacement"))
        );
    }
}
