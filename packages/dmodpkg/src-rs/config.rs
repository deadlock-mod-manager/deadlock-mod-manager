use serde::{Deserialize, Serialize};
use crate::types::*;
use crate::error::{DmodpkgError, Result};

/// Mod configuration (mod.config.json)
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ModConfig {
    /// JSON Schema reference
    #[serde(rename = "$schema", skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    
    /// Unique identifier (kebab-case)
    pub name: String,
    
    /// Human-readable name
    pub display_name: String,
    
    /// Semantic version
    pub version: String,
    
    /// Short description
    pub description: String,
    
    /// Compatible game version constraint
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_version: Option<String>,
    
    /// List of authors
    pub authors: Vec<Author>,
    
    /// SPDX license identifier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    
    /// Path to README file
    #[serde(skip_serializing_if = "Option::is_none")]
    pub readme: Option<String>,
    
    /// Project homepage URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    
    /// Source code repository URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,
    
    /// Mod-level screenshots
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub screenshots: Vec<String>,
    
    /// Variant groups
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub variant_groups: Vec<VariantGroup>,
    
    /// Layers
    pub layers: Vec<Layer>,
    
    /// Transformers
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub transformers: Vec<Transformer>,
    
    /// Additional metadata
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,
}

impl ModConfig {
    /// Parse configuration from JSON string
    pub fn from_json(json: &str) -> Result<Self> {
        serde_json::from_str(json).map_err(Into::into)
    }

    /// Serialize configuration to JSON string
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(self).map_err(Into::into)
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<()> {
        // Validate name format (kebab-case)
        if !self.name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
            return Err(DmodpkgError::validation(
                "name must be kebab-case (a-z0-9-)"
            ));
        }

        // Validate version is semver
        if self.version.is_empty() {
            return Err(DmodpkgError::validation("version cannot be empty"));
        }

        // Validate display_name is not empty
        if self.display_name.is_empty() {
            return Err(DmodpkgError::validation("display_name cannot be empty"));
        }

        // Validate description length
        if self.description.len() > 500 {
            return Err(DmodpkgError::validation(
                "description must be 500 characters or less"
            ));
        }

        // Validate authors
        if self.authors.is_empty() {
            return Err(DmodpkgError::validation("at least one author is required"));
        }

        // Validate layers
        if self.layers.is_empty() {
            return Err(DmodpkgError::validation("at least one layer is required"));
        }

        // Validate layer names are unique
        let mut layer_names = std::collections::HashSet::new();
        for layer in &self.layers {
            if !layer_names.insert(&layer.name) {
                return Err(DmodpkgError::validation(
                    format!("duplicate layer name: {}", layer.name)
                ));
            }
        }

        // Validate variant groups
        for group in &self.variant_groups {
            self.validate_variant_group(group)?;
        }

        Ok(())
    }

    /// Validate a variant group
    fn validate_variant_group(&self, group: &VariantGroup) -> Result<()> {
        if group.variants.is_empty() {
            return Err(DmodpkgError::validation(
                format!("variant group '{}' must have at least one variant", group.id)
            ));
        }

        // Check default variant exists
        if !group.variants.iter().any(|v| v.id == group.default) {
            return Err(DmodpkgError::validation(
                format!("default variant '{}' not found in group '{}'", group.default, group.id)
            ));
        }

        // Validate variant IDs are unique
        let mut variant_ids = std::collections::HashSet::new();
        for variant in &group.variants {
            if !variant_ids.insert(&variant.id) {
                return Err(DmodpkgError::validation(
                    format!("duplicate variant ID '{}' in group '{}'", variant.id, group.id)
                ));
            }

            // Validate layers referenced by variant exist
            for layer_name in &variant.layers {
                if !self.layers.iter().any(|l| &l.name == layer_name) {
                    return Err(DmodpkgError::validation(
                        format!("variant '{}' references unknown layer '{}'", variant.id, layer_name)
                    ));
                }
            }
        }

        Ok(())
    }
}

