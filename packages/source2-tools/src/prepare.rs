use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;

use crate::profile::{Module, bundled_profile};
use crate::{ToolError, hash, inspect_sdk, metadata, patch_modeldoc};

pub const WORKBENCH_ADDON: &str = "dmm_workbench";

#[derive(Debug, Deserialize)]
pub struct PrepareOptions {
    pub csdk: PathBuf,
    pub deadlock: PathBuf,
    pub dota_tools: PathBuf,
    pub dota_runtime: PathBuf,
    pub output: PathBuf,
}

fn io<T>(path: &Path, result: std::io::Result<T>) -> Result<T, ToolError> {
    result.map_err(|source| ToolError::Io {
        path: path.to_owned(),
        source,
    })
}

fn text(path: &Path) -> Result<String, ToolError> {
    io(path, fs::read_to_string(path))
}

fn write(path: &Path, contents: impl AsRef<[u8]>) -> Result<(), ToolError> {
    if let Some(parent) = path.parent() {
        io(parent, fs::create_dir_all(parent))?;
    }
    io(path, fs::write(path, contents))
}

fn source_for(options: &PrepareOptions, module: &Module) -> Result<PathBuf, ToolError> {
    let root = match module.source.as_str() {
        "original_reduced_csdk12" => &options.csdk,
        "installed_deadlock" => &options.deadlock,
        "dota_tools_depot381450" => &options.dota_tools,
        "dota_mesh_current" => &options.dota_runtime,
        "derived_local_clock_patch" => {
            return Ok(options
                .dota_tools
                .join("game/bin/win64/tools/modeldoc_editor.dll"));
        }
        value => {
            return Err(ToolError::InvalidInput(format!(
                "Unsupported profile source {value}"
            )));
        }
    };
    Ok(root.join(&module.source_path))
}

fn copy_tree(source: &Path, output: &Path) -> Result<(), ToolError> {
    io(output, fs::create_dir_all(output))?;
    for entry in io(source, fs::read_dir(source))? {
        let entry = io(source, entry)?;
        let path = entry.path();
        let kind = io(&path, entry.file_type())?;
        let target = output.join(entry.file_name());
        if kind.is_symlink() {
            return Err(ToolError::InvalidInput(format!(
                "Tool source contains a symlink: {}",
                path.display()
            )));
        }
        if kind.is_dir() {
            copy_tree(&path, &target)?;
        } else if kind.is_file() {
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if ["dll", "exe", "vpk", "log", "mdmp"].contains(&extension.as_str()) {
                continue;
            }
            io(&target, fs::copy(&path, &target))?;
        }
    }
    Ok(())
}

fn copy_optional(source: &Path, output: &Path) -> Result<(), ToolError> {
    if source.is_dir() {
        copy_tree(source, output)?;
    }
    Ok(())
}

fn copy_fgd(source: &Path, output: &Path) -> Result<(), ToolError> {
    io(output, fs::create_dir_all(output))?;
    for entry in io(source, fs::read_dir(source))? {
        let entry = io(source, entry)?;
        if entry.path().extension().and_then(|value| value.to_str()) == Some("fgd") {
            let target = output.join(entry.file_name());
            io(&target, fs::copy(entry.path(), &target))?;
        }
    }
    Ok(())
}

fn copy_base_archives(source: &Path, output: &Path) -> Result<(), ToolError> {
    io(output, fs::create_dir_all(output))?;
    for entry in io(source, fs::read_dir(source))? {
        let entry = io(source, entry)?;
        if entry.path().extension().and_then(|value| value.to_str()) == Some("vpk")
            && io(&entry.path(), entry.file_type())?.is_file()
        {
            let target = output.join(entry.file_name());
            io(&target, fs::copy(entry.path(), &target))?;
        }
    }
    Ok(())
}

