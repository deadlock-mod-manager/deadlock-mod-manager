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

const MAP_COMMAND_SECTION_START: &str =
  "// === Deadlock Mod Manager - Map Command (DO NOT EDIT) ===";
const MAP_COMMAND_SECTION_END: &str = "// === End Map Command ===";

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

/// Merges managed readonly sections back into user-edited full content. Used by
/// [`AutoexecManager::update_editable_content`] and unit tests.
fn merge_readonly_sections_into_full_content(
  full_content: &str,
  readonly_sections: &[ReadonlySection],
) -> String {
  let mut result_content = full_content.to_string();

  for readonly_section in readonly_sections.iter().rev() {
    let (start_marker, end_marker) = if readonly_section
      .content
      .starts_with(MAP_COMMAND_SECTION_START)
    {
      (MAP_COMMAND_SECTION_START, MAP_COMMAND_SECTION_END)
    } else if readonly_section
      .content
      .starts_with(CROSSHAIR_SECTION_START)
    {
      (CROSSHAIR_SECTION_START, CROSSHAIR_SECTION_END)
    } else {
      log::warn!(
        "Readonly section does not start with a known managed marker; skipping merge for that section"
      );
      continue;
    };

    if let Some(start_pos) = result_content.find(start_marker) {
      if let Some(rel_end) = result_content[start_pos..].find(end_marker) {
        let end_pos = start_pos + rel_end + end_marker.len();
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

  result_content
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
      if line.contains(CROSSHAIR_SECTION_START) || line.contains(MAP_COMMAND_SECTION_START) {
        in_readonly_section = true;
        readonly_start = line_num;
        readonly_lines.clear();
        readonly_lines.push(*line);
      } else if line.contains(CROSSHAIR_SECTION_END) || line.contains(MAP_COMMAND_SECTION_END) {
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
    let result_content = merge_readonly_sections_into_full_content(full_content, readonly_sections);
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

  pub fn add_map_command(&self, game_path: &Path, map_name: &str) -> Result<(), Error> {
    let mut content = self.read_autoexec_config(game_path)?;
    let map_section = format!(
      "{}\nmap {}\n{}",
      MAP_COMMAND_SECTION_START, map_name, MAP_COMMAND_SECTION_END
    );

    if let Some(start_pos) = content.find(MAP_COMMAND_SECTION_START) {
      if let Some(end_pos) = content.find(MAP_COMMAND_SECTION_END) {
        let end_pos = end_pos + MAP_COMMAND_SECTION_END.len();
        content.replace_range(start_pos..end_pos, &map_section);
      } else {
        log::warn!("Found map command start marker but not end marker, appending section");
        content.push('\n');
        content.push_str(&map_section);
      }
    } else {
      if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
      }
      content.push_str(&map_section);
    }

    self.write_autoexec_config(game_path, &content)
  }

  pub fn remove_map_command(&self, game_path: &Path) -> Result<(), Error> {
    let mut content = self.read_autoexec_config(game_path)?;

    if let Some(start_pos) = content.find(MAP_COMMAND_SECTION_START) {
      if let Some(end_pos) = content.find(MAP_COMMAND_SECTION_END) {
        let end_pos = end_pos + MAP_COMMAND_SECTION_END.len();
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
        log::warn!(
          "Found map command start marker but not end marker, removing from start marker to end"
        );
        content.truncate(start_pos);
        content = content.trim_end().to_string();
      }
    } else {
      log::info!("Map command section not found, nothing to remove");
    }

    self.write_autoexec_config(game_path, &content)
  }

  pub fn get_map_command(&self, game_path: &Path) -> Result<Option<String>, Error> {
    let content = self.read_autoexec_config(game_path)?;

    if let Some(start_pos) = content.find(MAP_COMMAND_SECTION_START)
      && let Some(end_pos) = content.find(MAP_COMMAND_SECTION_END)
    {
      let section = &content[start_pos..end_pos];
      for line in section.lines() {
        let trimmed = line.trim();
        if let Some(name) = trimmed.strip_prefix("map ") {
          let name = name.trim();
          if !name.is_empty() {
            return Ok(Some(name.to_string()));
          }
        }
      }
    }

    for line in content.lines() {
      let trimmed = line.trim();
      if trimmed.starts_with("//") {
        continue;
      }
      if let Some(name) = trimmed.strip_prefix("map ") {
        let name = name.trim();
        if !name.is_empty() {
          return Ok(Some(name.to_string()));
        }
      }
    }

    Ok(None)
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

#[cfg(test)]
mod tests {
  use super::*;

  fn map_section(map_name: &str) -> String {
    format!(
      "{}\nmap {}\n{}",
      MAP_COMMAND_SECTION_START, map_name, MAP_COMMAND_SECTION_END
    )
  }

  fn crosshair_section_body() -> String {
    "cl_crosshaircolor 5".to_string()
  }

  fn crosshair_section() -> String {
    format!(
      "{}\n{}\n{}",
      CROSSHAIR_SECTION_START,
      crosshair_section_body(),
      CROSSHAIR_SECTION_END
    )
  }

  fn section_readonly(content: &str) -> ReadonlySection {
    ReadonlySection {
      start_line: 0,
      end_line: 0,
      content: content.to_string(),
    }
  }

  #[test]
  fn merge_map_only_idempotent_no_duplicate_on_second_pass() {
    let map = map_section("streetball");
    let full = format!("status\n{}", map);
    let sections = vec![section_readonly(&map)];

    let once = merge_readonly_sections_into_full_content(&full, &sections);
    assert_eq!(
      once.matches(MAP_COMMAND_SECTION_START).count(),
      1,
      "expected single map section"
    );

    let twice = merge_readonly_sections_into_full_content(&once, &sections);
    assert_eq!(
      twice.matches(MAP_COMMAND_SECTION_START).count(),
      1,
      "second merge must not append another map block"
    );
    assert_eq!(once, twice);
  }

  #[test]
  fn merge_crosshair_only_preserves_section() {
    let cross = crosshair_section();
    let full = format!("echo hi\n{}", cross);
    let sections = vec![section_readonly(&cross)];

    let out = merge_readonly_sections_into_full_content(&full, &sections);
    assert_eq!(out.matches(CROSSHAIR_SECTION_START).count(), 1);
    assert!(out.contains(crosshair_section_body().as_str()));
  }

  #[test]
  fn merge_crosshair_then_map_both_preserved() {
    let cross = crosshair_section();
    let map = map_section("arena");
    let full = format!("{}\n{}", cross, map);
    let sections = vec![section_readonly(&cross), section_readonly(&map)];

    let out = merge_readonly_sections_into_full_content(&full, &sections);
    assert_eq!(out.matches(CROSSHAIR_SECTION_START).count(), 1);
    assert_eq!(out.matches(MAP_COMMAND_SECTION_START).count(), 1);
    assert!(out.contains("cl_crosshaircolor 5"));
    assert!(out.contains("map arena"));
  }

  #[test]
  fn merge_restores_map_when_markers_removed_from_user_content() {
    let map = map_section("streetball");
    let full_user = "only user lines\n";
    let sections = vec![section_readonly(&map)];

    let out = merge_readonly_sections_into_full_content(full_user, &sections);
    assert!(out.contains(MAP_COMMAND_SECTION_START));
    assert!(out.contains("map streetball"));
    assert_eq!(out.matches(MAP_COMMAND_SECTION_START).count(), 1);
  }
}
