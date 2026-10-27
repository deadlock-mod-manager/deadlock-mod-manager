use std::path::{Path, PathBuf};
use std::process::Command;

use crate::{ToolError, WORKBENCH_ADDON, inspect_sdk};

pub struct ProtonRuntime {
    pub launcher: PathBuf,
    pub steam_root: PathBuf,
    pub prefix: PathBuf,
}

pub enum SdkTool {
    ModelDoc,
    AssetBrowser,
}

fn executable_command(
    executable: &Path,
    proton: Option<&ProtonRuntime>,
) -> Result<Command, ToolError> {
    executable_command_with_mode(executable, proton, "run")
}

fn executable_command_with_mode(
    executable: &Path,
    proton: Option<&ProtonRuntime>,
    mode: &str,
) -> Result<Command, ToolError> {
    if !executable.is_file() {
        return Err(ToolError::InvalidInput(format!(
            "Tool executable not found: {}",
            executable.display()
        )));
    }
    let is_windows = executable
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"));
    if cfg!(windows) || !is_windows {
        return Ok(Command::new(executable));
    }
    let proton = proton.ok_or_else(|| {
        ToolError::InvalidInput("A Proton launcher is required for Windows tools on Linux".into())
    })?;
    if !proton.launcher.is_file() || !proton.steam_root.is_dir() {
        return Err(ToolError::InvalidInput(
            "Select an installed Proton launcher and a valid Steam directory".into(),
        ));
    }
    let mut command = Command::new(&proton.launcher);
    command
        .arg(mode)
        .arg(executable)
        .env("STEAM_COMPAT_CLIENT_INSTALL_PATH", &proton.steam_root)
        .env("STEAM_COMPAT_DATA_PATH", &proton.prefix);
    Ok(command)
}

pub fn sdk_command(
    sdk: &Path,
    tool: SdkTool,
    proton: Option<&ProtonRuntime>,
) -> Result<Command, ToolError> {
    sdk_project_command(sdk, tool, WORKBENCH_ADDON, proton)
}

pub fn sdk_project_command(
    sdk: &Path,
    tool: SdkTool,
    addon: &str,
    proton: Option<&ProtonRuntime>,
) -> Result<Command, ToolError> {
    if addon.is_empty()
        || !addon
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(ToolError::InvalidInput("Invalid addon name".into()));
    }
    let inspection = inspect_sdk(sdk)?;
    if !inspection.compatible {
        return Err(ToolError::InvalidInput(format!(
            "The SDK differs from compatibility profile {} in {} modules; prepare a compatible SDK before launching",
            inspection.profile,
            inspection.differences.len()
        )));
    }
    let bin = sdk.join("game/bin/win64");
    let mut command = executable_command(&bin.join("deadlock.exe"), proton)?;
    command
        .current_dir(bin)
        .env("SteamAppId", "1422450")
        .env("SteamGameId", "1422450")
        .env("VPROJECT", "1")
        .args([
            "-tools",
            "-dx11",
            "-multiple_tools_instances",
            "-allowmultiple",
            "-insecure",
            "-condebug",
            "-danger_mode_ignore_schema_mismatches",
            "-addon",
            addon,
        ]);
    if matches!(tool, SdkTool::ModelDoc) {
        command.args(["-tool", "modeldoc_editor"]);
    }
    Ok(command)
}

pub fn compiler_command(
    sdk: &Path,
    addon: &str,
    file_list: &Path,
    proton: Option<&ProtonRuntime>,
) -> Result<Command, ToolError> {
    // The same profile and addon validation applies to the compiler and GUI.
    sdk_project_command(sdk, SdkTool::AssetBrowser, addon, proton)?;
    let mut command = executable_command_with_mode(
        &sdk.join("game/bin/win64/resourcecompiler.exe"),
        proton,
        "runinprefix",
    )?;
    let path_arg = |path: PathBuf| -> Result<String, ToolError> {
        let text = path
            .to_str()
            .ok_or_else(|| ToolError::InvalidInput("The SDK path must be valid UTF-8".into()))?;
        Ok(if cfg!(windows) {
            text.to_owned()
        } else {
            format!("Z:{}", text.replace('/', "\\"))
        })
    };
    command
        .current_dir(sdk.join("content/citadel"))
        .env("VPROJECT", path_arg(sdk.join("game/citadel"))?)
        .env("SteamAppId", "1422450")
        .env("SteamGameId", "1422450")
        .arg("-game")
        .arg(path_arg(sdk.join("game/citadel"))?)
        .args([
            "-consoleapp",
            "-noassert",
            "-consolelog",
            "-danger_mode_ignore_schema_mismatches",
        ])
        .arg(if cfg!(windows) { "-dx11" } else { "-vulkan" })
        .args(["-addon", addon, "-nop4", "-fshallow", "-filelist"])
        .arg(path_arg(file_list.to_path_buf())?);
    Ok(command)
}

