use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::errors::Error;
use crate::logs::crash_dumps;
use crate::utils;

#[derive(Debug, Serialize, Deserialize)]
pub struct LogFileInfo {
  pub name: String,
  pub path: String,
  pub size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LogInfo {
  pub log_dir: String,
  pub files: Vec<LogFileInfo>,
  pub total_size: u64,
}

pub async fn get_log_info(app_handle: &AppHandle) -> Result<LogInfo, Error> {
  log::info!("Getting log info");

  let log_dir = app_handle
    .path()
    .app_log_dir()
    .map_err(|e| Error::InvalidInput(format!("Failed to get log directory: {e}")))?;

  let mut files = Vec::new();
  let mut total_size = 0u64;

  if log_dir.exists()
    && let Ok(entries) = std::fs::read_dir(&log_dir)
  {
    for entry in entries.flatten() {
      let path = entry.path();
      if path.is_file()
        && let Some(name) = path.file_name()
      {
        let name_str = name.to_string_lossy().to_string();
        if name_str.starts_with("deadlock-mod-manager")
          && name_str.ends_with(".log")
          && let Ok(metadata) = std::fs::metadata(&path)
        {
          let size = metadata.len();
          total_size += size;
          files.push(LogFileInfo {
            name: name_str,
            path: path.to_string_lossy().to_string(),
            size,
          });
        }
      }
    }
  }

  files.sort_by(|a, b| a.name.cmp(&b.name));

  Ok(LogInfo {
    log_dir: log_dir.to_string_lossy().to_string(),
    files,
    total_size,
  })
}

pub fn open_logs_folder(app_handle: &AppHandle) -> Result<(), Error> {
  log::info!("Opening logs folder");

  let log_dir = app_handle
    .path()
    .app_log_dir()
    .map_err(|e| Error::InvalidInput(format!("Failed to get log directory: {e}")))?;

  if !log_dir.exists() {
    std::fs::create_dir_all(&log_dir)
      .map_err(|e| Error::InvalidInput(format!("Failed to create log directory: {e}")))?;
  }

  utils::show_in_folder(log_dir.to_string_lossy().as_ref())
}

pub fn open_log_file(app_handle: &AppHandle) -> Result<(), Error> {
  log::info!("Opening latest log file");

  let log_dir = app_handle
    .path()
    .app_log_dir()
    .map_err(|e| Error::InvalidInput(format!("Failed to get log directory: {e}")))?;

  let main_log = log_dir.join("deadlock-mod-manager.log");

  if !main_log.exists() {
    return Err(Error::InvalidInput("No log file found".to_string()));
  }

  utils::open_file_with_editor(main_log.to_string_lossy().as_ref())
}

pub async fn get_logs_for_ai(
  app_handle: &AppHandle,
  max_chars: usize,
  log_source: &str,
) -> Result<String, Error> {
  log::info!(
    "Getting logs for AI assistance (max {} chars, source: {})",
    max_chars,
    log_source
  );

  let mut output = String::new();
  let mut remaining_chars = max_chars;

  let include_dmm = log_source == "dmm" || log_source == "combined";
  let include_crash = log_source == "crash" || log_source == "combined";

  if include_dmm {
    let log_dir = app_handle
      .path()
      .app_log_dir()
      .map_err(|e| Error::InvalidInput(format!("Failed to get log directory: {e}")))?;

    let main_log = log_dir.join("deadlock-mod-manager.log");
    if main_log.exists()
      && let Ok(content) = std::fs::read_to_string(&main_log)
    {
      let header = "=== DEADLOCK MOD MANAGER LOG ===\n";
      output.push_str(header);
      remaining_chars = remaining_chars.saturating_sub(header.len());

      let char_limit = if include_crash {
        remaining_chars / 2
      } else {
        remaining_chars
      };

      let lines: Vec<&str> = content.lines().collect();
      let mut log_content = String::new();
      for line in lines.iter().rev() {
        let line_with_newline = format!("{}\n", line);
        if log_content.len() + line_with_newline.len() > char_limit {
          break;
        }
        log_content = line_with_newline + &log_content;
      }
      output.push_str(&log_content);
      remaining_chars = remaining_chars.saturating_sub(log_content.len());
      output.push('\n');
    }
  }

  if include_crash && let Ok(crash_dumps_dir) = crash_dumps::get_crash_dumps_dir() {
    let files = crash_dumps::find_deadlock_crash_dumps(&crash_dumps_dir);
    if let Some(latest) = files.first() {
      let options = dmp_parser::DmpParseOptions {
        include_modules: true,
        include_threads: true,
        max_modules: Some(20),
      };

      if let Ok(parsed) =
        dmp_parser::DmpParser::parse_file(std::path::Path::new(&latest.path), options)
      {
        let header = format!("=== CRASH DUMP ({}) ===\n", latest.name);
        output.push_str(&header);
        remaining_chars = remaining_chars.saturating_sub(header.len());

        let crash_content = if parsed.raw_text.len() > remaining_chars {
          parsed
            .raw_text
            .chars()
            .take(remaining_chars)
            .collect::<String>()
        } else {
          parsed.raw_text
        };

        output.push_str(&crash_content);
      }
    }
  }

  if output.is_empty() {
    return Err(Error::InvalidInput("No log files found".to_string()));
  }

  Ok(output)
}