/// Bundle configuration (bundle.config.json)
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct BundleConfig {
    /// JSON Schema reference
    #[serde(rename = "$schema", skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    
    /// Unique bundle identifier (kebab-case)
    pub name: String,
    
    /// Human-readable bundle name
    pub display_name: String,
    
    /// Bundle version
    pub version: String,
    
    /// Bundle description
    pub description: String,
    
    /// Bundle authors
    pub authors: Vec<Author>,
    
    /// Bundle homepage URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    
    /// Bundle-level screenshots
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub screenshots: Vec<String>,
    
    /// Included mod packages
    pub mods: Vec<BundleModEntry>,
    
    /// Variant presets
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub presets: Vec<BundlePreset>,
    
    /// Additional metadata
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<BundleMetadata>,
}

impl BundleConfig {
    /// Parse configuration from JSON string
    pub fn from_json(json: &str) -> Result<Self> {
        serde_json::from_str(json).map_err(Into::into)
    }

    /// Serialize configuration to JSON string
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(self).map_err(Into::into)
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<()> {
        // Validate name format (kebab-case)
        if !self.name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
            return Err(DmodpkgError::validation(
                "name must be kebab-case (a-z0-9-)"
            ));
        }

        // Validate version
        if self.version.is_empty() {
            return Err(DmodpkgError::validation("version cannot be empty"));
        }

        // Validate display_name
        if self.display_name.is_empty() {
            return Err(DmodpkgError::validation("display_name cannot be empty"));
        }

        // Validate description length
        if self.description.len() > 1000 {
            return Err(DmodpkgError::validation(
                "description must be 1000 characters or less"
            ));
        }

        // Validate authors
        if self.authors.is_empty() {
            return Err(DmodpkgError::validation("at least one author is required"));
        }

        // Validate mods
        if self.mods.is_empty() {
            return Err(DmodpkgError::validation("at least one mod is required"));
        }

        // Validate mod package filenames
        for mod_entry in &self.mods {
            if !mod_entry.package.ends_with(".dmodpkg") {
                return Err(DmodpkgError::validation(
                    format!("mod package '{}' must have .dmodpkg extension", mod_entry.package)
                ));
            }
        }

        // Validate presets
        for preset in &self.presets {
            self.validate_preset(preset)?;
        }

        Ok(())
    }

    /// Validate a preset
    fn validate_preset(&self, preset: &BundlePreset) -> Result<()> {
        if preset.mods.is_empty() {
            return Err(DmodpkgError::validation(
                format!("preset '{}' must configure at least one mod", preset.id)
            ));
        }

        // Validate referenced packages exist
        for mod_config in &preset.mods {
            if !self.mods.iter().any(|m| m.package == mod_config.package) {
                return Err(DmodpkgError::validation(
                    format!("preset '{}' references unknown package '{}'", preset.id, mod_config.package)
                ));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mod_config_validation() {
        let config = ModConfig {
            schema: None,
            name: "test-mod".to_string(),
            display_name: "Test Mod".to_string(),
            version: "1.0.0".to_string(),
            description: "A test mod".to_string(),
            game_version: None,
            authors: vec![Author::Name("TestAuthor".to_string())],
            license: None,
            readme: None,
            homepage: None,
            repository: None,
            screenshots: vec![],
            variant_groups: vec![],
            layers: vec![Layer {
                name: "base".to_string(),
                priority: 0,
                description: None,
                required: true,
            }],
            transformers: vec![],
            metadata: None,
        };

        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_bundle_config_validation() {
        let config = BundleConfig {
            schema: None,
            name: "test-bundle".to_string(),
            display_name: "Test Bundle".to_string(),
            version: "1.0.0".to_string(),
            description: "A test bundle".to_string(),
            authors: vec![Author::Name("TestAuthor".to_string())],
            homepage: None,
            screenshots: vec![],
            mods: vec![BundleModEntry {
                package: "test-mod.dmodpkg".to_string(),
                required: true,
                description: None,
            }],
            presets: vec![],
            metadata: None,
        };

        assert!(config.validate().is_ok());
    }
}

