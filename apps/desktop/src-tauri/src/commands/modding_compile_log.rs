pub(super) fn failed(compilation: &str) -> bool {
  if compilation.lines().any(|line| {
    line.contains("RESOURCE COMPILE ERROR:")
      || line.contains("Failed to compile")
      || line.trim() == "[FAIL]"
  }) {
    return true;
  }
  let summary = compilation.lines().rev().find_map(|line| {
    let line = line.trim();
    if !["OK:", "WARNING:", "ERROR:"]
      .iter()
      .any(|prefix| line.starts_with(prefix))
    {
      return None;
    }
    let (_, counts) = line.split_once(" compiled, ")?;
    let (failures, _) = counts.split_once(" failed,")?;
    failures.trim().parse::<usize>().ok()
  });
  summary.map_or_else(
    || compilation.lines().any(|line| line.contains("ERROR:")),
    |failures| failures > 0,
  )
}

pub(super) fn failure_details(compilation: &str) -> String {
  let mut current_asset = "";
  let mut reported = std::collections::HashSet::new();
  let mut errors = Vec::new();
  let mut context = std::collections::VecDeque::new();
  for line in compilation.lines().map(str::trim) {
    if let Some(asset) = line.strip_prefix("- ") {
      current_asset = asset;
      context.clear();
      continue;
    }
    if line.starts_with("Look for ") || line.contains(" compiled,") {
      continue;
    }
    if line == "[FAIL]" {
      if errors.len() < 12 && reported.insert(current_asset.to_owned()) {
        let message = context.iter().copied().collect::<Vec<_>>().join(" ");
        let message = message.chars().take(600).collect::<String>();
        errors.push(format!("{current_asset}: {message}"));
      }
      continue;
    }
    if !line.is_empty() {
      if context.len() == 3 {
        context.pop_front();
      }
      context.push_back(line);
    }
    let diagnostic = line.split_once("RESOURCE COMPILE ERROR:");
    let Some((location, message)) = diagnostic else {
      continue;
    };
    let asset = if location.trim().is_empty() {
      current_asset
    } else {
      location.trim().trim_end_matches(':')
    };
    if errors.len() < 12 && reported.insert(asset.to_owned()) {
      let message = message.trim().chars().take(600).collect::<String>();
      errors.push(if asset.is_empty() {
        message
      } else {
        format!("{asset}: {message}")
      });
    }
  }
  if !errors.is_empty() {
    return errors.join("\n");
  }
  compilation
    .lines()
    .filter(|line| {
      let line = line.to_ascii_lowercase();
      line.contains("error") || line.contains("failed")
    })
    .take(12)
    .collect::<Vec<_>>()
    .join("\n")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn actual_model_errors_take_priority_over_editor_startup_resources() {
    let mut log = "Failed loading resource materials/tools/handle.vmat_c\n".repeat(15);
    log.push_str("- models/familiar/old.vmdl\nRESOURCE COMPILE ERROR: AnimFile: idle : Sanitize Bone Names failed, results in duplicate bone '_cloth_m0p4' in this animation\n");
    log.push_str("- models/familiar/soul_container.vmdl\nRESOURCE COMPILE ERROR: LoadDMXModel: DMX file does not exist\n");
    log.push_str("- models/familiar/helper.vmdl\nERROR: Specified path D:\\RawMaterials\\frog.vmat could not be made content-relative\n");
    log.push_str("ERROR: 328 compiled, 15 failed, 59 skipped, 3m:13s\n");
    let details = failure_details(&log);
    assert!(details.contains("Sanitize Bone Names"), "{details}");
    assert!(details.contains("DMX file does not exist"), "{details}");
    assert!(!details.contains("content-relative"), "{details}");
    assert!(details.contains("models/familiar/old.vmdl"), "{details}");
    assert!(!details.contains("materials/tools/handle.vmat_c"));
  }

  #[test]
  fn repeated_bone_errors_do_not_hide_other_failed_files() {
    let mut log = String::from("- models/familiar/old.vmdl\n");
    for bone in 0..1080 {
      log.push_str(&format!("RESOURCE COMPILE ERROR: Sanitize Bone Names failed, results in duplicate bone '_cloth_m0p{bone}'\n"));
    }
    log.push_str("- models/other.vmdl\nRESOURCE COMPILE ERROR: Load error: models/missing.dmx\n");
    let details = failure_details(&log);
    assert!(details.contains("models/missing.dmx"), "{details}");
    assert_eq!(details.matches("Sanitize Bone Names").count(), 1);
    assert!(details.len() < 4096);
  }

  #[test]
  fn startup_failures_still_have_diagnostics_without_resource_compile_errors() {
    let details = failure_details("Compiler starting\nFailed to load compiler plugin\n");
    assert!(details.contains("Failed to load compiler plugin"));
  }

  #[test]
  fn importer_errors_do_not_override_successful_compiler_summary() {
    let log = "ERROR: Specified path D:\\artist.vmat could not be made content-relative\nWARNING: 1 compiled, 0 failed, 0 skipped, 0m:02s\n";
    assert!(!failed(log));
    assert!(failed("ERROR: 53 compiled, 1 failed, 0 skipped, 0m:03s\n"));
    assert!(failed("ERROR: Could not initialize compiler\n"));
    assert!(failed(
      "No valid vcs file found for shader pbr.vfx\n[FAIL]\n"
    ));
    assert!(failed(
      "RESOURCE COMPILE ERROR: Missing mesh\nOK: 1 compiled, 0 failed, 0 skipped, 0m:01s\n"
    ));
  }

  #[test]
  fn material_failures_show_shader_errors_instead_of_unrelated_fbx_warnings() {
    let log = "- models/materials/head.vmat\nNo valid vcs file found for shader csgo_environment.vfx\nLoadVfxAndFeatureCombo(1465): Error opening shader csgo_environment.vfx\nCResourceCompilerMaterial::CompileResourceInternal(1612): Feature combo not found\n [FAIL]\n- models/artist.vmdl\nERROR: Specified path D:\\head.vmat could not be made content-relative\nERROR: 1 compiled, 1 failed, 0 skipped, 0m:02s\n";
    let details = failure_details(log);
    assert!(details.contains("models/materials/head.vmat"), "{details}");
    assert!(details.contains("csgo_environment.vfx"), "{details}");
    assert!(!details.contains("D:\\head.vmat"), "{details}");
    assert!(failed(log));
  }
}
