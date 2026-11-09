use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeroDetectionResult {
    pub hero: Option<String>,
    pub hero_display: Option<String>,
    /// `"hero"` only when a hero's model or material folder named the hero.
    pub category: String,
    /// What the files change: `"visual"` (models, materials, textures),
    /// `"sound"` (sounds and nothing visual) or `"other"`.
    pub content: String,
    pub internal_names: Vec<String>,
    pub uses_critical_paths: bool,
    pub critical_paths: Vec<String>,
}
