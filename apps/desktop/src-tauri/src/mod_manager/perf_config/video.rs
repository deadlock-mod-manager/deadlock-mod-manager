use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::catalog::cache_dir;
use super::live::values_equal;
use super::types::{VideoBackup, VideoChange, VideoOutcome, VideoSetting, VideoState};
use crate::errors::Error;

const RECORD_FILE: &str = "video.json";
const BACKUP_FILE: &str = "video-backup.txt";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WrittenKey {
  key: String,
  written: String,
  original: Option<String>,
  #[serde(default)]
  kept: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
  path: Option<PathBuf>,
  #[serde(default)]
  keys: Vec<WrittenKey>,
  #[serde(default)]
  backup: Option<VideoBackup>,
}

pub fn locate(game_path: Option<&Path>, account_dir: Option<&Path>) -> Option<PathBuf> {
  let account = account_dir.map(|dir| dir.join("local").join("cfg").join("video.txt"));
  let game = game_path.map(|dir| {
    dir
      .join("game")
      .join("citadel")
      .join("cfg")
      .join("video.txt")
  });
  account.into_iter().chain(game).find(|path| path.is_file())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangedKeys {
  Keep,
  Overwrite,
}

pub fn apply(
  app_data_dir: &Path,
  path: Option<&Path>,
  settings: &[VideoSetting],
  changed: ChangedKeys,
) -> Result<VideoOutcome, Error> {
  let mut record = load(app_data_dir)?;
  let mut inherited: HashMap<String, WrittenKey> = HashMap::new();
  if record.path.as_deref() != path || settings.is_empty() {
    inherited = record
      .keys
      .iter()
      .map(|key| (key.key.to_ascii_lowercase(), key.clone()))
      .collect();
    revert_keys(&mut record)?;
  }
  let Some(path) = path else {
    save(app_data_dir, &record)?;
    return Ok(if settings.is_empty() {
      VideoOutcome::Skipped
    } else {
      VideoOutcome::FileMissing
    });
  };
  if settings.is_empty() {
    save(app_data_dir, &record)?;
    return Ok(VideoOutcome::Skipped);
  }

  let original = read(path)?;
  if record.backup.is_none() {
    record.backup = Some(take_backup(app_data_dir, path, &original)?);
  }
  let current = setting_values(&original);
  let owned: HashMap<String, WrittenKey> = record
    .keys
    .drain(..)
    .map(|key| (key.key.to_ascii_lowercase(), key))
    .collect();

  let mut wanted: Vec<(String, String)> = Vec::new();
  for setting in settings {
    let key = format!("setting.{}", setting.key);
    match wanted
      .iter()
      .position(|(other, _)| other.eq_ignore_ascii_case(&key))
    {
      Some(position) => wanted[position].1 = setting.value.clone(),
      None => wanted.push((key, setting.value.clone())),
    }
  }

  let mut edits: Vec<(String, Option<String>)> = Vec::new();
  let mut keys: Vec<WrittenKey> = Vec::new();
  for (key, value) in wanted {
    let lower = key.to_ascii_lowercase();
    let live = current.get(&lower).cloned();
    let previous = owned.get(&lower).or_else(|| {
      inherited
        .get(&lower)
        .filter(|key| key.kept || holds(&current, key))
    });
    if let Some(previous) = previous
      && !holds(&current, previous)
      && (previous.kept || changed == ChangedKeys::Keep)
    {
      keys.push(previous.clone());
      continue;
    }
    keys.push(WrittenKey {
      original: match previous {
        Some(previous) => previous.original.clone(),
        None => live.clone(),
      },
      written: value.clone(),
      key: key.clone(),
      kept: false,
    });
    if live.as_deref() != Some(value.as_str()) {
      edits.push((key, Some(value)));
    }
  }
  for (lower, previous) in owned.iter().chain(&inherited) {
    if keys.iter().any(|key| key.key.eq_ignore_ascii_case(lower)) {
      continue;
    }
    if holds(&current, previous) {
      edits.push((previous.key.clone(), previous.original.clone()));
    }
  }

  let updated = edit_settings(&original, &edits)?;
  if updated != original {
    write_checked(path, &original, &updated)?;
  }
  let count = keys.len() as u32;
  record.path = Some(path.to_path_buf());
  record.keys = keys;
  save(app_data_dir, &record)?;
  Ok(VideoOutcome::Written {
    path: path.display().to_string(),
    settings: count,
  })
}

pub fn revert(app_data_dir: &Path) -> Result<(), Error> {
  let mut record = load(app_data_dir)?;
  revert_keys(&mut record)?;
  save(app_data_dir, &record)
}

pub fn state(app_data_dir: &Path, located: Option<&Path>) -> VideoState {
  let Ok(record) = load(app_data_dir) else {
    return VideoState::default();
  };
  let Some(path) = record.path.as_deref() else {
    return VideoState::default();
  };
  if record.keys.is_empty() || located != Some(path) {
    return VideoState::default();
  }
  let current = read(path)
    .map(|text| setting_values(&text))
    .unwrap_or_default();
  let mut state = VideoState::default();
  for key in &record.keys {
    if holds(&current, key) {
      state.in_effect += 1;
    } else {
      state.changed.push(VideoChange {
        key: key.key["setting.".len()..].to_string(),
        written: key.written.clone(),
        current: current.get(&key.key.to_ascii_lowercase()).cloned(),
        kept: key.kept,
      });
    }
  }
  state
}

pub fn use_written(app_data_dir: &Path, keys: &[String]) -> Result<(), Error> {
  let mut record = load(app_data_dir)?;
  let Some(path) = record.path.clone() else {
    return Ok(());
  };
  let text = read(&path)?;
  let mut edits = Vec::new();
  for key in record.keys.iter_mut().filter(|key| named(key, keys)) {
    key.kept = false;
    edits.push((key.key.clone(), Some(key.written.clone())));
  }
  let updated = edit_settings(&text, &edits)?;
  if updated != text {
    write_checked(&path, &text, &updated)?;
  }
  save(app_data_dir, &record)
}

pub fn keep_current(app_data_dir: &Path, keys: &[String]) -> Result<(), Error> {
  let mut record = load(app_data_dir)?;
  for key in record.keys.iter_mut().filter(|key| named(key, keys)) {
    key.kept = true;
  }
  save(app_data_dir, &record)
}

fn named(key: &WrittenKey, names: &[String]) -> bool {
  names
    .iter()
    .any(|name| key.key["setting.".len()..].eq_ignore_ascii_case(name))
}

pub fn out_of_place(app_data_dir: &Path, located: Option<&Path>) -> bool {
  located.is_some_and(|located| {
    load(app_data_dir).is_ok_and(|record| record.path.as_deref() != Some(located))
  })
}

pub fn backup(app_data_dir: &Path) -> Option<VideoBackup> {
  load(app_data_dir).ok()?.backup
}

pub fn adopt(app_data_dir: &Path, located: Option<&Path>) -> Result<(), Error> {
  let path = located
    .ok_or_else(|| Error::PerformanceConfig("Deadlock hasn't created video.txt yet".into()))?;
  let text = read(path)?;
  let record = Record {
    backup: Some(take_backup(app_data_dir, path, &text)?),
    ..Record::default()
  };
  save(app_data_dir, &record)
}

pub fn restore_backup(app_data_dir: &Path) -> Result<(), Error> {
  let mut record = load(app_data_dir)?;
  let backup = record
    .backup
    .clone()
    .ok_or_else(|| Error::PerformanceConfig("There is no saved video.txt to restore".into()))?;
  let saved = fs::read(cache_dir(app_data_dir).join(BACKUP_FILE))?;
  let target = PathBuf::from(&backup.path);
  if record.path.as_deref() != Some(target.as_path()) {
    revert_keys(&mut record)?;
  }
  let expected = match fs::read(&target) {
    Ok(bytes) => bytes,
    Err(error) if error.kind() == ErrorKind::NotFound => Vec::new(),
    Err(error) => return Err(error.into()),
  };
  write_bytes_checked(&target, &expected, &saved)?;
  save(app_data_dir, &Record::default())?;
  match fs::remove_file(cache_dir(app_data_dir).join(BACKUP_FILE)) {
    Err(error) if error.kind() != ErrorKind::NotFound => Err(error.into()),
    _ => Ok(()),
  }
}

fn revert_keys(record: &mut Record) -> Result<(), Error> {
  let keys = std::mem::take(&mut record.keys);
  let Some(path) = record.path.take() else {
    return Ok(());
  };
  if keys.is_empty() || !path.is_file() {
    return Ok(());
  }
  let text = read(&path)?;
  let current = setting_values(&text);
  let edits: Vec<(String, Option<String>)> = keys
    .into_iter()
    .filter(|key| holds(&current, key))
    .map(|key| (key.key, key.original))
    .collect();
  let updated = edit_settings(&text, &edits)?;
  if updated != text {
    write_checked(&path, &text, &updated)?;
  }
  Ok(())
}

fn take_backup(app_data_dir: &Path, path: &Path, text: &str) -> Result<VideoBackup, Error> {
  let dir = cache_dir(app_data_dir);
  fs::create_dir_all(&dir)?;
  write_atomic(&dir.join(BACKUP_FILE), text.as_bytes())?;
  Ok(VideoBackup {
    path: path.display().to_string(),
    taken_at: chrono::Utc::now().to_rfc3339(),
  })
}

fn read(path: &Path) -> Result<String, Error> {
  Ok(String::from_utf8_lossy(&fs::read(path)?).into_owned())
}

fn holds(current: &HashMap<String, String>, key: &WrittenKey) -> bool {
  current
    .get(&key.key.to_ascii_lowercase())
    .is_some_and(|value| values_equal(value, &key.written))
}

fn setting_values(text: &str) -> HashMap<String, String> {
  text
    .lines()
    .filter_map(parse_line)
    .map(|line| (line.key.to_ascii_lowercase(), line.value.to_string()))
    .collect()
}

struct SettingLine<'a> {
  key: &'a str,
  value: &'a str,
  value_start: usize,
  value_end: usize,
}

