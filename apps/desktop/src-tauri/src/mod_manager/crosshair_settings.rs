use super::hero_settings::{EMPTY_SETTINGS, HeroSettings};
use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const SETTINGS_FILE: &str = "citadel_hero_settings.lst";
const BACKUP_FILE: &str = "citadel_hero_settings.dmm-crosshair.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosshairConfig {
  gap: f64,
  width: f64,
  height: f64,
  pip_opacity: f64,
  dot_opacity: f64,
  dot_outline_opacity: f64,
  color: Color,
  pip_border: bool,
  pip_gap_static: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Color {
  r: u8,
  g: u8,
  b: u8,
}

impl CrosshairConfig {
  fn settings(&self) -> Result<BTreeMap<String, String>, Error> {
    if [
      self.gap,
      self.width,
      self.height,
      self.pip_opacity,
      self.dot_opacity,
      self.dot_outline_opacity,
    ]
    .iter()
    .any(|value| !value.is_finite())
    {
      return Err(Error::InvalidInput(
        "Crosshair values must be finite".into(),
      ));
    }
    Ok(
      [
        ("crosshair_themed", "false".into()),
        ("crosshair_color_r", self.color.r.to_string()),
        ("crosshair_color_g", self.color.g.to_string()),
        ("crosshair_color_b", self.color.b.to_string()),
        (
          "crosshair_pip_outline_border",
          u8::from(self.pip_border).to_string(),
        ),
        ("crosshair_pip_gap_static", self.pip_gap_static.to_string()),
        ("crosshair_pip_opacity", self.pip_opacity.to_string()),
        ("crosshair_pip_width", self.width.to_string()),
        ("crosshair_pip_height", self.height.to_string()),
        ("crosshair_pip_gap", self.gap.to_string()),
        ("crosshair_dot_opacity", self.dot_opacity.to_string()),
        (
          "crosshair_dot_outline_opacity",
          self.dot_outline_opacity.to_string(),
        ),
      ]
      .into_iter()
      .map(|(key, value)| (key.to_string(), format!("\"{value}\"")))
      .collect(),
    )
  }

  pub fn autoexec(&self) -> Result<String, Error> {
    Ok(
      self
        .settings()?
        .into_iter()
        .filter(|(key, _)| key != "crosshair_themed")
        .map(|(key, value)| format!("citadel_{key} {value}"))
        .collect::<Vec<_>>()
        .join("\n"),
    )
  }
}

#[derive(Serialize, Deserialize)]
struct SavedSetting {
  original: Option<String>,
  applied: String,
}

fn matches_applied(current: Option<&str>, applied: &str) -> bool {
  let Some(current) = current else {
    return false;
  };
  if current == applied {
    return true;
  }
  let current = current.trim_matches('"');
  let applied = applied.trim_matches('"');
  match (current.parse::<f64>(), applied.parse::<f64>()) {
    (Ok(current), Ok(applied)) => current == applied,
    _ => current == applied,
  }
}

pub struct ConfigEdit {
  path: PathBuf,
  original: Option<String>,
  updated: Option<String>,
}

pub fn read_optional(path: &Path) -> Result<Option<String>, Error> {
  match fs::read_to_string(path) {
    Ok(content) => Ok(Some(content)),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(error) => Err(Error::FileWriteFailed(format!(
      "Cannot read {}: {error}",
      path.display()
    ))),
  }
}

impl ConfigEdit {
  pub fn new(path: PathBuf, updated: Option<String>) -> Result<Self, Error> {
    let original = read_optional(&path)?;
    Ok(Self {
      path,
      original,
      updated,
    })
  }
}

fn write_config(path: &Path, content: Option<&str>) -> std::io::Result<()> {
  if let Some(content) = content {
    let parent = path
      .parent()
      .ok_or_else(|| std::io::Error::other("Missing config directory"))?;
    fs::create_dir_all(parent)?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(content.as_bytes())?;
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|error| error.error)?;
  } else if let Err(error) = fs::remove_file(path)
    && error.kind() != std::io::ErrorKind::NotFound
  {
    return Err(error);
  }
  Ok(())
}