pub fn viewer_command(
    executable: &Path,
    input: Option<&Path>,
    proton: Option<&ProtonRuntime>,
) -> Result<Command, ToolError> {
    let mut command = executable_command(executable, proton)?;
    if let Some(parent) = executable.parent() {
        command.current_dir(parent);
    }
    if let Some(input) = input {
        let input = input.canonicalize().map_err(|source| ToolError::Io {
            path: input.to_owned(),
            source,
        })?;
        if !cfg!(windows)
            && executable
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
        {
            let path = input.to_str().ok_or_else(|| {
                ToolError::InvalidInput("The asset path must be valid UTF-8 for Wine".into())
            })?;
            command.arg(format!("Z:{}", path.replace('/', "\\")));
        } else {
            command.arg(input);
        }
    }
    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_an_unprepared_sdk_before_launching() {
        let root = tempfile::tempdir().unwrap();
        assert!(sdk_command(root.path(), SdkTool::ModelDoc, None).is_err());
    }

    #[test]
    fn viewer_path_with_shell_characters_is_a_single_program() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("viewer $(do-not-run); spaced");
        std::fs::write(&path, b"fixture").unwrap();
        let command = viewer_command(&path, None, None).unwrap();
        assert_eq!(command.get_program(), path.as_os_str());
        assert_eq!(command.get_args().count(), 0);
    }

    #[cfg(not(windows))]
    #[test]
    fn windows_viewer_uses_the_selected_proton_without_a_shell() {
        let root = tempfile::tempdir().unwrap();
        let viewer = root.path().join("Source 2 Viewer.exe");
        let launcher = root.path().join("proton");
        std::fs::write(&viewer, b"fixture").unwrap();
        std::fs::write(&launcher, b"fixture").unwrap();
        assert!(viewer_command(&viewer, None, None).is_err());
        let runtime = ProtonRuntime {
            launcher,
            steam_root: root.path().into(),
            prefix: root.path().join("private-prefix"),
        };
        let command = viewer_command(&viewer, None, Some(&runtime)).unwrap();
        assert_eq!(command.get_program(), runtime.launcher.as_os_str());
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            ["run".as_ref(), viewer.as_os_str()]
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn converts_asset_paths_for_the_windows_viewer_under_proton() {
        let root = tempfile::tempdir().unwrap();
        let viewer = root.path().join("Source2Viewer.exe");
        let launcher = root.path().join("proton");
        let input = root.path().join("game assets; literal.vpk");
        for path in [&viewer, &launcher, &input] {
            std::fs::write(path, b"fixture").unwrap();
        }
        let runtime = ProtonRuntime {
            launcher,
            steam_root: root.path().into(),
            prefix: root.path().join("prefix"),
        };
        let command = viewer_command(&viewer, Some(&input), Some(&runtime)).unwrap();
        let arguments = command.get_args().collect::<Vec<_>>();
        assert_eq!(arguments.len(), 3);
        let expected = format!(
            "Z:{}",
            input
                .canonicalize()
                .unwrap()
                .to_str()
                .unwrap()
                .replace('/', "\\")
        );
        assert_eq!(arguments[2], std::ffi::OsStr::new(&expected));
        assert!(
            viewer_command(
                &viewer,
                Some(&root.path().join("missing.vpk")),
                Some(&runtime)
            )
            .is_err()
        );
    }
}