fn parse_line(line: &str) -> Option<SettingLine<'_>> {
  let key_start = line.find('"')? + 1;
  if !line[..key_start - 1].trim().is_empty() {
    return None;
  }
  let key_end = key_start + line[key_start..].find('"')?;
  let key = &line[key_start..key_end];
  if !key.to_ascii_lowercase().starts_with("setting.") {
    return None;
  }
  let rest = &line[key_end + 1..];
  let gap = rest.find('"')?;
  if !rest[..gap].trim().is_empty() {
    return None;
  }
  let value_start = key_end + 1 + gap + 1;
  let value_end = value_start + line[value_start..].find('"')?;
  Some(SettingLine {
    key,
    value: &line[value_start..value_end],
    value_start,
    value_end,
  })
}

fn edit_settings(text: &str, edits: &[(String, Option<String>)]) -> Result<String, Error> {
  if edits.is_empty() {
    return Ok(text.to_string());
  }
  let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
  let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
  let ends_with_eol = text.ends_with('\n');
  for (key, value) in edits {
    let matches: Vec<usize> = lines
      .iter()
      .enumerate()
      .filter(|(_, line)| parse_line(line).is_some_and(|line| line.key.eq_ignore_ascii_case(key)))
      .map(|(index, _)| index)
      .collect();
    match value {
      Some(value) if matches.is_empty() => {
        let close = lines
          .iter()
          .rposition(|line| line.trim() == "}")
          .ok_or_else(|| Error::PerformanceConfig("video.txt has no closing brace".into()))?;
        lines.insert(close, format!("\t\"{key}\"\t\t\"{value}\""));
      }
      Some(value) => {
        for index in matches {
          let line = &lines[index];
          let parsed = parse_line(line).expect("matched a setting line");
          let edited = format!(
            "{}{value}{}",
            &line[..parsed.value_start],
            &line[parsed.value_end..]
          );
          lines[index] = edited;
        }
      }
      None => {
        for index in matches.into_iter().rev() {
          lines.remove(index);
        }
      }
    }
  }
  let mut out = lines.join(eol);
  if ends_with_eol {
    out.push_str(eol);
  }
  Ok(out)
}

