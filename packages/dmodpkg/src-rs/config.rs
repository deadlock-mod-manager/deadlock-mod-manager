use serde::{Deserialize, Serialize};
use zod_gen_derive::ZodSchema;

use crate::error::{DmodpkgError, Result};
use crate::types::*;

/// Mod configuration (mod.config.json / dmm.json)
///
/// All fields are optional to support partial `dmm.json` configs.
/// Use `validate_full()` for packaging validation and `validate_dmm()` for lenient dmm.json usage.
#[derive(Debug, Clone, Serialize, Deserialize, ZodSchema)]
pub struct ModConfig {
    /// JSON Schema reference
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,

    /// Schema version for forward compatibility
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<u32>,

    /// Unique identifier (kebab-case)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Human-readable name
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,

    /// Semantic version
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,

    /// Short description
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Compatible game version constraint
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_version: Option<String>,

    /// List of authors
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<Author>,

    /// SPDX license identifier
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,

    /// Path to README file
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub readme: Option<String>,

    /// Project homepage URL
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,

    /// Source code repository URL
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,

    /// Mod-level screenshots
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub screenshots: Vec<String>,

    /// Variant groups
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub variant_groups: Vec<VariantGroup>,

    /// Layers
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layers: Vec<Layer>,

    /// Additional metadata
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,

    /// Mods this mod requires
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub dependencies: Vec<Dependency>,

    /// Mods this mod is incompatible with
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conflicts: Vec<Conflict>,

    /// Warn user mod may break on game update
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub breaks_on_update: Option<bool>,

    /// Suggested install/load order priority
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub load_priority: Option<i32>,
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

    /// Full validation for packaging -- requires all mandatory fields
    pub fn validate_full(&self) -> Result<()> {
        let name = self
            .name
            .as_deref()
            .ok_or_else(|| DmodpkgError::validation("name is required"))?;

        if !name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        {
            return Err(DmodpkgError::validation(
                "name must be kebab-case (a-z0-9-)",
            ));
        }

        let version = self
            .version
            .as_deref()
            .ok_or_else(|| DmodpkgError::validation("version is required"))?;
        if version.is_empty() {
            return Err(DmodpkgError::validation("version cannot be empty"));
        }

        let display_name = self
            .display_name
            .as_deref()
            .ok_or_else(|| DmodpkgError::validation("display_name is required"))?;
        if display_name.is_empty() {
            return Err(DmodpkgError::validation("display_name cannot be empty"));
        }

        let description = self
            .description
            .as_deref()
            .ok_or_else(|| DmodpkgError::validation("description is required"))?;
        if description.len() > 500 {
            return Err(DmodpkgError::validation(
                "description must be 500 characters or less",
            ));
        }

        if self.authors.is_empty() {
            return Err(DmodpkgError::validation("at least one author is required"));
        }

        if self.layers.is_empty() {
            return Err(DmodpkgError::validation("at least one layer is required"));
        }

        let mut layer_names = std::collections::HashSet::new();
        for layer in &self.layers {
            if !layer_names.insert(&layer.name) {
                return Err(DmodpkgError::validation(format!(
                    "duplicate layer name: {}",
                    layer.name
                )));
            }
        }

        for group in &self.variant_groups {
            self.validate_variant_group(group)?;
        }

        Ok(())
    }

    /// Lenient validation for dmm.json -- only checks fields that are present
    pub fn validate_dmm(&self) -> Result<()> {
        if let Some(name) = &self.name
            && !name
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            {
                return Err(DmodpkgError::validation(
                    "name must be kebab-case (a-z0-9-)",
                ));
            }

        if let Some(description) = &self.description
            && description.len() > 500 {
                return Err(DmodpkgError::validation(
                    "description must be 500 characters or less",
                ));
            }

        let mut layer_names = std::collections::HashSet::new();
        for layer in &self.layers {
            if !layer_names.insert(&layer.name) {
                return Err(DmodpkgError::validation(format!(
                    "duplicate layer name: {}",
                    layer.name
                )));
            }
        }

        for group in &self.variant_groups {
            self.validate_variant_group(group)?;
        }

        Ok(())
    }

