use super::*;

/// Resolve every mounted archive in engine order, including files without an
/// enabled manifest owner. Unmanaged archives participate as opted-out inputs.
pub(super) fn mounted_inputs(
  base: &ProfileBase,
  inputs: Vec<LocalizationModInput>,
) -> Result<(Vec<LocalizationModInput>, Vec<UnmanagedVpk>), Error> {
  let mut owners = BTreeMap::new();
  for input in inputs {
    for path in input.vpks {
      owners.insert(path, input.mod_id.clone());
    }
  }
  let mut mounted = Vec::new();
  for (shard, directory) in base.existing_shards() {
    for entry in fs::read_dir(directory)? {
      let path = entry?.path();
      let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
        continue;
      };
      let Some(number) = VpkManager::enabled_vpk_number(filename) else {
        continue;
      };
      if path.is_file() {
        let filename = filename.to_owned();
        mounted.push((shard, number, filename, path));
      }
    }
  }
  mounted.sort_by(|a, b| (&a.0, &a.1, &a.2).cmp(&(&b.0, &b.1, &b.2)));
  let mut inputs = Vec::new();
  let mut unmanaged = Vec::new();
  for (shard, _, filename, path) in mounted {
    let mod_id = match owners.remove(&path) {
      Some(owner) => owner,
      None => {
        let file_path = ShardLocator::new(shard, filename).to_wire();
        let mod_id = format!("unmanaged:{file_path}");
        unmanaged.push(UnmanagedVpk {
          mod_id: mod_id.clone(),
          file_path,
        });
        mod_id
      }
    };
    inputs.push(LocalizationModInput {
      mod_id,
      vpks: vec![path],
    });
  }
  if let Some((path, mod_id)) = owners.first_key_value() {
    return Err(Error::ModInvalid(format!(
      "Mod {mod_id} is marked enabled but {} is not a mounted pak*_dir.vpk file. Reinstall this mod before retrying compatibility review",
      path.display()
    )));
  }
  Ok((inputs, unmanaged))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn inventory_respects_profile_shards_and_disabled_names() {
    let temp = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(temp.path().join("game/citadel/addons/profile_test")).unwrap();
    let second = ShardIndex::new(2).unwrap();
    for path in [
      base.join("pak01_dir.vpk"),
      base.join("pak03_dir.vpk"),
      base.join("skin_pak02_dir.vpk"),
      base.join("pak01_000.vpk"),
      base.shard_dir(second).join("pak01_dir.vpk"),
      temp.path().join("game/citadel/addons/pak02_dir.vpk"),
      temp
        .path()
        .join("game/citadel/addons/profile_other/pak01_dir.vpk"),
    ] {
      fs::create_dir_all(path.parent().unwrap()).unwrap();
      fs::write(path, b"inventory fixture").unwrap();
    }
    let owned = vec![LocalizationModInput {
      mod_id: "skin".into(),
      vpks: vec![base.join("pak03_dir.vpk"), base.join("pak01_dir.vpk")],
    }];
    let (inputs, unmanaged) = mounted_inputs(&base, owned).unwrap();
    assert_eq!(inputs.len(), 3);
    assert_eq!(inputs[0].vpks, [base.join("pak01_dir.vpk")]);
    assert_eq!(inputs[1].vpks, [base.join("pak03_dir.vpk")]);
    assert_eq!(inputs[0].mod_id, "skin");
    assert_eq!(inputs[1].mod_id, "skin");
    assert_eq!(
      unmanaged,
      [UnmanagedVpk {
        mod_id: "unmanaged:addons2/pak01_dir.vpk".into(),
        file_path: "addons2/pak01_dir.vpk".into(),
      }]
    );
    assert_eq!(inputs[2].mod_id, unmanaged[0].mod_id);
  }

  #[test]
  fn enabled_manifest_entry_cannot_silently_point_at_a_disabled_file() {
    let temp = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(temp.path().join("game/citadel/addons")).unwrap();
    fs::create_dir_all(&base).unwrap();
    let path = base.join("skin_pak01_dir.vpk");
    fs::write(&path, b"disabled fixture").unwrap();
    let error = mounted_inputs(
      &base,
      vec![LocalizationModInput {
        mod_id: "skin".into(),
        vpks: vec![path],
      }],
    )
    .unwrap_err()
    .to_string();
    assert!(error.contains("not a mounted"));
    assert!(error.contains("skin_pak01_dir.vpk"));
  }
}
