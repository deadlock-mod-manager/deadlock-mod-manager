use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

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

    // Try name ID 4 (Full Name) first, then 1 (Family Name)
    for target_id in [4u16, 1u16] {
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
