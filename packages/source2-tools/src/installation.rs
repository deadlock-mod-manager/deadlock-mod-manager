use std::fs;
use std::io::Write;
use std::path::Path;

use serde::Serialize;

use crate::{ToolError, WORKBENCH_ADDON};

const REQUIRED_FILES: &[&str] = &[
    "game/bin/win64/deadlock.exe",
    "game/bin/win64/resourcecompiler.exe",
    "game/bin/win64/animationsystem.dll",
    "game/bin/win64/meshsystem.dll",
    "game/bin/win64/tools/modeldoc_editor.dll",
    "game/bin/assettypes_common.txt",
    "game/citadel/gameinfo.gi",
    "game/citadel/bin/win64/client.dll",
];

#[derive(Debug, Serialize)]
pub struct InstallationInspection {
    pub compatible: bool,
    pub prepared: bool,
    pub checked_files: usize,
    pub missing_files: Vec<String>,
}

/// Checks the shared SDK layout, without pinning an engine release or claiming runtime parity.
pub fn inspect_installation(root: &Path) -> InstallationInspection {
    let mut missing_files = REQUIRED_FILES
        .iter()
        .filter(|path| !root.join(path).is_file())
        .map(|path| (*path).to_owned())
        .collect::<Vec<_>>();
    if !root.join("content/citadel").is_dir() {
        missing_files.push("content/citadel/".into());
    }
    InstallationInspection {
        compatible: missing_files.is_empty(),
        prepared: missing_files.is_empty()
            && root.join("game/citadel/pak01_dir.vpk").is_file()
            && root
                .join("game/citadel_addons")
                .join(WORKBENCH_ADDON)
                .join("addoninfo.txt")
                .is_file(),
        checked_files: REQUIRED_FILES.len() + 1,
        missing_files,
    }
}

pub(crate) fn require_installation(root: &Path) -> Result<InstallationInspection, ToolError> {
    let report = inspect_installation(root);
    if !report.compatible {
        return Err(ToolError::InvalidInput(format!(
            "Select an extracted CSDK installation. Required paths are missing: {}",
            report.missing_files.join(", ")
        )));
    }
    Ok(report)
}

fn io<T>(path: &Path, result: std::io::Result<T>) -> Result<T, ToolError> {
    result.map_err(|source| ToolError::Io {
        path: path.to_owned(),
        source,
    })
}

