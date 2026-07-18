use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use crate::utils;
use log;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const AUTOEXEC_FILENAME: &str = "autoexec.cfg";
const MACHINE_CONVARS_FILENAME: &str = "machine_convars.vcfg";
const MANAGED_CROSSHAIR_CONVARS: &[&str] = &[
  "citadel_crosshair_color_r",
  "citadel_crosshair_color_g",
  "citadel_crosshair_color_b",
  "citadel_crosshair_pip_border",
  "citadel_crosshair_pip_gap_static",
  "citadel_crosshair_pip_opacity",
  "citadel_crosshair_pip_width",
  "citadel_crosshair_pip_height",
  "citadel_crosshair_pip_gap",
  "citadel_crosshair_dot_opacity",
  "citadel_crosshair_dot_outline_opacity",
];
const CROSSHAIR_SECTION_START: &str =
  "// === Deadlock Mod Manager - Crosshair Settings (DO NOT EDIT) ===";
const CROSSHAIR_SECTION_END: &str = "// === End Crosshair Settings ===";

const MAP_COMMAND_SECTION_START: &str =
  "// === Deadlock Mod Manager - Map Command (DO NOT EDIT) ===";
const MAP_COMMAND_SECTION_END: &str = "// === End Map Command ===";

#[derive(Debug, Clone, Copy)]
struct ManagedSection {
  label: &'static str,
  start_marker: &'static str,
  end_marker: &'static str,
}

const CROSSHAIR_SECTION: ManagedSection = ManagedSection {
  label: "crosshair",
  start_marker: CROSSHAIR_SECTION_START,
  end_marker: CROSSHAIR_SECTION_END,
};

const MAP_COMMAND_SECTION: ManagedSection = ManagedSection {
  label: "map command",
  start_marker: MAP_COMMAND_SECTION_START,
  end_marker: MAP_COMMAND_SECTION_END,
};

const MANAGED_SECTIONS: &[ManagedSection] = &[CROSSHAIR_SECTION, MAP_COMMAND_SECTION];

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

fn managed_section_for_content(content: &str) -> Option<ManagedSection> {
  MANAGED_SECTIONS
    .iter()
    .find(|section| content.starts_with(section.start_marker))
    .copied()
}

fn managed_section_for_line(line: &str) -> Option<ManagedSection> {
  MANAGED_SECTIONS
    .iter()
    .find(|section| line.contains(section.start_marker))
    .copied()
}

fn section_range(content: &str, section: ManagedSection) -> Option<(usize, usize)> {
  let start_pos = content.find(section.start_marker)?;
  let rel_end = content[start_pos..].find(section.end_marker)?;
  let end_pos = start_pos + rel_end + section.end_marker.len();
  Some((start_pos, end_pos))
}

fn append_section(content: &mut String, section_content: &str) {
  if !content.is_empty() && !content.ends_with('\n') {
    content.push('\n');
  }
  content.push_str(section_content);
}

fn upsert_managed_section(
  content: &mut String,
  section: ManagedSection,
  section_content: &str,
) {
  if let Some((start_pos, end_pos)) = section_range(content, section) {
    content.replace_range(start_pos..end_pos, section_content);
    return;
  }

  if let Some(start_pos) = content.find(section.start_marker) {
    log::warn!(
      "Found {} start marker but not end marker, replacing from start marker",
      section.label
    );
    content.replace_range(start_pos.., section_content);
    return;
  }

  append_section(content, section_content);
}

fn remove_managed_section(content: &mut String, section: ManagedSection) {
  if let Some((start_pos, end_pos)) = section_range(content, section) {
    let before_section = content[..start_pos].trim_end();
    let after_section = content[end_pos..].trim_start();

    let mut new_content = String::new();
    if !before_section.is_empty() {
      new_content.push_str(before_section);
    }
    if !after_section.is_empty() {
      append_section(&mut new_content, after_section);
    }

    *content = new_content;
    return;
  }

  if let Some(start_pos) = content.find(section.start_marker) {
    log::warn!(
      "Found {} start marker but not end marker, removing from start marker to end",
      section.label
    );
    content.truncate(start_pos);
    *content = content.trim_end().to_string();
    return;
  }

  log::info!("{} section not found, nothing to remove", section.label);
}

