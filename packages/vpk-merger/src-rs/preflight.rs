use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use rayon::prelude::*;
use vpk_parser::VpkParser;

use crate::error::{Result, VpkMergerError};
use crate::filter::is_ignored_readme;
use crate::read::manifest_key;

type IndexedPathSet = (usize, PathBuf, HashSet<String>);

#[derive(Debug, Clone)]
pub struct ExcludedVpk {
    pub path: PathBuf,
    pub overlapping_key: String,
    pub kept_in_vpk: PathBuf,
}

#[derive(Debug)]
pub struct PreflightResult {
    pub included: Vec<PathBuf>,
    pub excluded: Vec<ExcludedVpk>,
    pub accepted_key_count: usize,
}

pub fn scan_vpk_path_sets(vpks: &[PathBuf]) -> Result<Vec<(PathBuf, HashSet<String>)>> {
    let indexed: Vec<std::result::Result<IndexedPathSet, VpkMergerError>> = vpks
        .par_iter()
        .enumerate()
        .map(|(idx, path)| {
            let entries = VpkParser::parse_directory_from_file(path)?;
            let keys: HashSet<String> = entries
                .iter()
                .filter(|e| !is_ignored_readme(e))
                .map(|e| manifest_key(&e.full_path))
                .collect();
            Ok((idx, path.clone(), keys))
        })
        .collect();

    let mut tuples: Vec<IndexedPathSet> = Vec::with_capacity(vpks.len());
    for item in indexed {
        tuples.push(item?);
    }
    tuples.sort_by_key(|(i, _, _)| *i);
    Ok(tuples
        .into_iter()
        .map(|(_, path, keys)| (path, keys))
        .collect())
}

pub fn greedy_include_vpks(ordered: &[(PathBuf, HashSet<String>)]) -> PreflightResult {
    let mut key_owner: HashMap<String, PathBuf> = HashMap::new();
    let mut included: Vec<PathBuf> = Vec::new();
    let mut excluded: Vec<ExcludedVpk> = Vec::new();

    for (vpk_path, keys) in ordered {
        let mut first_hit: Option<(String, PathBuf)> = None;
        for key in keys {
            if let Some(owner) = key_owner.get(key) {
                first_hit = Some((key.clone(), owner.clone()));
                break;
            }
        }

        if let Some((overlapping_key, kept_in_vpk)) = first_hit {
            excluded.push(ExcludedVpk {
                path: vpk_path.clone(),
                overlapping_key,
                kept_in_vpk,
            });
            continue;
        }

        for key in keys {
            key_owner.insert(key.clone(), vpk_path.clone());
        }
        included.push(vpk_path.clone());
    }

    let accepted_key_count = key_owner.len();
    PreflightResult {
        included,
        excluded,
        accepted_key_count,
    }
}

pub fn run_preflight(vpks: &[PathBuf]) -> Result<PreflightResult> {
    if vpks.is_empty() {
        return Ok(PreflightResult {
            included: Vec::new(),
            excluded: Vec::new(),
            accepted_key_count: 0,
        });
    }
    let ordered = scan_vpk_path_sets(vpks)?;
    Ok(greedy_include_vpks(&ordered))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greedy_drops_second_vpk_on_overlap() {
        let a = PathBuf::from("a_dir.vpk");
        let b = PathBuf::from("b_dir.vpk");
        let mut ka = HashSet::new();
        ka.insert("scripts/x.txt".to_string());
        ka.insert("only_a.txt".to_string());
        let mut kb = HashSet::new();
        kb.insert("scripts/x.txt".to_string());
        kb.insert("only_b.txt".to_string());
        let ordered = vec![(a.clone(), ka), (b.clone(), kb)];
        let r = greedy_include_vpks(&ordered);
        assert_eq!(r.included.len(), 1);
        assert_eq!(r.included[0], a);
        assert_eq!(r.excluded.len(), 1);
        assert_eq!(r.excluded[0].path, b);
        assert_eq!(r.excluded[0].overlapping_key, "scripts/x.txt");
        assert_eq!(r.excluded[0].kept_in_vpk, a);
    }
}
