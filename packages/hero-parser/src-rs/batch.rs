use crate::cache::VpkEntryCache;
use crate::types::HeroDetectionResult;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct BatchDetectionItem {
    pub id: String,
    pub vpk_paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDetectionResult {
    pub id: String,
    pub result: HeroDetectionResult,
}

pub fn detect_heroes_batch(
    items: Vec<BatchDetectionItem>,
    cache: &VpkEntryCache,
) -> Vec<BatchDetectionResult> {
    items
        .into_par_iter()
        .map(|item| {
            let result = crate::detect_hero_from_vpk_files(&item.vpk_paths, cache);
            BatchDetectionResult {
                id: item.id,
                result,
            }
        })
        .collect()
}