fn populate(options: &PrepareOptions, staging: &Path, modules: &[Module]) -> Result<(), ToolError> {
    copy_tree(&options.csdk.join("game/bin"), &staging.join("game/bin"))?;
    copy_tree(
        &options.dota_tools.join("game/core"),
        &staging.join("game/core"),
    )?;
    for directory in ["tools", "resource"] {
        copy_optional(
            &options.csdk.join("game/core").join(directory),
            &staging.join("game/core").join(directory),
        )?;
    }
    copy_tree(
        &options.deadlock.join("game/core"),
        &staging.join("game/core"),
    )?;
    // AssetSystem needs paired game/content roots. External Game mounts are
    // scanned twice and fail directory watching; local copies also isolate
    // editor operations from the installed game's packed files.
    for directory in ["citadel", "core", "citadel/maps"] {
        let output = staging.join("game").join(directory);
        io(&output, fs::create_dir_all(&output))?;
        copy_base_archives(&options.deadlock.join("game").join(directory), &output)?;
    }
    copy_tree(
        &options.dota_tools.join("content/core"),
        &staging.join("content/core"),
    )?;
    copy_fgd(
        &options.dota_tools.join("game/core"),
        &staging.join("game/core"),
    )?;
    copy_fgd(
        &options.csdk.join("game/citadel"),
        &staging.join("game/citadel"),
    )?;
    for directory in ["bin", "tools"] {
        copy_optional(
            &options.csdk.join("game/citadel").join(directory),
            &staging.join("game/citadel").join(directory),
        )?;
    }
    let maps = options.csdk.join("content/citadel/maps/editor");
    for entry in io(&maps, fs::read_dir(&maps))? {
        let entry = io(&maps, entry)?;
        if entry.file_name().to_string_lossy().starts_with("toolscene")
            && io(&entry.path(), entry.file_type())?.is_file()
        {
            write(
                &staging
                    .join("content/citadel/maps/editor")
                    .join(entry.file_name()),
                crate::read(&entry.path())?,
            )?;
        }
    }
    for module in modules {
        let target = staging.join(&module.path);
        if let Some(parent) = target.parent() {
            io(parent, fs::create_dir_all(parent))?;
        }
        let source = source_for(options, module)?;
        if module.source == "derived_local_clock_patch" {
            patch_modeldoc(
                &source,
                &options.deadlock.join("game/bin/win64/animationsystem.dll"),
                &target,
            )?;
        } else {
            io(&target, fs::copy(source, &target))?;
        }
    }

    let citadel = staging.join("game/citadel");
    // An absent cache makes this AssetSystem enumerate shader VPK chunks as
    // directory indexes. A valid empty v13 cache lets it discover local assets
    // without importing another game's asset database.
    let empty_cache = [0xc4ccace9_u32, 13, 0, 0, 0, 0, 0, 0, 0x049a48b2]
        .into_iter()
        .flat_map(u32::to_le_bytes)
        .collect::<Vec<_>>();
    for directory in ["citadel", "core"] {
        write(
            &staging
                .join("game")
                .join(directory)
                .join("readonly_tools_asset_info.bin"),
            &empty_cache,
        )?;
    }
    let original_fgd = options.csdk.join("game/citadel/citadel.fgd");
    write(
        &citadel.join("citadel.fgd"),
        metadata::citadel_fgd(&text(&original_fgd)?)?,
    )?;
    let models = options.csdk.join("game/citadel/models_gamedata.fgd");
    write(
        &citadel.join("models_gamedata.fgd"),
        metadata::model_gamedata(&text(&models)?)?,
    )?;
    let lights = text(&options.csdk.join("game/core/lights_base.fgd"))?;
    let end = lights.find("@PointClass").ok_or_else(|| {
        ToolError::InvalidInput("Missing legacy CSDK light base definitions".into())
    })?;
    write(&citadel.join("csdk_light_bases.fgd"), &lights[..end])?;
    let common = staging.join("game/bin/assettypes_common.txt");
    let asset_types = metadata::add_choreo_type(&text(&common)?)?;
    write(&common, metadata::add_ag2_model_dependency(&asset_types)?)?;

    let base = options.deadlock.join("game");
    write(
        &citadel.join("gameinfo.gi"),
        metadata::gameinfo(&text(&base.join("citadel/gameinfo.gi"))?)?,
    )?;
    write(
        &citadel.join("tools/modeldoc_editor_presets.txt"),
        "<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:generic:version{7412167c-06e9-4698-aff2-e63eb59037e7} -->\n{ game_preview_maps = [ \"dl_hideout\" ] game_preview_entities = [ \"prop_dynamic\" ] available_weapons = [] }\n",
    )?;
    write(
        &staging.join("game/citadel_addons/dmm_workbench/tools/modeldoc_editor_presets.txt"),
        crate::read(&citadel.join("tools/modeldoc_editor_presets.txt"))?,
    )?;
    for part in ["game", "content"] {
        let addon = staging
            .join(part)
            .join("citadel_addons")
            .join(WORKBENCH_ADDON);
        io(&addon, fs::create_dir_all(&addon))?;
    }
    write(
        &staging.join("game/citadel_addons/dmm_workbench/addoninfo.txt"),
        "\"AddonInfo\"\n{\n \"IsTemplate\" \"0\"\n \"IsPlayable\" \"0\"\n}\n",
    )?;
    write(
        &staging.join("game/citadel_addons/dmm_workbench/toolscenelightrigs.vdata_c"),
        include_bytes!("../assets/toolscenelightrigs.vdata_c"),
    )?;
    write(
        &staging.join("content/citadel_addons/dmm_workbench/toolscenelightrigs.vdata"),
        include_bytes!("../assets/toolscenelightrigs.vdata"),
    )?;
    Ok(())
}

