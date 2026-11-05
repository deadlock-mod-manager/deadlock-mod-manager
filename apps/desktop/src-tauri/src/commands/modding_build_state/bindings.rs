use super::*;
use source2_model::nm_anim;

pub(in crate::commands) struct AnimationBindings {
  skeletons: BTreeMap<String, Vec<String>>,
  clips: BTreeMap<String, (String, String)>,
}

impl AnimationBindings {
  pub(in crate::commands) fn capture(game: &Path, inputs: &[PathBuf]) -> Result<Self, Error> {
    let mut result = Self {
      skeletons: BTreeMap::new(),
      clips: BTreeMap::new(),
    };
    if !inputs.iter().any(|path| {
      path.extension().is_some_and(|ext| {
        ["vmdl", "vnmskel", "vnmclip"]
          .iter()
          .any(|name| ext == *name)
      })
    }) {
      return Ok(result);
    }
    for path in super::super::modding_batch::files(game)? {
      if path.ends_with(".vnmskel_c") {
        let resource = Resource::parse(read(&contained(game, &path)?)?).map_err(invalid)?;
        result.skeletons.insert(
          path,
          nm_anim::parse_nm_skeleton(&resource)
            .map_err(invalid)?
            .bone_names,
        );
      } else if path.ends_with(".vnmclip_c") {
        let bytes = read(&contained(game, &path)?)?;
        let digest = fingerprint(&bytes);
        let resource = Resource::parse(bytes).map_err(invalid)?;
        let clip = nm_anim::parse_nm_clip(&resource).map_err(invalid)?;
        let skeleton = format!("{}_c", clip.skeleton_path.trim_end_matches("_c"));
        relative(&skeleton, false)?;
        result.clips.insert(path, (skeleton, digest));
      }
    }
    Ok(result)
  }

  pub(in crate::commands) fn verify(&self, game: &Path) -> Result<(), Error> {
    for (path, original) in &self.skeletons {
      let resource = Resource::parse(read(&contained(game, path)?)?).map_err(invalid)?;
      let current = nm_anim::parse_nm_skeleton(&resource).map_err(invalid)?;
      if current.bone_names == *original {
        continue;
      }
      for (clip, (skeleton, digest)) in &self.clips {
        if skeleton == path && fingerprint(&read(&contained(game, clip)?)?) == *digest {
          return Err(invalid(format!(
            "Compiling {path} changed its bone order, but {clip} still uses the previous bindings. Packaging stopped to prevent broken animations. Restore the original skeleton or rebuild all clips against the new rig."
          )));
        }
      }
    }
    Ok(())
  }
}
