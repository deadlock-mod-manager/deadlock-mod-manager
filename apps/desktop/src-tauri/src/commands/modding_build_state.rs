//! Source provenance and dependency selection for incremental addon builds.
mod bindings;
mod imports;
#[cfg(test)]
mod tests;

use super::{
  modding_edits::{self, fingerprint},
  modding_workspace::{ModdingAddon, contained, relative},
};
use crate::errors::Error;
use serde::{Deserialize, Serialize};
use source2_model::{
  Resource,
  kv3::{self, KvValue},
};
use std::{
  collections::{BTreeMap, BTreeSet},
  io::Read,
  path::{Path, PathBuf},
};

const STATE: &str = ".dmm-build/state.json";

fn invalid(error: impl std::fmt::Display) -> Error {
  Error::InvalidInput(format!("Addon build tracking: {error}"))
}

fn read(path: &Path) -> Result<Vec<u8>, Error> {
  let mut bytes = Vec::new();
  std::fs::File::open(path)?
    .take(256 * 1024 * 1024 + 1)
    .read_to_end(&mut bytes)?;
  if bytes.len() > 256 * 1024 * 1024 {
    return Err(invalid("source exceeds 256 MB"));
  }
  Ok(bytes)
}

#[derive(Default, Deserialize, Serialize)]
pub(super) struct State {
  version: u32,
  inputs: BTreeMap<String, Input>,
}

#[derive(Deserialize, Serialize)]
struct Input {
  sources: BTreeMap<String, Option<String>>,
  outputs: Vec<String>,
}

impl State {
  pub(super) fn load(root: &Path) -> Result<Self, Error> {
    let path = contained(root, STATE)?;
    if !path.exists() {
      return Ok(Self {
        version: 1,
        ..Self::default()
      });
    }
    if path.metadata()?.len() > 16 * 1024 * 1024 {
      return Err(invalid("manifest exceeds 16 MB"));
    }
    let value: Self = serde_json::from_slice(&read(&path)?).map_err(invalid)?;
    if value.version != 1 || value.inputs.len() > 100_000 {
      return Err(invalid("unsupported manifest"));
    }
    for (path, input) in &value.inputs {
      relative(path, false)?;
      for output in &input.outputs {
        relative(output, false)?;
      }
      for source in input.sources.keys() {
        relative(source, false)?;
      }
    }
    Ok(value)
  }

  pub(super) fn save(&self, root: &Path) -> Result<(), Error> {
    modding_edits::write_atomic(
      &contained(root, STATE)?,
      &serde_json::to_vec(self).map_err(invalid)?,
    )
  }
}

pub(super) struct Snapshot {
  hashes: BTreeMap<String, String>,
  dependencies: BTreeMap<String, BTreeSet<String>>,
}

fn resource_dependencies(path: &Path) -> Result<Vec<String>, Error> {
  if !path.is_file() {
    return Ok(Vec::new());
  }
  let resource = Resource::parse(read(path)?).map_err(invalid)?;
  let Some(bytes) = resource.block_bytes("RED2") else {
    return Ok(Vec::new());
  };
  let data = kv3::parse(bytes).map_err(invalid)?;
  Ok(
    data
      .get("m_InputDependencies")
      .and_then(KvValue::as_array)
      .unwrap_or(&[])
      .iter()
      .filter_map(|input| input.get("m_RelativeFilename").and_then(KvValue::as_string))
      .map(|path| path.replace('\\', "/"))
      .filter(|path| relative(path, false).is_ok())
      .collect(),
  )
}

fn output_path(source: &str) -> String {
  match source.rsplit_once('.') {
    Some((stem, "mp3" | "wav")) => format!("{stem}.vsnd_c"),
    _ => format!("{source}_c"),
  }
}