pub fn prepare_sdk(options: &PrepareOptions) -> Result<crate::SdkInspection, ToolError> {
    if options.output.exists() {
        return Err(ToolError::InvalidInput(
            "SDK output already exists; choose a new directory".into(),
        ));
    }
    let parent = options
        .output
        .parent()
        .ok_or_else(|| ToolError::InvalidInput("SDK output needs a parent directory".into()))?;
    let parent = io(parent, parent.canonicalize())?;
    let name = options
        .output
        .file_name()
        .ok_or_else(|| ToolError::InvalidInput("SDK output needs a directory name".into()))?;
    let destination = parent.join(name);
    for input in [
        &options.csdk,
        &options.deadlock,
        &options.dota_tools,
        &options.dota_runtime,
    ] {
        let input = io(input, input.canonicalize())?;
        if destination.starts_with(input) {
            return Err(ToolError::InvalidInput(
                "SDK output must be outside the input tool installations".into(),
            ));
        }
    }
    let profile = bundled_profile()?;
    for module in &profile.modules {
        let source = source_for(options, module)?;
        let expected = if module.source == "derived_local_clock_patch" {
            crate::EDITOR_SHA256
        } else {
            &module.sha256
        };
        let actual = hash(&crate::read(&source)?);
        let supported = if module.source == "derived_local_clock_patch" {
            actual == expected
        } else {
            module.accepts_hash(&actual)
        };
        if !supported {
            return Err(ToolError::InvalidInput(format!(
                "Unsupported source {}: expected {expected}, got {actual}",
                source.display()
            )));
        }
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| ToolError::InvalidInput(error.to_string()))?
        .as_nanos();
    let staging = parent.join(format!(".dmm-sdk-prepare-{}-{stamp}", std::process::id()));
    io(&staging, fs::create_dir(&staging))?;
    let result = populate(options, &staging, &profile.modules).and_then(|()| {
        let inspection = inspect_sdk(&staging)?;
        if !inspection.compatible {
            return Err(ToolError::InvalidInput(
                "Prepared SDK failed its module fingerprint check".into(),
            ));
        }
        if destination.exists() {
            return Err(ToolError::InvalidInput(
                "SDK output appeared during preparation".into(),
            ));
        }
        io(&destination, fs::rename(&staging, &destination))?;
        Ok(inspection)
    });
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copies_base_archives_without_user_addons() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("game");
        let output = root.path().join("sdk");
        fs::create_dir_all(source.join("addons")).unwrap();
        fs::create_dir_all(source.join("maps/workshop")).unwrap();
        fs::write(source.join("pak01_dir.vpk"), b"base index").unwrap();
        fs::write(source.join("pak01_000.vpk"), b"base data").unwrap();
        fs::write(source.join("addons/user.vpk"), b"user mod").unwrap();
        fs::write(source.join("gameinfo.gi"), b"user search paths").unwrap();
        fs::write(source.join("maps/dl_hideout.vpk"), b"preview map").unwrap();
        fs::write(source.join("maps/workshop/user.vpk"), b"user map").unwrap();

        copy_base_archives(&source, &output).unwrap();
        copy_base_archives(&source.join("maps"), &output.join("maps")).unwrap();

        assert_eq!(
            fs::read(output.join("pak01_dir.vpk")).unwrap(),
            b"base index"
        );
        assert_eq!(
            fs::read(output.join("pak01_000.vpk")).unwrap(),
            b"base data"
        );
        assert!(!output.join("addons").exists());
        assert!(!output.join("gameinfo.gi").exists());
        assert_eq!(
            fs::read(output.join("maps/dl_hideout.vpk")).unwrap(),
            b"preview map"
        );
        assert!(!output.join("maps/workshop").exists());
        fs::write(output.join("pak01_dir.vpk"), b"editor changes").unwrap();
        assert_eq!(
            fs::read(source.join("pak01_dir.vpk")).unwrap(),
            b"base index"
        );
    }

    #[test]
    fn refuses_existing_output_without_changing_it() {
        let root = tempfile::tempdir().unwrap();
        let output = root.path().join("sdk");
        fs::create_dir(&output).unwrap();
        fs::write(output.join("keep"), b"user data").unwrap();
        let options = PrepareOptions {
            csdk: root.path().into(),
            deadlock: root.path().into(),
            dota_tools: root.path().into(),
            dota_runtime: root.path().into(),
            output: output.clone(),
        };
        assert!(prepare_sdk(&options).is_err());
        assert_eq!(fs::read(output.join("keep")).unwrap(), b"user data");
    }
}
