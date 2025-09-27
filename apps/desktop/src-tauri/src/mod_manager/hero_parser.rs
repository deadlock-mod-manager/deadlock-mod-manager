use crate::errors::Error;
use log;
use regex::Regex;
use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};
use vpk_parser::{VpkParseOptions, VpkParser};

pub struct HeroParser;

impl HeroParser {
  pub fn parse_heroes_from_vpk(file_path: &Path) -> Result<BTreeSet<String>, Error> {
    let file_name = file_path
      .file_name()
      .and_then(|n| n.to_str())
      .unwrap_or("unknown.vpk");

    log::info!("Parsing heroes from VPK: {}", file_name);

    let vpk_data = std::fs::read(file_path)?;

    let options = VpkParseOptions {
      include_full_file_hash: false,
      file_path: file_path.to_string_lossy().to_string(),
      last_modified: None,
      include_merkle: false,
      include_entries: true,
    };

    let parsed = VpkParser::parse(vpk_data, options)
      .map_err(|e| Error::InvalidInput(format!("Failed to parse VPK for hero detection: {}", e)))?;

    let mut heroes = BTreeSet::new();

    for entry in parsed.entries {
      let path = entry.full_path.to_lowercase().replace('\\', "/");
      if let Some(hero) = Self::extract_hero_from_path(&path) {
        heroes.insert(hero);
      }
    }

    if heroes.is_empty() {
      log::info!("No hero paths detected in VPK: {}", file_name);
    } else {
      log::info!("Detected heroes in {}: {}", file_name, heroes.iter().cloned().collect::<Vec<_>>().join(", "));
    }

    Ok(heroes)
  }

  pub fn parse_heroes_from_directory(dir: &Path) -> Result<BTreeSet<String>, Error> {
    log::info!("Scanning directory for VPK hero detection: {:?}", dir);
    let mut heroes = BTreeSet::new();

    let mut vpk_files = Vec::<PathBuf>::new();
    Self::collect_vpks_recursive(dir, &mut vpk_files)?;

    for vpk in vpk_files {
      match Self::parse_heroes_from_vpk(&vpk) {
        Ok(found) => {
          heroes.extend(found);
        }
        Err(e) => {
          log::warn!(
            "Failed to detect heroes in VPK {:?}: {}",
            vpk.file_name().unwrap_or_default(),
            e
          );
        }
      }
    }

    if heroes.is_empty() {
      log::info!("No hero paths detected in directory: {:?}", dir);
    } else {
      log::info!(
        "Detected heroes in directory {:?}: {}",
        dir,
        heroes.iter().cloned().collect::<Vec<_>>().join(", ")
      );
    }

    Ok(heroes)
  }

  pub fn parse_heroes_for_mod_download_dir(dir: &Path) -> Result<BTreeSet<String>, Error> {
    log::info!("Scanning mod download directory for hero detection: {:?}", dir);

    let extractor = ArchiveExtractor::new();
    let filesystem = FileSystemHelper::new();
    let mut heroes = BTreeSet::new();

    if !dir.exists() {
      return Ok(heroes);
    }

    for entry in std::fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_file() {
        if path.extension().and_then(|e| e.to_str()) == Some("vpk") {
          if let Ok(found) = Self::parse_heroes_from_vpk(&path) {
            heroes.extend(found);
          }
        } else if extractor.is_supported_archive(&path) {
          let temp_dir = tempfile::tempdir()?;
          log::info!(
            "Extracting archive for hero detection: {:?}",
            path.file_name().unwrap_or_default()
          );
          extractor.extract_archive(&path, temp_dir.path())?;
          let vpk_files = filesystem.find_files_recursive(temp_dir.path(), "vpk")?;
          for (vpk, _) in vpk_files {
            if let Ok(found) = Self::parse_heroes_from_vpk(&vpk) {
              heroes.extend(found);
            }
          }
        }
      }
    }

    if heroes.is_empty() {
      log::info!(
        "No hero paths detected in download directory: {:?}",
        dir
      );
    } else {
      log::info!(
        "Detected heroes in download directory {:?}: {}",
        dir,
        heroes.iter().cloned().collect::<Vec<_>>().join(", ")
      );
    }

    Ok(heroes)
  }

  fn collect_vpks_recursive(dir: &Path, acc: &mut Vec<PathBuf>) -> Result<(), Error> {
    if dir.is_dir() {
      for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
          Self::collect_vpks_recursive(&path, acc)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some("vpk") {
          acc.push(path);
        }
      }
    }
    Ok(())
  }

  fn extract_hero_from_path(path: &str) -> Option<String> {
    let patterns = [
      r"/(?:models/)?heroes_wip/([^/]+)/",
      r"/(?:models/)?heroes_staging/([^/]+)/",
      r"/(?:models/)?heroes/([^/]+)/",
    ];

    for pat in &patterns {
      let re = Regex::new(pat).ok()?;
      if let Some(caps) = re.captures(path) {
        if let Some(m) = caps.get(1) {
          let hero = m.as_str().to_lowercase();
          if Self::is_valid_hero_segment(&hero) {
            return Some(hero);
          }
        }
      }
    }
    None
  }

  fn is_valid_hero_segment(name: &str) -> bool {
    if name.is_empty() {
      return false;
    }
    let blacklist: HashSet<&'static str> = ["ui", "hero_names", "materials", "textures", "particles", "sounds", "audio", "items"].into_iter().collect();
    if blacklist.contains(name) {
      return false;
    }
    if name.len() < 2 || name.len() > 40 {
      return false;
    }
    if name.chars().all(|c| c.is_ascii_digit()) {
      return false;
    }
    if name.contains('.') {
      return false;
    }
    true
  }
}