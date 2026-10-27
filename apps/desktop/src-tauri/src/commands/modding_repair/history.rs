use std::{
  collections::{BTreeMap, BTreeSet},
  io::Write,
  path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use super::super::{
  modding_edits::{fingerprint, write_atomic},
  modding_workspace::contained,
};
use super::{ModdingRepairBackup, ModdingRepairResult};
use crate::errors::Error;

#[derive(Serialize, Deserialize)]
struct SavedFile {
  path: String,
  before: Option<String>,
  after: String,
}

#[derive(Serialize, Deserialize)]
struct Journal {
  created_at: String,
  status: String,
  files: Vec<SavedFile>,
}

fn invalid(message: impl Into<String>) -> Error {
  Error::InvalidInput(message.into())
}

fn directory(root: &Path, id: &str) -> Result<PathBuf, Error> {
  if !id.starts_with("repair-")
    || !id
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
  {
    return Err(invalid("Invalid repair backup id"));
  }
  contained(root, &format!(".dmm-history/{id}"))
}

fn save(history: &Path, journal: &Journal) -> Result<(), Error> {
  write_atomic(
    &contained(history, "repair.json")?,
    &serde_json::to_vec_pretty(journal).map_err(|error| invalid(error.to_string()))?,
  )
}

fn read_optional(root: &Path, path: &str) -> Result<Option<Vec<u8>>, Error> {
  let path = contained(root, path)?;
  match std::fs::read(path) {
    Ok(bytes) => Ok(Some(bytes)),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(error) => Err(error.into()),
  }
}

fn digest(bytes: &Option<Vec<u8>>) -> Option<String> {
  bytes.as_ref().map(|bytes| fingerprint(bytes))
}

fn write(
  root: &Path,
  path: &str,
  before: &Option<Vec<u8>>,
  after: &Option<Vec<u8>>,
) -> Result<(), Error> {
  if digest(&read_optional(root, path)?) != digest(before) {
    return Err(invalid(format!(
      "{path} changed. Re-scan or keep newer edits before restoring."
    )));
  }
  let target = contained(root, path)?;
  match after {
    Some(bytes) if before.is_some() => {
      let permissions = std::fs::metadata(&target)?.permissions();
      write_atomic(&target, bytes)?;
      std::fs::set_permissions(&target, permissions)?;
    }
    Some(bytes) => {
      let parent = target
        .parent()
        .ok_or_else(|| invalid("Missing repair destination"))?;
      std::fs::create_dir_all(parent)?;
      let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
      temporary.write_all(bytes)?;
      temporary.as_file().sync_all()?;
      temporary
        .persist_noclobber(&target)
        .map_err(|error| error.error)?;
    }
    None => std::fs::remove_file(&target)?,
  }
  Ok(())
}

type Mutation = (String, Option<Vec<u8>>, Option<Vec<u8>>);

fn transaction(root: &Path, changes: &[Mutation]) -> Result<(), Error> {
  for (path, before, _) in changes {
    if digest(&read_optional(root, path)?) != digest(before) {
      return Err(invalid(format!(
        "{path} changed. No repairs were written; re-scan first."
      )));
    }
  }
  for (index, (path, before, after)) in changes.iter().enumerate() {
    if let Err(error) = write(root, path, before, after) {
      let mut failures = Vec::new();
      if digest(&read_optional(root, path)?) == digest(after)
        && digest(before) != digest(after)
        && let Err(rollback) = write(root, path, after, before)
      {
        failures.push(rollback.to_string());
      }
      for (path, before, after) in changes[..index].iter().rev() {
        if let Err(rollback) = write(root, path, after, before) {
          failures.push(rollback.to_string());
        }
      }
      return Err(invalid(format!(
        "{error}. {}",
        if failures.is_empty() {
          "Completed writes were rolled back.".into()
        } else {
          format!(
            "Rollback conflicts: {}. Originals remain in repair history.",
            failures.join("; ")
          )
        }
      )));
    }
  }
  Ok(())
}

pub(super) fn commit(
  root: &Path,
  changes: BTreeMap<String, Vec<u8>>,
) -> Result<ModdingRepairResult, Error> {
  if changes.is_empty()
    || changes.len() > 8192
    || changes.values().map(Vec::len).sum::<usize>() > 512 * 1024 * 1024
  {
    return Err(invalid(
      "Repair batch must contain 1–8192 files and be no larger than 512 MB",
    ));
  }
  let mut folded = BTreeSet::new();
  let mut mutations = Vec::new();
  for (path, bytes) in changes {
    if !folded.insert(path.to_ascii_lowercase()) || path.starts_with('.') {
      return Err(invalid("Conflicting or reserved repair destination"));
    }
    mutations.push((path.clone(), read_optional(root, &path)?, Some(bytes)));
  }
  let history_root = contained(root, ".dmm-history")?;
  std::fs::create_dir_all(&history_root)?;
  let temporary = tempfile::Builder::new()
    .prefix("repair-")
    .tempdir_in(&history_root)?;
  let id = temporary
    .path()
    .file_name()
    .unwrap()
    .to_string_lossy()
    .into_owned();
  let mut journal = Journal {
    created_at: chrono::Utc::now().to_rfc3339(),
    status: "pending".into(),
    files: Vec::new(),
  };
  for (index, (path, before, after)) in mutations.iter().enumerate() {
    if let Some(bytes) = before {
      write_atomic(&temporary.path().join(index.to_string()), bytes)?;
    }
    journal.files.push(SavedFile {
      path: path.clone(),
      before: digest(before),
      after: digest(after).unwrap(),
    });
  }
  save(temporary.path(), &journal)?;
  let history = temporary.keep();
  transaction(root, &mutations)
    .map_err(|error| invalid(format!("{error} Backup: {}", history.display())))?;
  journal.status = "applied".into();
  save(&history, &journal)?;
  Ok(ModdingRepairResult {
    backup_id: id,
    files: journal.files.into_iter().map(|file| file.path).collect(),
  })
}

pub(super) fn restore(root: &Path, id: &str) -> Result<(), Error> {
  let history = directory(root, id)?;
  let mut journal: Journal =
    serde_json::from_slice(&std::fs::read(contained(&history, "repair.json")?)?)
      .map_err(|error| invalid(error.to_string()))?;
  if journal.status == "restored" {
    return Ok(());
  }
  if journal.files.is_empty() || journal.files.len() > 8192 {
    return Err(invalid("Invalid repair journal"));
  }
  let mut changes = Vec::new();
  let mut seen = BTreeSet::new();
  for (index, file) in journal.files.iter().enumerate() {
    if file.path.starts_with('.') || !seen.insert(file.path.to_ascii_lowercase()) {
      return Err(invalid("Invalid repair backup paths"));
    }
    let original = if let Some(expected) = &file.before {
      let bytes = std::fs::read(contained(&history, &index.to_string())?)?;
      if fingerprint(&bytes) != *expected {
        return Err(invalid(format!(
          "Backup for {} is damaged; nothing was restored",
          file.path
        )));
      }
      Some(bytes)
    } else {
      None
    };
    let current = read_optional(root, &file.path)?;
    if journal.status == "pending" && digest(&current) == file.before {
      continue;
    }
    if digest(&current).as_deref() != Some(&file.after) {
      return Err(invalid(format!(
        "{} changed after repair. Nothing was restored; keep newer edits or recover originals from {}.",
        file.path,
        history.display()
      )));
    }
    changes.push((file.path.clone(), current, original));
  }
  transaction(root, &changes)?;
  journal.status = "restored".into();
  save(&history, &journal)
}

pub(super) fn list(root: &Path) -> Result<Vec<ModdingRepairBackup>, Error> {
  let history = contained(root, ".dmm-history")?;
  if !history.is_dir() {
    return Ok(Vec::new());
  }
  let mut result = Vec::new();
  for entry in std::fs::read_dir(history)? {
    let entry = entry?;
    let id = entry.file_name().to_string_lossy().into_owned();
    if !id.starts_with("repair-") || !entry.file_type()?.is_dir() {
      continue;
    }
    let path = directory(root, &id)?;
    let journal_path = contained(&path, "repair.json")?;
    if !journal_path.is_file() {
      continue;
    }
    let journal: Journal = serde_json::from_slice(&std::fs::read(journal_path)?)
      .map_err(|error| invalid(format!("Invalid repair backup {id}: {error}")))?;
    result.push(ModdingRepairBackup {
      id,
      created_at: journal.created_at,
      files: journal.files.into_iter().map(|file| file.path).collect(),
      restored: journal.status == "restored",
    });
  }
  result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
  Ok(result)
}