fn without_managed_crosshair_convars(content: &str) -> Result<Option<String>, Error> {
  let mut config = keyvalues_parser::parse(content)
    .map(keyvalues_parser::Vdf::from)
    .map_err(|error| Error::CrosshairConfigResetFailed(error.to_string()))?;
  let convars = config
    .value
    .get_mut_obj()
    .and_then(|root| root.get_mut("convars"))
    .and_then(|values| values.first_mut())
    .and_then(keyvalues_parser::Value::get_mut_obj)
    .ok_or_else(|| {
      Error::CrosshairConfigResetFailed(
        "machine_convars.vcfg does not contain a convars object".to_string(),
      )
    })?;

  let removed_count = MANAGED_CROSSHAIR_CONVARS
    .iter()
    .filter(|name| convars.remove(**name).is_some())
    .count();

  if removed_count == 0 {
    return Ok(None);
  }

  log::info!("Removed {removed_count} persisted crosshair convars");
  Ok(Some(format!("{config}\n")))
}

fn merge_readonly_sections_into_full_content(
  full_content: &str,
  readonly_sections: &[ReadonlySection],
) -> String {
  let mut result_content = full_content.to_string();

  for readonly_section in readonly_sections {
    let Some(section) = managed_section_for_content(&readonly_section.content) else {
      log::warn!("Readonly section does not start with a known managed marker; skipping merge");
      continue;
    };

    if !result_content.contains(section.start_marker) {
      log::info!("Readonly section not found in content, restoring it");
    }

    upsert_managed_section(&mut result_content, section, &readonly_section.content);
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

  fn get_machine_convars_path(&self, game_path: &Path) -> PathBuf {
    game_path
      .join("game")
      .join("citadel")
      .join("cfg")
      .join(MACHINE_CONVARS_FILENAME)
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
    let mut active_readonly_section: Option<ManagedSection> = None;
    let mut readonly_start = 0;
    let mut readonly_lines = Vec::new();

    for (line_num, line) in lines.iter().enumerate() {
      if let Some(section) = managed_section_for_line(line) {
        active_readonly_section = Some(section);
        readonly_start = line_num;
        readonly_lines.clear();
        readonly_lines.push(*line);
      } else if let Some(section) = active_readonly_section {
        readonly_lines.push(*line);
        if line.contains(section.end_marker) {
          readonly_sections.push(ReadonlySection {
            start_line: readonly_start,
            end_line: line_num,
            content: readonly_lines.join("\n"),
          });
          readonly_lines.clear();
          active_readonly_section = None;
        }
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
  ) -> Result<AutoexecConfig, Error> {
    let result_content = merge_readonly_sections_into_full_content(full_content, readonly_sections);
    self.write_autoexec_config(game_path, &result_content)?;
    self.get_editable_content(game_path)
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

    upsert_managed_section(&mut content, CROSSHAIR_SECTION, &crosshair_section);

    self.write_autoexec_config(game_path, &content)
  }

  pub fn remove_crosshair_section(&self, game_path: &Path) -> Result<(), Error> {
    let mut content = self.read_autoexec_config(game_path)?;

    remove_managed_section(&mut content, CROSSHAIR_SECTION);

    self.write_autoexec_config(game_path, &content)
  }

  pub fn disable_custom_crosshairs(&self, game_path: &Path) -> Result<(), Error> {
    let machine_convars_path = self.get_machine_convars_path(game_path);
    let reset_machine_convars = if machine_convars_path.exists() {
      let content = fs::read_to_string(&machine_convars_path).map_err(|error| {
        Error::CrosshairConfigResetFailed(format!(
          "Failed to read {}: {error}",
          machine_convars_path.display()
        ))
      })?;
      without_managed_crosshair_convars(&content)?
    } else {
      None
    };

    let mut autoexec_content = self.read_autoexec_config(game_path)?;
    remove_managed_section(&mut autoexec_content, CROSSHAIR_SECTION);

    if let Some(content) = reset_machine_convars {
      fs::write(&machine_convars_path, content).map_err(|error| {
        Error::CrosshairConfigResetFailed(format!(
          "Failed to write {}: {error}",
          machine_convars_path.display()
        ))
      })?;
    }

    self.write_autoexec_config(game_path, &autoexec_content)
  }

  pub fn add_map_command(&self, game_path: &Path, map_name: &str) -> Result<(), Error> {
    let mut content = self.read_autoexec_config(game_path)?;
    let map_section = format!(
      "{}\nmap {}\n{}",
      MAP_COMMAND_SECTION_START, map_name, MAP_COMMAND_SECTION_END
    );

    upsert_managed_section(&mut content, MAP_COMMAND_SECTION, &map_section);

    self.write_autoexec_config(game_path, &content)
  }

  pub fn remove_map_command(&self, game_path: &Path) -> Result<(), Error> {
    let mut content = self.read_autoexec_config(game_path)?;

    remove_managed_section(&mut content, MAP_COMMAND_SECTION);

    self.write_autoexec_config(game_path, &content)
  }

  pub fn get_map_command(&self, game_path: &Path) -> Result<Option<String>, Error> {
    let content = self.read_autoexec_config(game_path)?;

    if let Some((start_pos, end_pos)) = section_range(&content, MAP_COMMAND_SECTION) {
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

  fn unique_test_game_path(test_name: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .expect("system clock should be after unix epoch")
      .as_nanos();

    std::env::temp_dir().join(format!("dmm_autoexec_{test_name}_{nanos}"))
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

  #[test]
  fn update_editable_content_returns_restored_readonly_content() {
    let manager = AutoexecManager::new();
    let game_path = unique_test_game_path("returns_restored_readonly_content");
    let map = map_section("streetball");
    let sections = vec![section_readonly(&map)];

    let returned = manager
      .update_editable_content(&game_path, "", &sections)
      .expect("autoexec update should succeed");
    let written = std::fs::read_to_string(manager.get_autoexec_path(&game_path))
      .expect("autoexec should be written");

    assert!(returned.full_content.contains(MAP_COMMAND_SECTION_START));
    assert!(returned.full_content.contains("map streetball"));
    assert_eq!(written, returned.full_content);

    std::fs::remove_dir_all(&game_path).expect("temp game path should be removed");
  }

  #[test]
  fn disable_custom_crosshairs_removes_persisted_values_and_autoexec_section() {
    let manager = AutoexecManager::new();
    let game_path = unique_test_game_path("disable_custom_crosshairs");
    let cfg_path = game_path.join("game").join("citadel").join("cfg");
    std::fs::create_dir_all(&cfg_path).expect("cfg directory should be created");
    std::fs::write(
      cfg_path.join(MACHINE_CONVARS_FILENAME),
      r#""config"
{
	"convars"
	{
		"citadel_crosshair_color_r"		"255"
		"citadel_crosshair_pip_gap"		"-8"
		"unrelated_setting"		"keep"
	}
}
"#,
    )
    .expect("machine convars should be written");
    std::fs::write(
      manager.get_autoexec_path(&game_path),
      format!("echo keep\n{}", crosshair_section()),
    )
    .expect("autoexec should be written");

    manager
      .disable_custom_crosshairs(&game_path)
      .expect("crosshairs should be disabled");

    let machine_convars = std::fs::read_to_string(cfg_path.join(MACHINE_CONVARS_FILENAME))
      .expect("machine convars should be readable");
    assert!(!machine_convars.contains("citadel_crosshair_color_r"));
    assert!(!machine_convars.contains("citadel_crosshair_pip_gap"));
    assert!(machine_convars.contains("unrelated_setting"));
    assert!(machine_convars.contains("keep"));

    let autoexec = std::fs::read_to_string(manager.get_autoexec_path(&game_path))
      .expect("autoexec should be readable");
    assert_eq!(autoexec, "echo keep");

    std::fs::remove_dir_all(&game_path).expect("temp game path should be removed");
  }

  #[test]
  fn disable_custom_crosshairs_does_not_change_autoexec_when_convars_are_invalid() {
    let manager = AutoexecManager::new();
    let game_path = unique_test_game_path("invalid_machine_convars");
    let cfg_path = game_path.join("game").join("citadel").join("cfg");
    std::fs::create_dir_all(&cfg_path).expect("cfg directory should be created");
    std::fs::write(cfg_path.join(MACHINE_CONVARS_FILENAME), "invalid {")
      .expect("invalid machine convars should be written");
    let original_autoexec = crosshair_section();
    std::fs::write(manager.get_autoexec_path(&game_path), &original_autoexec)
      .expect("autoexec should be written");

    let result = manager.disable_custom_crosshairs(&game_path);

    assert!(matches!(result, Err(Error::CrosshairConfigResetFailed(_))));
    let autoexec = std::fs::read_to_string(manager.get_autoexec_path(&game_path))
      .expect("autoexec should be readable");
    assert_eq!(autoexec, original_autoexec);

    std::fs::remove_dir_all(&game_path).expect("temp game path should be removed");
  }
}
