use super::{LocalizationModInput, normalize_path, resources::ResourceSnapshot};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedResource {
  pub file_path: String,
  pub mod_ids: Vec<String>,
}

pub(super) struct RepairScope {
  enabled_mod_ids: BTreeSet<String>,
  protected: BTreeMap<String, BTreeSet<String>>,
}

impl RepairScope {
  pub(super) fn new(
    mods: &[LocalizationModInput],
    enabled_mod_ids: &BTreeSet<String>,
    resources: &ResourceSnapshot,
  ) -> Self {
    let mut protected: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for input in mods
      .iter()
      .filter(|input| !enabled_mod_ids.contains(&input.mod_id))
    {
      for archive in &input.vpks {
        for path in resources.archive(archive).list_entries() {
          protected
            .entry(normalize_path(&path))
            .or_default()
            .insert(input.mod_id.clone());
        }
      }
    }
    Self {
      enabled_mod_ids: enabled_mod_ids.clone(),
      protected,
    }
  }

  pub(super) fn includes_mod(&self, mod_id: &str) -> bool {
    self.enabled_mod_ids.contains(mod_id)
  }

  pub(super) fn protects(&self, path: &str) -> bool {
    self.protected.contains_key(&normalize_path(path))
  }

  pub(super) fn shared_resources(
    &self,
    mods: &[LocalizationModInput],
    resources: &ResourceSnapshot,
  ) -> Vec<ProtectedResource> {
    let mut shared = BTreeSet::new();
    for input in mods.iter().filter(|input| self.includes_mod(&input.mod_id)) {
      for archive in &input.vpks {
        for path in resources.archive(archive).list_entries() {
          let path = normalize_path(&path);
          if self.protects(&path)
            && (super::reads_compiled_baseline(&path)
              || super::is_localization_path(&path)
              || path.ends_with(".vmesh_c"))
          {
            shared.insert(path);
          }
        }
      }
    }
    shared
      .into_iter()
      .map(|file_path| ProtectedResource {
        mod_ids: self.protected[&file_path].iter().cloned().collect(),
        file_path,
      })
      .collect()
  }
}

#[cfg(test)]
mod tests {
  use super::super::{LocalizationOverlayPlan, resources::tests::pack};
  use super::*;
  use source2_model::vpk_extract::VpkArchive;

  const PATH: &str = "resource/localization/example_english.txt";
  const BASE: &[u8] = b"\"lang\" { \"Language\" \"English\" \"Tokens\" { \"X\" \"Vanilla\" } }";
  const MOD: &[u8] = b"\"lang\" { \"Language\" \"English\" \"Tokens\" { \"X\" \"Authored\" } }";

  #[test]
  fn opted_out_assets_have_no_repair_findings_and_export_rejects_protected_outputs() {
    let temp = tempfile::tempdir().unwrap();
    let path = "models/custom.vmdl_c";
    let original = LocalizationModInput {
      mod_id: "original".into(),
      vpks: vec![pack(
        temp.path(),
        "original",
        &[
          (path, b"invalid model"),
          ("materials/custom.vmat_c", b"invalid material"),
          ("models/custom.vnmskel_c", b"invalid skeleton"),
          ("scripts/custom.vdata_c", b"invalid data"),
        ],
      )],
    };
    let mut plan =
      LocalizationOverlayPlan::build_selected(temp.path(), &[original], &BTreeSet::new()).unwrap();
    assert!(plan.analysis.parse_warnings.is_empty());
    assert!(plan.analysis.asset_warnings.is_empty());
    assert!(plan.analysis.data_warnings.is_empty());
    // The export boundary must catch a future adapter that forgets to honor scope.
    plan
      .camera_models
      .insert(path.into(), b"accidental replacement".to_vec());
    let output = temp.path().join("overlay.vpk");
    std::fs::write(&output, b"existing output").unwrap();
    assert!(
      plan
        .write(&output, &[])
        .unwrap_err()
        .to_string()
        .contains("Compatibility is disabled")
    );
    assert_eq!(std::fs::read(output).unwrap(), b"existing output");
  }