pub fn commit(edits: Vec<ConfigEdit>) -> Result<(), Error> {
  let edits: Vec<_> = edits
    .into_iter()
    .filter(|edit| edit.original != edit.updated)
    .collect();
  for (index, edit) in edits.iter().enumerate() {
    let result = read_optional(&edit.path).and_then(|current| {
      if current != edit.original {
        return Err(Error::FileWriteFailed(format!(
          "{} changed while updating crosshairs; retry",
          edit.path.display()
        )));
      }
      write_config(&edit.path, edit.updated.as_deref()).map_err(Error::Io)
    });
    if let Err(error) = result {
      let mut failures = vec![format!("{}: {error}", edit.path.display())];
      for previous in edits[..index].iter().rev() {
        if let Err(error) = write_config(&previous.path, previous.original.as_deref()) {
          failures.push(format!(
            "Failed to restore {}: {error}",
            previous.path.display()
          ));
        }
      }
      return Err(Error::FileWriteFailed(failures.join("; ")));
    }
  }
  Ok(())
}

pub fn prepare(
  game_path: &Path,
  config: Option<&CrosshairConfig>,
  steam_userdata: Option<&Path>,
) -> Result<Vec<ConfigEdit>, Error> {
  let directory = game_path.join("game/citadel/cfg");
  let mut edits = prepare_file(
    directory.join(SETTINGS_FILE),
    directory.join(BACKUP_FILE),
    config,
  )?;
  if let Some(userdata) = steam_userdata {
    edits.extend(prepare_file(
      userdata.join("remote/cfg").join(SETTINGS_FILE),
      userdata.join("local").join(BACKUP_FILE),
      config,
    )?);
  }
  Ok(edits)
}

fn prepare_file(
  settings_path: PathBuf,
  backup_path: PathBuf,
  config: Option<&CrosshairConfig>,
) -> Result<Vec<ConfigEdit>, Error> {
  let backup_content = read_optional(&backup_path)?;
  if config.is_none() && backup_content.is_none() {
    return Ok(Vec::new());
  }
  let mut backup: BTreeMap<String, SavedSetting> = backup_content
    .as_deref()
    .map(serde_json::from_str)
    .transpose()
    .map_err(|error| Error::InvalidInput(format!("Invalid crosshair backup: {error}")))?
    .unwrap_or_default();
  let original = read_optional(&settings_path)?;
  if config.is_none() && original.is_none() {
    return Ok(vec![ConfigEdit::new(backup_path, None)?]);
  }
  let content = original.as_deref().unwrap_or(EMPTY_SETTINGS);
  let settings = HeroSettings::parse(content)?;
  let mut changes = BTreeMap::new();
  if let Some(config) = config {
    for (key, applied) in config.settings()? {
      let current = settings.get(&key)?;
      let original = match backup.get(&key) {
        Some(saved) if matches_applied(current.as_deref(), &saved.applied) => {
          saved.original.clone()
        }
        _ => current,
      };
      changes.insert(key.clone(), Some(applied.clone()));
      backup.insert(key, SavedSetting { original, applied });
    }
  } else {
    for (key, saved) in &backup {
      if matches_applied(settings.get(key)?.as_deref(), &saved.applied) {
        changes.insert(key.clone(), saved.original.clone());
      }
    }
  }
  let updated = settings.update(&changes)?;
  let backup = config
    .map(|_| serde_json::to_string_pretty(&backup))
    .transpose()
    .map_err(|error| Error::InvalidInput(error.to_string()))?;
  // Persist the restore information before changing the game settings.
  let mut edits = vec![
    ConfigEdit {
      path: backup_path,
      original: backup_content,
      updated: backup,
    },
    ConfigEdit {
      path: settings_path,
      original,
      updated: Some(updated),
    },
  ];
  if config.is_none() {
    edits.reverse();
  }
  Ok(edits)
}

#[cfg(test)]
#[path = "crosshair_settings_tests.rs"]
mod tests;
