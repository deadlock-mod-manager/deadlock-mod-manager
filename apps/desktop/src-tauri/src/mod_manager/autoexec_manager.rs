use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use crate::utils;
use log;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const AUTOEXEC_FILENAME: &str = "autoexec.cfg";
const CROSSHAIR_SECTION_START: &str =
  "// === Deadlock Mod Manager - Crosshair Settings (DO NOT EDIT) ===";
const CROSSHAIR_SECTION_END: &str = "// === End Crosshair Settings ===";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadonlySection {
  pub start_line: usize,
  pub end_line: usize,
  pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoexecConfig {
  pub full_content: String,
  pub editable_content: String,
  pub readonly_sections: Vec<ReadonlySection>,
}

pub struct AutoexecManager {
  filesystem: FileSystemHelper,
}

impl AutoexecManager {
  pub fn new() -> Self {
    Self {
      filesystem: FileSystemHelper::new(),
    }
  }

  pub fn get_autoexec_path(&self, game_path: &Path) -> PathBuf {
    game_path
      .join("game")
      .join("citadel")
      .join("cfg")
      .join(AUTOEXEC_FILENAME)
  }

  pub fn read_autoexec_config(&self, game_path: &Path) -> Result<String, Error> {
    let autoexec_path = self.get_autoexec_path(game_path);

    if !autoexec_path.exists() {
      log::info!("Autoexec config file does not exist, creating empty file: {autoexec_path:?}");
      if let Some(parent) = autoexec_path.parent() {
        self.filesystem.create_directories(parent)?;
      }
      fs::write(&autoexec_path, "")
        .map_err(|e| Error::AutoexecWriteFailed(format!("Failed to create autoexec file: {e}")))?;
      return Ok(String::new());
    }

    fs::read_to_string(&autoexec_path)
      .map_err(|e| Error::AutoexecReadFailed(format!("Failed to read autoexec file: {e}")))
  }

  pub fn write_autoexec_config(&self, game_path: &Path, content: &str) -> Result<(), Error> {
    let autoexec_path = self.get_autoexec_path(game_path);

    if let Some(parent) = autoexec_path.parent() {
      self.filesystem.create_directories(parent)?;
    }

    log::info!("Writing autoexec config to: {autoexec_path:?}");
    fs::write(&autoexec_path, content)
      .map_err(|e| Error::AutoexecWriteFailed(format!("Failed to write autoexec file: {e}")))?;
    Ok(())
  }

  pub fn get_editable_content(&self, game_path: &Path) -> Result<AutoexecConfig, Error> {
    let full_content = self.read_autoexec_config(game_path)?;
    let lines: Vec<&str> = full_content.lines().collect();
    let mut readonly_sections = Vec::new();
    let mut editable_lines = Vec::new();
    let mut in_readonly_section = false;
    let mut readonly_start = 0;
    let mut readonly_lines = Vec::new();

    for (line_num, line) in lines.iter().enumerate() {
      if line.contains(CROSSHAIR_SECTION_START) {
        in_readonly_section = true;
        readonly_start = line_num;
        readonly_lines.clear();
        readonly_lines.push(*line);
      } else if line.contains(CROSSHAIR_SECTION_END) {
        if in_readonly_section {
          readonly_lines.push(*line);
          readonly_sections.push(ReadonlySection {
            start_line: readonly_start,
            end_line: line_num,
            content: readonly_lines.join("\n"),
          });
          readonly_lines.clear();
          in_readonly_section = false;
        }
      } else if in_readonly_section {
        readonly_lines.push(*line);
      } else {
        editable_lines.push(*line);
      }
    }

    let editable_content = editable_lines.join("\n");
    Ok(AutoexecConfig {
      full_content: full_content.clone(),
      editable_content,
      readonly_sections,
    })
  }

  pub fn update_editable_content(
    &self,
    game_path: &Path,
    full_content: &str,
    readonly_sections: &[ReadonlySection],
  ) -> Result<(), Error> {
    let mut result_content = full_content.to_string();

    for readonly_section in readonly_sections.iter().rev() {
      if let Some(start_pos) = result_content.find(CROSSHAIR_SECTION_START) {
        if let Some(end_pos) = result_content[start_pos..].find(CROSSHAIR_SECTION_END) {
          let end_pos = start_pos + end_pos + CROSSHAIR_SECTION_END.len();
          let current_section = &result_content[start_pos..end_pos];
          if current_section != readonly_section.content {
            result_content.replace_range(start_pos..end_pos, &readonly_section.content);
          }
        } else {
          log::warn!("Found start marker but not end marker, restoring readonly section");
          result_content.replace_range(start_pos.., &readonly_section.content);
        }
      } else {
        log::info!("Readonly section not found in content, restoring it");
        if !result_content.is_empty() && !result_content.ends_with('\n') {
          result_content.push('\n');
        }
        result_content.push_str(&readonly_section.content);
      }
    }

    self.write_autoexec_config(game_path, &result_content)
  }

  pub fn update_crosshair_section(
    &self,
    game_path: &Path,
    crosshair_config: &str,
  ) -> Result<(), Error> {
    let mut content = self.read_autoexec_config(game_path)?;
    let crosshair_section = format!(
      "{}\n{}\n{}",
      CROSSHAIR_SECTION_START, crosshair_config, CROSSHAIR_SECTION_END
    );

    if let Some(start_pos) = content.find(CROSSHAIR_SECTION_START) {
      if let Some(end_pos) = content.find(CROSSHAIR_SECTION_END) {
        let end_pos = end_pos + CROSSHAIR_SECTION_END.len();
        content.replace_range(start_pos..end_pos, &crosshair_section);
      } else {
        log::warn!("Found start marker but not end marker, appending section");
        content.push('\n');
        content.push_str(&crosshair_section);
      }
    } else {
      if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
      }
      content.push_str(&crosshair_section);
    }

    self.write_autoexec_config(game_path, &content)
  }

  pub fn remove_crosshair_section(&self, game_path: &Path) -> Result<(), Error> {
    let mut content = self.read_autoexec_config(game_path)?;

    if let Some(start_pos) = content.find(CROSSHAIR_SECTION_START) {
      if let Some(end_pos) = content.find(CROSSHAIR_SECTION_END) {
        let end_pos = end_pos + CROSSHAIR_SECTION_END.len();
        let before_section = content[..start_pos].trim_end();
        let after_section = content[end_pos..].trim_start();

        let mut new_content = String::new();
        if !before_section.is_empty() {
          new_content.push_str(before_section);
        }
        if !after_section.is_empty() {
          if !new_content.is_empty() && !new_content.ends_with('\n') {
            new_content.push('\n');
          }
          new_content.push_str(after_section);
        }

        content = new_content;
      } else {
        log::warn!("Found start marker but not end marker, removing from start marker to end");
        content.truncate(start_pos);
        content = content.trim_end().to_string();
      }
    } else {
      log::info!("Crosshair section not found, nothing to remove");
    }

    self.write_autoexec_config(game_path, &content)
  }

  pub fn open_autoexec_folder(&self, game_path: &Path) -> Result<(), Error> {
    let autoexec_path = self.get_autoexec_path(game_path);
    if let Some(parent) = autoexec_path.parent() {
      utils::show_in_folder(parent.to_string_lossy().as_ref())
    } else {
      Err(Error::InvalidInput("Invalid autoexec path".to_string()))
    }
  }

  pub fn open_autoexec_editor(&self, game_path: &Path) -> Result<(), Error> {
    let autoexec_path = self.get_autoexec_path(game_path);

    if !autoexec_path.exists() {
      self.read_autoexec_config(game_path)?;
    }

    utils::open_file_with_editor(autoexec_path.to_string_lossy().as_ref())
  }
}

impl Default for AutoexecManager {
  fn default() -> Self {
    Self::new()
  }
}
