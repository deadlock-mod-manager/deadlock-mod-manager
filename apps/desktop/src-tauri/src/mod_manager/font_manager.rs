use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::fs;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use vpk_parser::{VpkParseOptions, VpkParser};

const VPK_SIGNATURE: u32 = 0x55aa1234;

const FONTS_CONF_SECTION_START: &str = "<!-- [DEADLOCK-MOD-MANAGER-FONTS-START:";
const FONTS_CONF_SECTION_END: &str = "<!-- [DEADLOCK-MOD-MANAGER-FONTS-END:";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontInfo {
  pub file_name: String,
  pub font_name: String,
}

pub struct FontManager;

impl FontManager {
  pub fn new() -> Self {
    Self
  }

  /// Scan extracted directory for .ttf files located under any `panorama/fonts/` path
  pub fn scan_for_fonts(&self, extracted_dir: &Path) -> Vec<PathBuf> {
    let mut result = Vec::new();
    self.walk_for_fonts(extracted_dir, extracted_dir, &mut result);
    result
  }

  fn walk_for_fonts(&self, dir: &Path, base: &Path, result: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
      return;
    };
    for entry in entries.flatten() {
      let path = entry.path();
      if path.is_dir() {
        self.walk_for_fonts(&path, base, result);
      } else if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("ttf"))
        == Some(true)
        && is_under_panorama_fonts(&path, base) {
          result.push(path);
        }
    }
  }

  /// Parse the actual font name from the TTF name table (full name, then family, then filename)
  pub fn get_font_name(&self, ttf_path: &Path) -> String {
    let fallback = ttf_path
      .file_stem()
      .and_then(|s| s.to_str())
      .unwrap_or("Unknown Font")
      .to_string();

    let Ok(data) = fs::read(ttf_path) else {
      return fallback;
    };

    let Ok(face) = ttf_parser::Face::parse(&data, 0) else {
      return fallback;
    };

    // Try name ID 1 (Family Name) first, then 4 (Full Name) as fallback
    for target_id in [1u16, 4u16] {
      for name in face.names() {
        if name.name_id == target_id
          && let Some(s) = name.to_string() {
            let trimmed = s.trim().to_string();
            if !trimmed.is_empty() {
              return trimmed;
            }
          }
      }
    }

    fallback
  }

  /// Copy fonts to a stash dir within the mod's cache folder, returning FontInfo for each
  pub fn stash_fonts(&self, fonts: &[PathBuf], stash_dir: &Path) -> Result<Vec<FontInfo>, Error> {
    fs::create_dir_all(stash_dir)?;

    let mut infos = Vec::new();
    for font_path in fonts {
      let file_name = font_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| Error::InvalidInput("Font file has no name".into()))?
        .to_string();

      let dest = stash_dir.join(&file_name);
      fs::copy(font_path, &dest)?;

      let font_name = self.get_font_name(font_path);
      log::info!("Stashed font: {file_name} -> \"{font_name}\"");
      infos.push(FontInfo { file_name, font_name });
    }

    Ok(infos)
  }

  /// Copy stashed fonts from the mod's cache to the game's panorama/fonts directory
  pub fn install_fonts(
    &self,
    stash_dir: &Path,
    game_fonts_dir: &Path,
  ) -> Result<Vec<FontInfo>, Error> {
    if !stash_dir.exists() {
      return Err(Error::ModFileNotFound);
    }

    fs::create_dir_all(game_fonts_dir)?;

    let mut installed = Vec::new();
    for entry in fs::read_dir(stash_dir)? {
      let entry = entry?;
      let path = entry.path();
      if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("ttf"))
        != Some(true)
      {
        continue;
      }

      let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| Error::InvalidInput("Font file has no name".into()))?
        .to_string();

      let dest = game_fonts_dir.join(&file_name);
      fs::copy(&path, &dest)?;
      log::info!("Installed font: {file_name} -> {dest:?}");

      let font_name = self.get_font_name(&path);
      installed.push(FontInfo { file_name, font_name });
    }

    Ok(installed)
  }

  /// Add fontpattern entries to fonts.conf, tagged with the mod_id so they can be removed later
  pub fn patch_fonts_conf(
    &self,
    conf_path: &Path,
    mod_id: &str,
    font_infos: &[FontInfo],
  ) -> Result<(), Error> {
    let mut content = fs::read_to_string(conf_path)
      .map_err(|e| Error::InvalidInput(format!("Failed to read fonts.conf: {e}")))?;

    // Remove any existing section for this mod first (idempotent)
    content = self.remove_section(&content, mod_id);

    let patterns: String = font_infos
      .iter()
      .map(|f| format!("        <fontpattern>{}</fontpattern>", f.font_name))
      .collect::<Vec<_>>()
      .join("\n");

    let section = format!(
      "\n        {start} {mod_id} -->\n{patterns}\n        {end} {mod_id} -->",
      start = FONTS_CONF_SECTION_START,
      end = FONTS_CONF_SECTION_END,
    );

    // Insert after the last existing <fontpattern> line so the entries stay within
    // the fontpattern block and before the <cachedir> / <match> rules below it.
    // Fall back to inserting before </fontconfig> if no fontpattern exists yet.
    let insert_pos = content
      .rfind("</fontpattern>")
      .map(|pos| pos + "</fontpattern>".len())
      .or_else(|| content.rfind("</fontconfig>"))
      .unwrap_or(content.len());

    content.insert_str(insert_pos, &section);

    fs::write(conf_path, &content)
      .map_err(|e| Error::InvalidInput(format!("Failed to write fonts.conf: {e}")))?;

    log::info!("Patched fonts.conf for mod {mod_id} with {} font(s)", font_infos.len());
    Ok(())
  }

  /// Remove fontpattern entries previously added for a mod
  pub fn remove_font_patterns(&self, conf_path: &Path, mod_id: &str) -> Result<(), Error> {
    if !conf_path.exists() {
      return Ok(());
    }

    let content = fs::read_to_string(conf_path)
      .map_err(|e| Error::InvalidInput(format!("Failed to read fonts.conf: {e}")))?;

    let new_content = self.remove_section(&content, mod_id);

    if new_content != content {
      fs::write(conf_path, &new_content)
        .map_err(|e| Error::InvalidInput(format!("Failed to write fonts.conf: {e}")))?;
      log::info!("Removed font patterns for mod {mod_id} from fonts.conf");
    }

    Ok(())
  }

  fn remove_section(&self, content: &str, mod_id: &str) -> String {
    let start_marker = format!("{} {} -->", FONTS_CONF_SECTION_START, mod_id);
    let end_marker = format!("{} {} -->", FONTS_CONF_SECTION_END, mod_id);

    let Some(start_pos) = content.find(&start_marker) else {
      return content.to_string();
    };

    // Walk back to find the newline before the start marker
    let section_start = content[..start_pos].rfind('\n').map(|i| i + 1).unwrap_or(start_pos);

    let Some(end_pos) = content.find(&end_marker) else {
      return content.to_string();
    };

    let section_end = end_pos + end_marker.len();

    // Consume the trailing newline if present
    let section_end = if content.as_bytes().get(section_end) == Some(&b'\n') {
      section_end + 1
    } else {
      section_end
    };

    format!("{}{}", &content[..section_start], &content[section_end..])
  }

  /// Remove the stash directory for a mod
  pub fn discard_stash(&self, stash_dir: &Path) -> Result<(), Error> {
    if stash_dir.exists() {
      fs::remove_dir_all(stash_dir)?;
      log::info!("Discarded font stash: {stash_dir:?}");
    }
    Ok(())
  }

  pub fn list_stashed_font_file_names(&self, stash_dir: &Path) -> Result<Vec<String>, Error> {
    if !stash_dir.exists() {
      return Ok(Vec::new());
    }

    let mut file_names = Vec::new();
    for entry in fs::read_dir(stash_dir)? {
      let entry = entry?;
      let path = entry.path();
      if path.extension() != Some(OsStr::new("ttf")) {
        continue;
      }

      let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        continue;
      };

      file_names.push(file_name.to_string());
    }

    Ok(file_names)
  }

  pub fn remove_installed_fonts(
    &self,
    game_fonts_dir: &Path,
    font_file_names: &[String],
  ) -> Result<(), Error> {
    if !game_fonts_dir.exists() {
      return Ok(());
    }

    for file_name in font_file_names {
      let font_path = game_fonts_dir.join(file_name);
      if font_path.exists() {
        fs::remove_file(&font_path)?;
        log::info!("Removed installed font: {font_path:?}");
      }
    }

    Ok(())
  }

  /// Parse a single VPK dir file and extract any TTF fonts packed under `panorama/fonts/`.
  /// Returns `(filename, bytes)` pairs for each font found.
  pub fn extract_fonts_from_vpk(&self, vpk_path: &Path) -> Vec<(String, Vec<u8>)> {
    let buffer = match fs::read(vpk_path) {
      Ok(b) => b,
      Err(e) => {
        log::warn!("Font scan: failed to read VPK {:?}: {e}", vpk_path);
        return vec![];
      }
    };

    if buffer.len() < 12 {
      return vec![];
    }

    let sig = u32::from_le_bytes(buffer[0..4].try_into().unwrap_or_default());
    if sig != VPK_SIGNATURE {
      return vec![];
    }

    let version = u32::from_le_bytes(buffer[4..8].try_into().unwrap_or_default());
    let tree_length = u32::from_le_bytes(buffer[8..12].try_into().unwrap_or_default()) as usize;
    let tree_start: usize = if version >= 2 { 28 } else { 12 };
    let data_section_start = tree_start + tree_length;

    let options = VpkParseOptions {
      include_entries: true,
      include_full_file_hash: false,
      file_path: vpk_path.to_string_lossy().to_string(),
      last_modified: None,
      include_merkle: false,
    };

    let parsed = match VpkParser::parse(buffer.clone(), options) {
      Ok(p) => p,
      Err(e) => {
        log::warn!("Font scan: failed to parse VPK {:?}: {e}", vpk_path);
        return vec![];
      }
    };

    let mut result = Vec::new();

    for entry in &parsed.entries {
      // Only care about TTF files inside panorama/fonts/
      if !entry.ext.eq_ignore_ascii_case("ttf") {
        continue;
      }
      let path_lower = entry.path.to_lowercase();
      if !path_lower.contains("panorama") || !path_lower.contains("fonts") {
        continue;
      }

      let file_name = format!("{}.{}", entry.filename, entry.ext);
      let mut font_bytes: Vec<u8> = Vec::new();

      if entry.entry_length > 0 {
        if entry.archive_index == 0x7fff {
          // Inline in the dir file
          let start = data_section_start + entry.entry_offset as usize;
          let end = start + entry.entry_length as usize;
          if end <= buffer.len() {
            font_bytes.extend_from_slice(&buffer[start..end]);
          } else {
            log::warn!(
              "Font scan: VPK entry out of bounds for \"{}\" in {:?}",
              entry.full_path,
              vpk_path
            );
            continue;
          }
        } else {
          // In a companion archive file
          let stem = vpk_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");
          let base = stem.strip_suffix("_dir").unwrap_or(stem);
          let archive_name = format!("{base}_{:03}.vpk", entry.archive_index);
          let archive_path = vpk_path
            .parent()
            .unwrap_or(Path::new("."))
            .join(&archive_name);

          match fs::read(&archive_path) {
            Ok(archive_buf) => {
              let start = entry.entry_offset as usize;
              let end = start + entry.entry_length as usize;
              if end <= archive_buf.len() {
                font_bytes.extend_from_slice(&archive_buf[start..end]);
              } else {
                log::warn!(
                  "Font scan: archive entry out of bounds for \"{}\" in {:?}",
                  entry.full_path,
                  archive_path
                );
                continue;
              }
            }
            Err(e) => {
              log::warn!("Font scan: cannot read companion archive {:?}: {e}", archive_path);
              continue;
            }
          }
        }
      }

      if !font_bytes.is_empty() {
        log::info!("Font scan: found VPK-packed font: {file_name}");
        result.push((file_name, font_bytes));
      }
    }

    result
  }

  /// Scan all VPK files in `dir` (non-recursive) for packed TTF fonts.
  /// Returns `(filename, bytes)` pairs ready to be stashed.
  pub fn scan_vpks_for_fonts(&self, dir: &Path) -> Vec<(String, Vec<u8>)> {
    let Ok(entries) = fs::read_dir(dir) else {
      return vec![];
    };
    let mut result = Vec::new();
    for entry in entries.flatten() {
      let path = entry.path();
      if path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("vpk"))
        == Some(true)
      {
        result.extend(self.extract_fonts_from_vpk(&path));
      }
    }
    result
  }

  /// Stash in-memory font bytes into `stash_dir`, returning `FontInfo` for each.
  pub fn stash_font_bytes(
    &self,
    fonts: &[(String, Vec<u8>)],
    stash_dir: &Path,
  ) -> Result<Vec<FontInfo>, Error> {
    fs::create_dir_all(stash_dir)?;

    let mut infos = Vec::new();
    for (file_name, bytes) in fonts {
      let dest = stash_dir.join(file_name);
      fs::write(&dest, bytes)?;
      let font_name = self.get_font_name(&dest);
      log::info!("Stashed VPK font: {file_name} -> \"{font_name}\"");
      infos.push(FontInfo {
        file_name: file_name.clone(),
        font_name,
      });
    }

    Ok(infos)
  }
}