  #[test]
  fn per_mod_selection_preserves_shared_files_in_both_load_orders() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    std::fs::create_dir_all(&citadel).unwrap();
    pack(&citadel, "pak01", &[(PATH, BASE)]);
    let selected = LocalizationModInput {
      mod_id: "selected".into(),
      vpks: vec![pack(temp.path(), "selected", &[(PATH, MOD)])],
    };
    // No parsing or automatic findings should run for an opted-out resource.
    let original = LocalizationModInput {
      mod_id: "original".into(),
      vpks: vec![pack(temp.path(), "original", &[(PATH, b"not parseable")])],
    };
    for inputs in [
      vec![selected.clone(), original.clone()],
      vec![original.clone(), selected.clone()],
    ] {
      let plan = LocalizationOverlayPlan::build_selected(
        &citadel,
        &inputs,
        &BTreeSet::from(["selected".into()]),
      )
      .unwrap();
      assert_eq!(plan.analysis.compatibility_mod_ids, ["selected"]);
      assert_eq!(plan.analysis.excluded_mod_ids, ["original"]);
      assert_eq!(plan.analysis.protected_resources[0].file_path, PATH);
      assert_eq!(plan.analysis.protected_resources[0].mod_ids, ["original"]);
      assert!(plan.analysis.parse_warnings.is_empty());
      assert!(
        !plan
          .write(&temp.path().join("overlay.vpk"), &[])
          .unwrap()
          .has_overlay
      );
    }
  }

  #[test]
  fn unrelated_mods_do_not_change_selected_output_at_large_library_sizes() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    std::fs::create_dir_all(&citadel).unwrap();
    pack(&citadel, "pak01", &[(PATH, BASE)]);
    let selected = LocalizationModInput {
      mod_id: "selected".into(),
      vpks: vec![pack(temp.path(), "selected", &[(PATH, MOD)])],
    };
    let enabled = BTreeSet::from(["selected".into()]);
    for count in [1, 8, 32, 64] {
      let mut inputs = vec![selected.clone()];
      for index in 0..count {
        let id = format!("original_{index}");
        let path = format!("scripts/custom_{index}.vdata_c");
        inputs.push(LocalizationModInput {
          mod_id: id.clone(),
          vpks: vec![pack(temp.path(), &id, &[(&path, b"not parseable")])],
        });
      }
      for reverse in [false, true] {
        if reverse {
          inputs.reverse();
        }
        let plan = LocalizationOverlayPlan::build_selected(&citadel, &inputs, &enabled).unwrap();
        assert!(plan.analysis.protected_resources.is_empty());
        assert!(plan.analysis.asset_warnings.is_empty());
        assert!(plan.analysis.data_warnings.is_empty());
        assert_eq!(plan.analysis.changed_tokens, 1);
        let overlay = temp.path().join("overlay.vpk");
        assert_eq!(plan.write(&overlay, &[]).unwrap().packed_files, 1);
        let archive = VpkArchive::open(&overlay).unwrap();
        assert_eq!(archive.list_entries(), [PATH]);
        let output = archive.extract_entry(PATH).unwrap();
        assert!(String::from_utf8(output).unwrap().contains("Authored"));
      }
    }
  }
  #[test]
  fn sixty_four_selected_mods_merge_without_losing_authored_tokens() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    std::fs::create_dir_all(&citadel).unwrap();
    pack(&citadel, "pak01", &[(PATH, BASE)]);
    let mut inputs = Vec::new();
    let mut enabled = BTreeSet::new();
    for index in 0..64 {
      let id = format!("selected_{index}");
      let payload = format!(
        "\"lang\" {{ \"Language\" \"English\" \"Tokens\" {{ \"Authored_{index}\" \"Value_{index}\" }} }}"
      );
      inputs.push(LocalizationModInput {
        mod_id: id.clone(),
        vpks: vec![pack(temp.path(), &id, &[(PATH, payload.as_bytes())])],
      });
      enabled.insert(id);
    }
    let mut expected = None;
    for _ in 0..2 {
      let plan = LocalizationOverlayPlan::build_selected(&citadel, &inputs, &enabled).unwrap();
      assert_eq!(plan.analysis.new_tokens, 64);
      let overlay = temp.path().join("overlay.vpk");
      assert_eq!(plan.write(&overlay, &[]).unwrap().packed_files, 1);
      let archive = VpkArchive::open(&overlay).unwrap();
      let output = archive.extract_entry(PATH).unwrap();
      let parsed = super::super::parse_localization_bytes(&output, PATH)
        .unwrap()
        .file;
      for index in 0..64 {
        assert_eq!(
          parsed.tokens[&format!("Authored_{index}")],
          format!("Value_{index}")
        );
      }
      if let Some(expected) = &expected {
        assert_eq!(&output, expected);
      } else {
        expected = Some(output);
      }
      inputs.reverse();
    }
  }
}
