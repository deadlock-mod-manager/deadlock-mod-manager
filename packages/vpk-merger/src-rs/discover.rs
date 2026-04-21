use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Result, VpkMergerError};

fn is_dir_vpk_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with("_dir.vpk")
}

fn is_chunk_vpk_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if !lower.ends_with(".vpk") {
        return false;
    }
    let stem = lower.strip_suffix(".vpk").unwrap_or("");
    if stem.ends_with("_dir") {
        return true;
    }
    stem
        .rsplit_once('_')
        .and_then(|(_, tail)| tail.parse::<u32>().ok())
        .is_some()
}

pub fn collect_dir_vpks(root: &Path, recursive: bool) -> Result<Vec<PathBuf>> {
    if !root.is_dir() {
        return Err(VpkMergerError::Invalid {
            message: format!("not a directory: {}", root.display()),
        });
    }

    let mut out: Vec<PathBuf> = Vec::new();
    collect_dir_vpks_inner(root, recursive, &mut out)?;
    out.sort();
    out.dedup();
    Ok(out)
}

fn collect_dir_vpks_inner(dir: &Path, recursive: bool, out: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;

        if file_type.is_dir() {
            if recursive {
                collect_dir_vpks_inner(&path, recursive, out)?;
            }
            continue;
        }

        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        if !name.to_ascii_lowercase().ends_with(".vpk") {
            continue;
        }

        if is_chunk_vpk_name(name) && !is_dir_vpk_name(name) {
            continue;
        }

        if is_dir_vpk_name(name) {
            out.push(path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn skips_numbered_chunks() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        File::create(root.join("foo_dir.vpk")).unwrap();
        File::create(root.join("foo_001.vpk")).unwrap();
        File::create(root.join("bar_000.vpk")).unwrap();

        let vpks = collect_dir_vpks(root, false).unwrap();
        assert_eq!(vpks.len(), 1);
        assert!(vpks[0].file_name().unwrap() == "foo_dir.vpk");
    }
}
