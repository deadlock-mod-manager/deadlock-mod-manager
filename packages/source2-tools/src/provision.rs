use std::path::Path;
use std::process::Command;

use crate::{ToolError, profile::bundled_profile};

pub struct RuntimeDepot {
    pub depot: u32,
    pub manifest: &'static str,
    pub files: Vec<String>,
}

pub fn runtime_depots() -> Result<Vec<RuntimeDepot>, ToolError> {
    let profile = bundled_profile()?;
    let mut editor = profile
        .modules
        .iter()
        .filter(|module| {
            module.source == "dota_tools_depot381450"
                || module.source == "derived_local_clock_patch"
        })
        .map(|module| module.source_path.clone())
        .collect::<Vec<_>>();
    editor.extend([
        "regex:^game/core/.*\\.fgd$".into(),
        "regex:^content/core/".into(),
    ]);
    editor.sort();
    editor.dedup();
    Ok(vec![
        RuntimeDepot {
            depot: 381450,
            manifest: "1295137367579611966",
            files: editor,
        },
        RuntimeDepot {
            depot: 373303,
            manifest: "4232727191139124077",
            files: vec!["game/bin/win64/meshsystem.dll".into()],
        },
    ])
}

pub fn runtime_available(root: &Path, depot: &RuntimeDepot) -> Result<bool, ToolError> {
    let profile = bundled_profile()?;
    let source = if depot.depot == 381450 {
        "dota_tools_depot381450"
    } else {
        "dota_mesh_current"
    };
    for module in profile.modules.iter().filter(|module| {
        module.source == source
            || (depot.depot == 381450 && module.source == "derived_local_clock_patch")
    }) {
        let path = root.join(&module.source_path);
        let expected = if module.source == "derived_local_clock_patch" {
            crate::EDITOR_SHA256
        } else {
            &module.sha256
        };
        let actual =
            crate::profile::file_hash(&path).map_err(|source| ToolError::Io { path, source })?;
        if actual.as_deref() != Some(expected) {
            return Ok(false);
        }
    }
    Ok(depot.depot != 381450
        || (root.join("game/core/base.fgd").is_file() && root.join("content/core").is_dir()))
}

pub fn depot_command(
    executable: &Path,
    depot: &RuntimeDepot,
    file_list: &Path,
    output: &Path,
) -> Command {
    let mut command = Command::new(executable);
    command
        .args([
            "-app",
            "570",
            "-depot",
            &depot.depot.to_string(),
            "-manifest",
            depot.manifest,
            "-loginid",
            "1745900137",
            "-validate",
            "-filelist",
        ])
        .arg(file_list)
        .arg("-dir")
        .arg(output);
    if depot.depot == 381450 {
        command.arg("-qr");
    }
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_plan_includes_unpatched_editors_and_only_the_required_runtime() {
        let depots = runtime_depots().unwrap();
        assert!(
            depots[0]
                .files
                .contains(&"game/bin/win64/tools/modeldoc_editor.dll".into())
        );
        assert!(
            depots[0]
                .files
                .contains(&"game/bin/win64/modeldoc_editor.dll".into())
        );
        assert_eq!(depots[1].files, ["game/bin/win64/meshsystem.dll"]);
        assert!(
            depots
                .iter()
                .all(|depot| !depot.files.iter().any(|path| path.contains("pak01")))
        );
    }
}