fn is_under_panorama_fonts(path: &Path, base: &Path) -> bool {
  let Ok(relative) = path.strip_prefix(base) else {
    return false;
  };

  let components: Vec<String> = relative
    .components()
    .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
    .collect();

  // Match consecutive "panorama" -> "fonts" components anywhere in the path
  components
    .windows(2)
    .any(|w| w[0] == "panorama" && w[1] == "fonts")
}

#[cfg(test)]
mod tests {
  use super::FontManager;
  use std::fs;

  #[test]
  fn lists_only_stashed_ttf_files() {
    let temp_dir = tempfile::tempdir().unwrap();
    let stash_dir = temp_dir.path().join("fonts");
    fs::create_dir_all(&stash_dir).unwrap();
    fs::write(stash_dir.join("kept.ttf"), b"font").unwrap();
    fs::write(stash_dir.join("ignored.txt"), b"note").unwrap();

    let file_names = FontManager::new()
      .list_stashed_font_file_names(&stash_dir)
      .unwrap();

    assert_eq!(file_names, vec!["kept.ttf"]);
  }

  #[test]
  fn removes_only_requested_installed_fonts() {
    let temp_dir = tempfile::tempdir().unwrap();
    let game_fonts_dir = temp_dir.path().join("game-fonts");
    fs::create_dir_all(&game_fonts_dir).unwrap();
    fs::write(game_fonts_dir.join("remove.ttf"), b"font").unwrap();
    fs::write(game_fonts_dir.join("keep.ttf"), b"font").unwrap();

    FontManager::new()
      .remove_installed_fonts(&game_fonts_dir, &["remove.ttf".to_string()])
      .unwrap();

    assert!(!game_fonts_dir.join("remove.ttf").exists());
    assert!(game_fonts_dir.join("keep.ttf").exists());
  }
}