fn local_destination(root: &Path, destination: &Path) -> Result<(), ToolError> {
    let relative = destination.strip_prefix(root).map_err(|_| {
        ToolError::InvalidInput("SDK data destination is outside the installation".into())
    })?;
    let mut path = root.to_path_buf();
    for component in relative.components() {
        path.push(component);
        match path.symlink_metadata() {
            Ok(metadata) if metadata.is_symlink() => {
                return Err(ToolError::InvalidInput(format!(
                    "SDK data destination contains a symbolic link: {}",
                    path.display()
                )));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(source) => return Err(ToolError::Io { path, source }),
        }
    }
    Ok(())
}

fn copy_data_file(root: &Path, source: &Path, destination: &Path) -> Result<(), ToolError> {
    local_destination(root, destination)?;
    let metadata = io(source, fs::metadata(source))?;
    if let Ok(existing) = fs::metadata(destination)
        && existing.len() == metadata.len()
        && existing.modified().ok() == metadata.modified().ok()
    {
        return Ok(());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| ToolError::InvalidInput("Missing SDK data directory".into()))?;
    io(parent, fs::create_dir_all(parent))?;
    let mut staged = io(parent, tempfile::NamedTempFile::new_in(parent))?;
    io(source, fs::copy(source, staged.path()))?;
    io(destination, staged.flush())?;
    if let Ok(modified) = metadata.modified() {
        io(destination, staged.as_file().set_modified(modified))?;
    }
    io(destination, staged.as_file().sync_all())?;
    io(
        destination,
        staged.persist(destination).map_err(|error| error.error),
    )?;
    Ok(())
}

fn copy_data_tree(root: &Path, source: &Path, destination: &Path) -> Result<(), ToolError> {
    if !source.is_dir() {
        return Ok(());
    }
    for entry in io(source, fs::read_dir(source))? {
        let entry = io(source, entry)?;
        let path = entry.path();
        let kind = io(&path, entry.file_type())?;
        let target = destination.join(entry.file_name());
        if kind.is_dir() {
            copy_data_tree(root, &path, &target)?;
        } else if kind.is_file() {
            copy_data_file(root, &path, &target)?;
        }
    }
    Ok(())
}

/// Uses the vendor's binaries unchanged. Only game data and the default addon are prepared.
pub fn prepare_installation(
    root: &Path,
    deadlock: &Path,
) -> Result<InstallationInspection, ToolError> {
    require_installation(root)?;
    let root = io(root, root.canonicalize())?;
    let deadlock = io(deadlock, deadlock.canonicalize())?;
    if root.starts_with(&deadlock) || deadlock.starts_with(&root) {
        return Err(ToolError::InvalidInput(
            "The CSDK installation must be separate from the installed game".into(),
        ));
    }
    let source = deadlock.join("game/citadel");
    if !source.join("pak01_dir.vpk").is_file() {
        return Err(ToolError::InvalidInput(
            "The installed Deadlock archive was not found".into(),
        ));
    }
    let target = root.join("game/citadel");
    for entry in io(&source, fs::read_dir(&source))? {
        let entry = io(&source, entry)?;
        let path = entry.path();
        if io(&path, entry.file_type())?.is_file()
            && path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("vpk"))
            && !entry
                .file_name()
                .to_string_lossy()
                .to_ascii_lowercase()
                .contains("shader")
        {
            copy_data_file(&root, &path, &target.join(entry.file_name()))?;
        }
    }
    for directory in ["cfg", "maps", "panorama", "resource"] {
        copy_data_tree(&root, &source.join(directory), &target.join(directory))?;
    }
    // This is the vendor-documented asset index switch for mounting the full game data.
    let disabled = target.join("readonly_tools_asset_info.binOFF");
    let enabled = target.join("readonly_tools_asset_info.bin");
    if disabled.is_file() && !enabled.exists() {
        copy_data_file(&root, &disabled, &enabled)?;
    }
    for tree in ["content", "game"] {
        let addon = root.join(tree).join("citadel_addons").join(WORKBENCH_ADDON);
        local_destination(&root, &addon)?;
        io(&addon, fs::create_dir_all(&addon))?;
    }
    let info = root
        .join("game/citadel_addons")
        .join(WORKBENCH_ADDON)
        .join("addoninfo.txt");
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&info)
    {
        Ok(mut file) => io(
            &info,
            file.write_all(b"\"AddonInfo\" { \"IsTemplate\" \"0\" \"IsPlayable\" \"0\" }\n"),
        )?,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(source) => return Err(ToolError::Io { path: info, source }),
    }
    Ok(inspect_installation(&root))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn installation(root: &Path) {
        for path in REQUIRED_FILES {
            let path = root.join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, b"vendor binary or metadata").unwrap();
        }
        fs::create_dir_all(root.join("content/citadel")).unwrap();
    }

    #[test]
    fn accepts_changed_vendor_binaries_and_reports_missing_capabilities() {
        let sdk = tempfile::tempdir().unwrap();
        installation(sdk.path());
        assert!(inspect_installation(sdk.path()).compatible);
        fs::write(sdk.path().join(REQUIRED_FILES[2]), b"future engine version").unwrap();
        assert!(inspect_installation(sdk.path()).compatible);
        fs::remove_file(sdk.path().join(REQUIRED_FILES[1])).unwrap();
        assert_eq!(
            inspect_installation(sdk.path()).missing_files,
            [REQUIRED_FILES[1]]
        );
    }

    #[test]
    fn copies_only_game_data_and_preserves_binaries_addons_and_the_game() {
        let temp = tempfile::tempdir().unwrap();
        let sdk = temp.path().join("sdk");
        installation(&sdk);
        let game = temp.path().join("Deadlock");
        let source = game.join("game/citadel");
        fs::create_dir_all(source.join("resource")).unwrap();
        for (name, data) in [
            ("pak01_dir.vpk", b"game data".as_slice()),
            ("shaders_pc_dir.vpk", b"shader data"),
            ("resource/items.txt", b"items"),
        ] {
            fs::write(source.join(name), data).unwrap();
        }
        fs::write(
            sdk.join("game/citadel/readonly_tools_asset_info.binOFF"),
            b"index",
        )
        .unwrap();
        prepare_installation(&sdk, &game).unwrap();
        assert_eq!(
            fs::read(sdk.join("game/citadel/pak01_dir.vpk")).unwrap(),
            b"game data"
        );
        assert!(!sdk.join("game/citadel/shaders_pc_dir.vpk").exists());
        assert_eq!(
            fs::read(sdk.join(REQUIRED_FILES[0])).unwrap(),
            b"vendor binary or metadata"
        );
        assert_eq!(
            fs::read(sdk.join("game/citadel/readonly_tools_asset_info.bin")).unwrap(),
            b"index"
        );
        let info = sdk.join("game/citadel_addons/dmm_workbench/addoninfo.txt");
        fs::write(&info, b"user addon info").unwrap();
        fs::write(sdk.join("game/citadel/pak01_dir.vpk"), b"sdk edit").unwrap();
        assert_eq!(
            fs::read(source.join("pak01_dir.vpk")).unwrap(),
            b"game data"
        );
        prepare_installation(&sdk, &game).unwrap();
        assert_eq!(fs::read(info).unwrap(), b"user addon info");
        assert!(prepare_installation(&sdk, &sdk).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_data_destination_links_into_the_installed_game() {
        let temp = tempfile::tempdir().unwrap();
        let sdk = temp.path().join("sdk");
        installation(&sdk);
        let game = temp.path().join("Deadlock");
        let source = game.join("game/citadel");
        fs::create_dir_all(source.join("resource")).unwrap();
        fs::write(source.join("pak01_dir.vpk"), b"game data").unwrap();
        fs::write(source.join("resource/items.txt"), b"original items").unwrap();
        std::os::unix::fs::symlink(source.join("resource"), sdk.join("game/citadel/resource"))
            .unwrap();
        assert!(
            prepare_installation(&sdk, &game)
                .unwrap_err()
                .to_string()
                .contains("symbolic link")
        );
        assert_eq!(
            fs::read(source.join("resource/items.txt")).unwrap(),
            b"original items"
        );
    }
}
