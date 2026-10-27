use std::{
  collections::BTreeMap,
  path::{Path, PathBuf},
};

use source2_model::vpk_extract::VpkArchive;

use super::super::{
  modding_import,
  modding_tools::ModdingToolsConfig,
  modding_workspace::{ModdingAddon, contained},
};
use crate::errors::Error;

pub(super) struct Stock {
  entries: BTreeMap<String, Vec<String>>,
  archive: Option<PathBuf>,
  sdk: PathBuf,
  cli: PathBuf,
  pub diagnostic: Option<String>,
}

pub(super) struct Export {
  pub files: BTreeMap<String, Vec<u8>>,
  pub fingerprint: String,
}

impl Stock {
  pub fn open(addon: &ModdingAddon, config: &ModdingToolsConfig, cli: &Path) -> Self {
    match VpkArchive::open(Path::new(&addon.archive_path)) {
      Ok(archive) => {
        let mut result = Self {
          entries: BTreeMap::new(),
          archive: Some(addon.archive_path.clone().into()),
          sdk: config.prepared_sdk.clone().into(),
          cli: cli.into(),
          diagnostic: None,
        };
        for entry in archive.list_entries() {
          result
            .entries
            .entry(entry.to_ascii_lowercase())
            .or_default()
            .push(entry);
        }
        if !cli.is_file() {
          result.diagnostic = Some(
            "Set up Source 2 Viewer in Workbench tools to recover compiled stock dependencies."
              .into(),
          );
        }
        result
      }
      Err(error) => Self {
        entries: BTreeMap::new(),
        archive: None,
        sdk: PathBuf::new(),
        cli: cli.into(),
        diagnostic: Some(format!(
          "Installed Deadlock archive is unavailable; stock recovery was not checked: {error}"
        )),
      },
    }
  }

  #[cfg(test)]
  pub fn unavailable() -> Self {
    Self {
      entries: BTreeMap::new(),
      archive: None,
      sdk: PathBuf::new(),
      cli: PathBuf::new(),
      diagnostic: None,
    }
  }

  pub fn entry(&self, reference: &str) -> Option<&str> {
    let key = reference.to_ascii_lowercase();
    let candidates = self
      .entries
      .get(&key)
      .or_else(|| self.entries.get(&format!("{key}_c")))?;
    (candidates.len() == 1).then(|| candidates[0].as_str())
  }

  pub fn export(&self, entry: &str) -> Result<Export, Error> {
    let archive = self
      .archive
      .as_ref()
      .ok_or_else(|| Error::InvalidInput("Installed game archive unavailable".into()))?;
    let staging = tempfile::tempdir()?;
    let source =
      VpkArchive::open(archive).map_err(|error| Error::InvalidInput(error.to_string()))?;
    let original = source
      .extract_entry_limited(entry, 128 * 1024 * 1024)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    let fingerprint = super::super::modding_edits::fingerprint(&original);
    if entry.ends_with("_c") {
      if !self.cli.is_file() {
        return Err(Error::InvalidInput(
          "Set up Source 2 Viewer in Workbench tools first".into(),
        ));
      }
      modding_import::decompile(
        &self.cli,
        &self.sdk,
        archive,
        &[entry.into()],
        staging.path(),
      )?;
    } else {
      let target = contained(staging.path(), entry)?;
      std::fs::create_dir_all(
        target
          .parent()
          .ok_or_else(|| Error::InvalidInput("Missing stock asset parent".into()))?,
      )?;
      std::fs::write(target, &original)?;
    }
    let mut outputs = BTreeMap::new();
    let mut size = 0u64;
    for path in super::super::modding_batch::files(staging.path())? {
      let file = contained(staging.path(), &path)?;
      size += file.metadata()?.len();
      if size > 256 * 1024 * 1024 || outputs.len() >= 2048 {
        return Err(Error::InvalidInput(
          "Stock export exceeds the 256 MB / 2048 file scan limit".into(),
        ));
      }
      outputs.insert(path, std::fs::read(file)?);
    }
    let latest = VpkArchive::open(archive)
      .map_err(|error| Error::InvalidInput(error.to_string()))?
      .extract_entry_limited(entry, 128 * 1024 * 1024)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    if super::super::modding_edits::fingerprint(&latest) != fingerprint {
      return Err(Error::InvalidInput(
        "Installed game changed during stock export; re-scan after the update finishes".into(),
      ));
    }
    Ok(Export {
      files: outputs,
      fingerprint,
    })
  }
}
