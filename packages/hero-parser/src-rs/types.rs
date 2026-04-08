use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeroDetectionResult {
    pub hero: Option<String>,
    pub hero_display: Option<String>,
    pub category: String,
    pub internal_names: Vec<String>,
    pub uses_critical_paths: bool,
    pub critical_paths: Vec<String>,
}
