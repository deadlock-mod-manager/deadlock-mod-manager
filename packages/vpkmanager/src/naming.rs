//! The two filename shapes a profile directory holds.
//!
//! An *enabled* VPK is named `pak##_dir.vpk`: that is the only shape the engine
//! loads, and its number decides load order within a shard. A *disabled* VPK
//! keeps its shipped filename behind a `{mod_id}_` prefix, which parks it in the
//! same directory without the engine ever looking at it.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use crate::error::Result;

/// The filename the engine loads as the `number`-th addon of a directory.
pub fn enabled_vpk_name(number: u32) -> String {
    format!("pak{number:02}_dir.vpk")
}

/// The `##` of an enabled VPK name, or `None` if this is not one.
pub fn enabled_vpk_number(filename: &str) -> Option<u32> {
    let digits = filename.strip_prefix("pak")?.strip_suffix("_dir.vpk")?;
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

pub fn is_enabled_vpk_name(filename: &str) -> bool {
    enabled_vpk_number(filename).is_some()
}

/// The mod ID a disabled VPK's `{mod_id}_` prefix names, if it has one.
pub fn mod_id_from_prefix(filename: &str) -> Option<String> {
    if is_enabled_vpk_name(filename) {
        return None;
    }

    let underscore = filename.find('_')?;
    let candidate = &filename[..underscore];
    if !candidate.is_empty()
        && (candidate.chars().all(|c| c.is_ascii_digit()) || candidate.starts_with("local-"))
    {
        return Some(candidate.to_string());
    }
    None
}

/// The shipped filename behind a `{mod_id}_` prefix.
pub fn strip_mod_prefix<'a>(filename: &'a str, mod_id: &str) -> &'a str {
    filename
        .strip_prefix(mod_id)
        .and_then(|rest| rest.strip_prefix('_'))
        .unwrap_or(filename)
}

/// Whether a filename is a `*_NNN.vpk` companion archive rather than a VPK that
/// can be opened on its own.
///
/// A split VPK is addressed through its `_dir.vpk`; the numbered files beside it
/// hold only data and are meaningless without it.
pub fn is_multipart_companion(filename: &str) -> bool {
    let Some(stem) = filename.strip_suffix(".vpk") else {
        return false;
    };
    stem.rsplit_once('_')
        .is_some_and(|(_, tail)| tail.len() == 3 && tail.bytes().all(|b| b.is_ascii_digit()))
}

/// Just the file name, for callers that may hand us a shard-qualified locator
/// or a path.
pub fn file_name_of(value: &str) -> String {
    Path::new(&value.replace('\\', "/"))
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| value.to_string())
}

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
                    .and_then(|name| name.to_str())
                    .is_some_and(is_enabled_vpk_name)
        })
        .count() as u32
}

/// Whether `dir` holds pak numbers above what the engine loads — the signature
/// of a profile written before sharding existed.
pub fn has_out_of_range_enabled_vpks(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        entry
            .file_name()
            .to_str()
            .and_then(enabled_vpk_number)
            .is_some_and(|number| number > crate::profile::SHARD_CAPACITY)
    })
}

/// Lowest `pak##_dir.vpk` name not yet taken in `dir`, filling gaps left by
/// disabled mods.
pub fn next_free_enabled_vpk_name(dir: &Path) -> Result<String> {
    if !dir.exists() {
        return Ok(enabled_vpk_name(1));
    }

    let mut used = HashSet::new();
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_file()
            && let Some(number) = path
                .file_name()
                .and_then(|name| name.to_str())
                .and_then(enabled_vpk_number)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_disabled_local_mod_prefixes() {
        assert_eq!(
            mod_id_from_prefix("local-abc-123_mod.vpk"),
            Some("local-abc-123".to_string())
        );
        assert_eq!(
            mod_id_from_prefix("123456_mod.vpk"),
            Some("123456".to_string())
        );
        assert_eq!(mod_id_from_prefix("pak01_dir.vpk"), None);
    }

    #[test]
    fn recognizes_enabled_vpk_names() {
        assert_eq!(enabled_vpk_number("pak01_dir.vpk"), Some(1));
        assert_eq!(enabled_vpk_number("pak100_dir.vpk"), Some(100));
        assert_eq!(enabled_vpk_number("pak_dir.vpk"), None);
        assert_eq!(enabled_vpk_number("pakxx_dir.vpk"), None);
        assert_eq!(enabled_vpk_number("650634_mod.vpk"), None);
        assert_eq!(enabled_vpk_name(7), "pak07_dir.vpk");
    }

    #[test]
    fn next_free_name_fills_the_lowest_gap() {
        let temp = tempfile::tempdir().unwrap();
        for name in ["pak01_dir.vpk", "pak03_dir.vpk"] {
            fs::write(temp.path().join(name), b"vpk").unwrap();
        }

        assert_eq!(
            next_free_enabled_vpk_name(temp.path()).unwrap(),
            "pak02_dir.vpk"
        );
    }

    #[test]
    fn recognizes_multipart_companions() {
        assert!(is_multipart_companion("pak01_003.vpk"));
        assert!(is_multipart_companion("cool_mod_000.vpk"));
        assert!(!is_multipart_companion("pak01_dir.vpk"));
        assert!(!is_multipart_companion("cool_mod.vpk"));
        assert!(!is_multipart_companion("mod_1234.vpk"));
    }

    #[test]
    fn strips_the_mod_prefix_only_when_it_is_there() {
        assert_eq!(strip_mod_prefix("650634_cool.vpk", "650634"), "cool.vpk");
        assert_eq!(strip_mod_prefix("cool.vpk", "650634"), "cool.vpk");
    }
}
