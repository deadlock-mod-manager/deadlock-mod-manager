use super::*;
use source2_model::nm_anim;

pub(in crate::commands) struct AnimationBindings {
  skeletons: BTreeMap<String, Vec<String>>,
  clips: BTreeMap<String, (String, String)>,
  preserved: BTreeMap<String, Vec<u8>>,
  sources: Vec<PathBuf>,
}

impl AnimationBindings {
  pub(in crate::commands) fn capture(game: &Path, inputs: &[PathBuf]) -> Result<Self, Error> {
    let mut result = Self {
      skeletons: BTreeMap::new(),
      clips: BTreeMap::new(),
      preserved: BTreeMap::new(),
      sources: Vec::new(),
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

  pub(in crate::commands) fn preserve_unchanged(
    &mut self,
    snapshot: &Snapshot,
    state: &State,
    root: &Path,
    game: &Path,
  ) -> Result<(), Error> {
    for (source, previous) in &state.inputs {
      if ![".vnmclip", ".vnmskel"]
        .iter()
        .any(|extension| source.ends_with(extension))
        || previous.sources != snapshot.sources(source)
        || previous.outputs.is_empty()
        || previous
          .outputs
          .iter()
          .any(|output| !game.join(output).is_file())
      {
        continue;
      }
      self.sources.push(contained(root, source)?);
      for output in &previous.outputs {
        self
          .preserved
          .insert(output.clone(), read(&contained(game, output)?)?);
      }
    }
    Ok(())
  }

  /// ModelDoc can rebuild animation dependencies even when only the render mesh changed.
  pub(in crate::commands) fn restore(
    &self,
    snapshot: &Snapshot,
    root: &Path,
    game: &Path,
  ) -> Result<(), Error> {
    snapshot.verify(root, &self.sources)?;
    let mut edits = Vec::new();
    for (path, original) in &self.preserved {
      if read(&contained(game, path)?)? != *original {
        edits.push(modding_edits::Edit {
          from: path.clone(),
          to: path.clone(),
          bytes: original.clone(),
        });
      }
    }
    if !edits.is_empty() {
      modding_edits::commit(game, edits)?;
    }
    Ok(())
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
