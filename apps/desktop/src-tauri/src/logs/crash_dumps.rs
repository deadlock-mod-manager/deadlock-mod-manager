use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::commands::MANAGER;
use crate::errors::Error;
use crate::utils;

#[derive(Serialize)]
pub struct CrashDumpInfo {
  pub path: String,
  pub exists: bool,
  pub files: Vec<CrashDumpFile>,
  pub total_count: usize,
  pub total_size: u64,
}

#[derive(Serialize)]
pub struct CrashDumpFile {
  pub name: String,
  pub path: String,
  pub size: u64,
  pub modified: Option<String>,
}

pub fn get_crash_dumps_dir() -> Result<PathBuf, Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  #[cfg(target_os = "windows")]
  let bin_dir = game_path.join("game").join("bin").join("win64");

  #[cfg(target_os = "linux")]
  let bin_dir = game_path.join("game").join("bin").join("linuxsteamrt64");

  #[cfg(target_os = "macos")]
  let bin_dir = game_path.join("game").join("bin").join("osx64");

  Ok(bin_dir)
}

pub fn find_deadlock_crash_dumps(dir: &Path) -> Vec<CrashDumpFile> {
  let mut files: Vec<CrashDumpFile> = Vec::new();

  if !dir.exists() {
    return files;
  }

  let entries = match std::fs::read_dir(dir) {
    Ok(e) => e,
    Err(_) => return files,
  };

  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_file() {
      continue;
    }

    let name = path
      .file_name()
      .unwrap_or_default()
      .to_string_lossy()
      .to_string();
    let name_lower = name.to_lowercase();

    if name_lower.contains("deadlock") && name_lower.ends_with(".mdmp") {
      let metadata = std::fs::metadata(&path).ok();
      let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
      let modified = metadata.and_then(|m| m.modified().ok()).map(|t| {
        chrono::DateTime::<chrono::Utc>::from(t)
          .format("%Y-%m-%d %H:%M:%S")
          .to_string()
      });

      files.push(CrashDumpFile {
        name,
        path: path.to_string_lossy().to_string(),
        size,
        modified,
      });
    }
  }

  files.sort_by(|a, b| b.modified.cmp(&a.modified));
  files
}

pub fn parse_and_save_dmp(dmp_path: &Path, parsed_dir: &Path) -> Result<PathBuf, String> {
  let options = dmp_parser::DmpParseOptions {
    include_modules: true,
    include_threads: true,
    max_modules: Some(50),
  };

  let parsed = dmp_parser::DmpParser::parse_file(dmp_path, options)
    .map_err(|e| format!("Failed to parse {}: {e}", dmp_path.display()))?;

  let file_stem = dmp_path.file_stem().unwrap_or_default().to_string_lossy();
  let txt_path = parsed_dir.join(format!("{file_stem}.txt"));

  std::fs::write(&txt_path, &parsed.raw_text)
    .map_err(|e| format!("Failed to write {}: {e}", txt_path.display()))?;

  Ok(txt_path)
}

pub fn get_crash_dumps_info() -> Result<CrashDumpInfo, Error> {
  log::info!("Getting crash dumps info");

  let dir = get_crash_dumps_dir()?;

  let exists = dir.exists();
  let files = if exists {
    find_deadlock_crash_dumps(&dir)
  } else {
    Vec::new()
  };

  let total_size = files.iter().map(|f| f.size).sum();

  Ok(CrashDumpInfo {
    path: dir.to_string_lossy().to_string(),
    exists,
    total_count: files.len(),
    total_size,
    files,
  })
}