fn record_path(app_data_dir: &Path) -> PathBuf {
  cache_dir(app_data_dir).join(RECORD_FILE)
}

fn load(app_data_dir: &Path) -> Result<Record, Error> {
  match fs::read_to_string(record_path(app_data_dir)) {
    Ok(json) => serde_json::from_str(&json).map_err(|error| {
      Error::PerformanceConfig(format!("The video.txt record is damaged: {error}"))
    }),
    Err(error) if error.kind() == ErrorKind::NotFound => Ok(Record::default()),
    Err(error) => Err(error.into()),
  }
}

fn save(app_data_dir: &Path, record: &Record) -> Result<(), Error> {
  if record == &Record::default() {
    return match fs::remove_file(record_path(app_data_dir)) {
      Err(error) if error.kind() != ErrorKind::NotFound => Err(error.into()),
      _ => Ok(()),
    };
  }
  let dir = cache_dir(app_data_dir);
  fs::create_dir_all(&dir)?;
  let json = serde_json::to_vec_pretty(record).map_err(|error| {
    Error::PerformanceConfig(format!("Failed to save the video.txt record: {error}"))
  })?;
  write_atomic(&record_path(app_data_dir), &json)
}

fn write_checked(path: &Path, expected: &str, updated: &str) -> Result<(), Error> {
  write_bytes_checked(path, expected.as_bytes(), updated.as_bytes())
}

fn write_bytes_checked(path: &Path, expected: &[u8], updated: &[u8]) -> Result<(), Error> {
  let current = match fs::read(path) {
    Ok(bytes) => bytes,
    Err(error) if error.kind() == ErrorKind::NotFound => Vec::new(),
    Err(error) => return Err(error.into()),
  };
  if current != expected {
    return Err(Error::PerformanceConfig(
      "video.txt changed while it was being written; try again".into(),
    ));
  }
  write_atomic(path, updated)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), Error> {
  use std::io::Write;
  let dir = path
    .parent()
    .ok_or_else(|| Error::FileWriteFailed(format!("{} has no folder", path.display())))?;
  let mut temp = tempfile::NamedTempFile::new_in(dir)?;
  temp.write_all(bytes)?;
  temp.as_file().sync_all()?;
  temp
    .persist(path)
    .map_err(|error| Error::FileWriteFailed(format!("{}: {}", path.display(), error.error)))?;
  Ok(())
}

#[cfg(test)]
#[path = "video_tests.rs"]
mod tests;