impl Snapshot {
  pub(super) fn capture(addon: &ModdingAddon, inputs: &[PathBuf]) -> Result<Self, Error> {
    let root = Path::new(&addon.content_path);
    let names = super::modding_batch::files(root)?;
    let mut hashes = BTreeMap::new();
    let mut dependencies = BTreeMap::new();
    let quoted = regex::Regex::new(r#""([^"\r\n]+)""#).unwrap();
    for name in names {
      let bytes = read(&contained(root, &name)?)?;
      let mut refs = BTreeSet::new();
      if let Ok(text) = std::str::from_utf8(&bytes) {
        for captures in quoted.captures_iter(text) {
          let value = captures[1].replace('\\', "/");
          let value = value
            .strip_prefix("file://{images}/")
            .map(|image| format!("panorama/images/{image}"))
            .unwrap_or(value);
          let value = value.trim_end_matches("_c");
          if relative(value, false).is_ok() && value.contains('.') {
            refs.insert(value.to_owned());
          }
        }
      }
      hashes.insert(name.clone(), fingerprint(&bytes));
      dependencies.insert(name, refs);
    }
    for input in inputs {
      let name = relative_name(root, input)?;
      let refs = resource_dependencies(&contained(
        Path::new(&addon.game_path),
        &output_path(&name),
      )?)?;
      // RED2 records authored paths, while decompilers may relocate source meshes.
      // Existing local inputs supplement the paths found in the exported document.
      dependencies
        .entry(name)
        .or_default()
        .extend(refs.into_iter().filter(|path| hashes.contains_key(path)));
    }
    Ok(Self {
      hashes,
      dependencies,
    })
  }

  fn sources(&self, path: &str) -> BTreeMap<String, Option<String>> {
    let mut sources = BTreeMap::new();
    let mut pending = vec![path.to_owned()];
    while let Some(path) = pending.pop() {
      if sources.contains_key(&path) {
        continue;
      }
      sources.insert(path.clone(), self.hashes.get(&path).cloned());
      if let Some(refs) = self.dependencies.get(&path) {
        pending.extend(
          refs
            .iter()
            .filter(|path| self.hashes.contains_key(*path))
            .cloned(),
        );
      }
    }
    sources
  }

  pub(super) fn changed(
    &self,
    state: &State,
    root: &Path,
    game: &Path,
    inputs: &[PathBuf],
  ) -> Result<Vec<PathBuf>, Error> {
    inputs
      .iter()
      .filter_map(|path| {
        let result = (|| {
          let name = relative_name(root, path)?;
          Ok(state.inputs.get(&name).is_none_or(|previous| {
            previous.sources != self.sources(&name)
              || previous.outputs.is_empty()
              || previous
                .outputs
                .iter()
                .any(|output| !game.join(output).is_file())
          }))
        })();
        match result {
          Ok(true) => Some(Ok(path.clone())),
          Ok(false) => None,
          Err(error) => Some(Err(error)),
        }
      })
      .collect()
  }

  pub(super) fn record(
    &self,
    state: &mut State,
    root: &Path,
    game: &Path,
    inputs: &[PathBuf],
  ) -> Result<(), Error> {
    let generated = super::modding_batch::files(game)?;
    for path in inputs {
      let name = relative_name(root, path)?;
      let prefix = format!("{name}+");
      state.inputs.insert(
        name.clone(),
        Input {
          sources: self.sources(&name),
          outputs: std::iter::once(output_path(&name))
            .chain(
              generated
                .iter()
                .filter(|path| path.starts_with(&prefix) && path.ends_with("_c"))
                .cloned(),
            )
            .collect(),
        },
      );
    }
    Ok(())
  }

  pub(super) fn verify(&self, root: &Path, inputs: &[PathBuf]) -> Result<(), Error> {
    for input in inputs {
      for (path, expected) in self.sources(&relative_name(root, input)?) {
        let target = contained(root, &path)?;
        let actual = if target.is_file() {
          Some(fingerprint(&read(&target)?))
        } else {
          None
        };
        if actual != expected {
          return Err(invalid(format!(
            "{path} changed during compilation. Compile again before packing."
          )));
        }
      }
    }
    Ok(())
  }
}

fn relative_name(root: &Path, path: &Path) -> Result<String, Error> {
  let name = path
    .strip_prefix(root)
    .map_err(invalid)?
    .to_string_lossy()
    .replace('\\', "/");
  relative(&name, false)?;
  Ok(name)
}

pub(super) use bindings::AnimationBindings;
pub(super) use imports::{adopt_existing, record_import};