pub fn open_crash_dumps_folder() -> Result<(), Error> {
  log::info!("Opening crash dumps folder");

  let dir = get_crash_dumps_dir()?;

  if !dir.exists() {
    return Err(Error::InvalidInput(
      "Crash dumps directory does not exist. Game may not have crashed yet.".to_string(),
    ));
  }

  let parsed_dir = dir.join("parsed");
  if !parsed_dir.exists() {
    std::fs::create_dir_all(&parsed_dir)
      .map_err(|e| Error::InvalidInput(format!("Failed to create parsed folder: {e}")))?;
  }

  let files = find_deadlock_crash_dumps(&dir);
  for file in &files {
    let dmp_path = Path::new(&file.path);
    let file_stem = dmp_path.file_stem().unwrap_or_default().to_string_lossy();
    let txt_path = parsed_dir.join(format!("{file_stem}.txt"));

    if !txt_path.exists()
      && let Err(e) = parse_and_save_dmp(dmp_path, &parsed_dir)
    {
      log::warn!("Failed to parse crash dump: {e}");
    }
  }

  utils::show_in_folder(parsed_dir.to_string_lossy().as_ref())
}

pub fn parse_crash_dump(file_path: &str) -> Result<String, Error> {
  log::info!("Parsing crash dump: {file_path}");

  let path = Path::new(file_path);
  if !path.exists() {
    return Err(Error::InvalidInput(format!("File not found: {file_path}")));
  }

  let options = dmp_parser::DmpParseOptions {
    include_modules: true,
    include_threads: true,
    max_modules: Some(30),
  };

  match dmp_parser::DmpParser::parse_file(path, options) {
    Ok(parsed) => Ok(parsed.raw_text),
    Err(e) => Err(Error::InvalidInput(format!(
      "Failed to parse crash dump: {e}"
    ))),
  }
}

pub fn parse_latest_crash_dump() -> Result<String, Error> {
  log::info!("Parsing latest crash dump");

  let dir = get_crash_dumps_dir()?;

  if !dir.exists() {
    return Err(Error::InvalidInput(
      "Crash dumps directory does not exist".to_string(),
    ));
  }

  let files = find_deadlock_crash_dumps(&dir);
  let latest = files
    .first()
    .ok_or_else(|| Error::InvalidInput("No Deadlock crash dumps found".to_string()))?;

  let options = dmp_parser::DmpParseOptions {
    include_modules: true,
    include_threads: true,
    max_modules: Some(30),
  };

  match dmp_parser::DmpParser::parse_file(Path::new(&latest.path), options) {
    Ok(parsed) => Ok(parsed.raw_text),
    Err(e) => Err(Error::InvalidInput(format!(
      "Failed to parse crash dump: {e}"
    ))),
  }
}

pub fn open_latest_crash_dump_parsed() -> Result<(), Error> {
  log::info!("Opening latest crash dump parsed");

  let dir = get_crash_dumps_dir()?;

  if !dir.exists() {
    return Err(Error::InvalidInput(
      "Crash dumps directory does not exist".to_string(),
    ));
  }

  let files = find_deadlock_crash_dumps(&dir);
  let latest = files
    .first()
    .ok_or_else(|| Error::InvalidInput("No Deadlock crash dumps found".to_string()))?;

  let parsed_dir = dir.join("parsed");
  if !parsed_dir.exists() {
    std::fs::create_dir_all(&parsed_dir)
      .map_err(|e| Error::InvalidInput(format!("Failed to create parsed folder: {e}")))?;
  }

  let file_stem = Path::new(&latest.name)
    .file_stem()
    .unwrap_or_default()
    .to_string_lossy();
  let output_file = parsed_dir.join(format!("{file_stem}.txt"));

  if !output_file.exists() {
    let options = dmp_parser::DmpParseOptions {
      include_modules: true,
      include_threads: true,
      max_modules: Some(50),
    };

    let parsed = dmp_parser::DmpParser::parse_file(Path::new(&latest.path), options)
      .map_err(|e| Error::InvalidInput(format!("Failed to parse crash dump: {e}")))?;

    std::fs::write(&output_file, &parsed.raw_text)
      .map_err(|e| Error::InvalidInput(format!("Failed to write parsed output: {e}")))?;
  }

  utils::open_file_with_editor(output_file.to_string_lossy().as_ref())
}
