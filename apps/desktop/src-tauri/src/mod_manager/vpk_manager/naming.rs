use super::*;

impl VpkManager {
  /// Count enabled `pak##_dir.vpk` files directly inside `dir` (non-recursive).
  pub fn count_enabled_vpks(dir: &Path) -> u32 {
    let Ok(entries) = fs::read_dir(dir) else {
      return 0;
    };
    entries
      .flatten()
      .filter(|entry| {
        let path = entry.path();
        path.is_file()
          && path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(Self::is_enabled_vpk_name)
      })
      .count() as u32
  }

  pub fn has_out_of_range_enabled_vpks(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
      return false;
    };
    entries.flatten().any(|entry| {
      entry
        .file_name()
        .to_str()
        .and_then(Self::enabled_vpk_number)
        .is_some_and(|number| number > shard::SHARD_CAPACITY)
    })
  }

  /// Extract mod ID from a prefixed VPK filename.
  pub fn extract_mod_id_from_prefix(filename: &str) -> Option<String> {
    if Self::is_enabled_vpk_name(filename) {
      return None;
    }

    if let Some(underscore_pos) = filename.find('_') {
      let potential_id = &filename[..underscore_pos];
      if !potential_id.is_empty()
        && (potential_id.chars().all(|c| c.is_ascii_digit()) || potential_id.starts_with("local-"))
      {
        return Some(potential_id.to_string());
      }
    }
    None
  }

  pub(super) fn is_enabled_vpk_name(filename: &str) -> bool {
    Self::enabled_vpk_number(filename).is_some()
  }

  pub(crate) fn enabled_vpk_number(filename: &str) -> Option<u32> {
    static ENABLED_VPK_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
      Regex::new(r"^pak(\d+)_dir\.vpk$").expect("enabled VPK regex must be valid")
    });

    ENABLED_VPK_PATTERN
      .captures(filename)?
      .get(1)?
      .as_str()
      .parse()
      .ok()
  }

  pub(super) fn vpk_filename(vpk_name: &str) -> String {
    std::path::Path::new(vpk_name)
      .file_name()
      .map(|f| f.to_string_lossy().to_string())
      .unwrap_or_else(|| vpk_name.to_string())
  }
}

/// The filename the engine loads as the `number`-th addon of a directory.
pub(super) fn enabled_vpk_name(number: u32) -> String {
  format!("pak{number:02}_dir.vpk")
}

/// Lowest `pak##_dir.vpk` name not yet taken in `dir`, filling gaps left by
/// disabled mods.
pub(super) fn next_free_enabled_vpk_name(dir: &Path) -> Result<String, Error> {
  if !dir.exists() {
    return Ok(enabled_vpk_name(1));
  }

  let mut used = std::collections::HashSet::new();
  for entry in fs::read_dir(dir)? {
    let path = entry?.path();
    if path.is_file()
      && let Some(name) = path.file_name().and_then(|n| n.to_str())
      && let Some(number) = VpkManager::enabled_vpk_number(name)
    {
      used.insert(number);
    }
  }

  let mut number = 1u32;
  while used.contains(&number) {
    number += 1;
  }
  Ok(enabled_vpk_name(number))
}