    fn validate_variant_group(&self, group: &VariantGroup) -> Result<()> {
        if group.variants.is_empty() {
            return Err(DmodpkgError::validation(format!(
                "variant group '{}' must have at least one variant",
                group.id
            )));
        }

        if !group.variants.iter().any(|v| v.id == group.default) {
            return Err(DmodpkgError::validation(format!(
                "default variant '{}' not found in group '{}'",
                group.default, group.id
            )));
        }

        let mut variant_ids = std::collections::HashSet::new();
        for variant in &group.variants {
            if !variant_ids.insert(&variant.id) {
                return Err(DmodpkgError::validation(format!(
                    "duplicate variant ID '{}' in group '{}'",
                    variant.id, group.id
                )));
            }

            for layer_name in &variant.layers {
                if !self.layers.iter().any(|l| &l.name == layer_name) {
                    return Err(DmodpkgError::validation(format!(
                        "variant '{}' references unknown layer '{}'",
                        variant.id, layer_name
                    )));
                }
            }
        }

        Ok(())
    }
}

/// Bundle configuration (bundle.config.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
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
        if !self
            .name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        {
            return Err(DmodpkgError::validation(
                "name must be kebab-case (a-z0-9-)",
            ));
        }

        if self.version.is_empty() {
            return Err(DmodpkgError::validation("version cannot be empty"));
        }

        if self.display_name.is_empty() {
            return Err(DmodpkgError::validation("display_name cannot be empty"));
        }

        if self.description.len() > 1000 {
            return Err(DmodpkgError::validation(
                "description must be 1000 characters or less",
            ));
        }

        if self.authors.is_empty() {
            return Err(DmodpkgError::validation("at least one author is required"));
        }

        if self.mods.is_empty() {
            return Err(DmodpkgError::validation("at least one mod is required"));
        }

        for mod_entry in &self.mods {
            if !mod_entry.package.ends_with(".dmodpkg") {
                return Err(DmodpkgError::validation(format!(
                    "mod package '{}' must have .dmodpkg extension",
                    mod_entry.package
                )));
            }
        }

        for preset in &self.presets {
            self.validate_preset(preset)?;
        }

        Ok(())
    }

    fn validate_preset(&self, preset: &BundlePreset) -> Result<()> {
        if preset.mods.is_empty() {
            return Err(DmodpkgError::validation(format!(
                "preset '{}' must configure at least one mod",
                preset.id
            )));
        }

        for mod_config in &preset.mods {
            if !self.mods.iter().any(|m| m.package == mod_config.package) {
                return Err(DmodpkgError::validation(format!(
                    "preset '{}' references unknown package '{}'",
                    preset.id, mod_config.package
                )));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mod_config_full_validation() {
        let config = ModConfig {
            schema: None,
            schema_version: Some(1),
            name: Some("test-mod".to_string()),
            display_name: Some("Test Mod".to_string()),
            version: Some("1.0.0".to_string()),
            description: Some("A test mod".to_string()),
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
            metadata: None,
            dependencies: vec![],
            conflicts: vec![],
            breaks_on_update: None,
            load_priority: None,
        };

        assert!(config.validate_full().is_ok());
    }

    #[test]
    fn test_mod_config_dmm_validation() {
        let json = r#"{ "breaks_on_update": true, "load_priority": 10 }"#;
        let config = ModConfig::from_json(json).unwrap();
        assert!(config.validate_dmm().is_ok());
        assert_eq!(config.breaks_on_update, Some(true));
        assert_eq!(config.load_priority, Some(10));
    }

    #[test]
    fn test_mod_config_with_dependencies() {
        let json = r#"{
            "name": "test-mod",
            "display_name": "Test Mod",
            "version": "1.0.0",
            "description": "A test mod",
            "authors": ["TestAuthor"],
            "layers": [{ "name": "base", "priority": 0, "required": true }],
            "dependencies": [
                { "remote_id": "12345", "name": "other-mod", "version": ">=1.0.0" }
            ],
            "conflicts": [
                { "remote_id": "67890", "name": "incompatible-mod" }
            ]
        }"#;

        let config = ModConfig::from_json(json).unwrap();
        assert_eq!(config.dependencies.len(), 1);
        assert_eq!(config.conflicts.len(), 1);
        assert!(config.validate_full().is_ok());
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
