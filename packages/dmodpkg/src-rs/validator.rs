use crate::config::ModConfig;
use crate::error::{DmodpkgError, Result};
use std::collections::HashSet;
use std::path::Path;

/// Validation options
#[derive(Debug, Clone)]
pub struct ValidationOptions {
    /// Enable strict validation mode
    pub strict: bool,
    /// Check if files actually exist
    pub check_files_exist: bool,
    /// Validate image files
    pub validate_images: bool,
    /// Maximum allowed file size (in bytes)
    pub max_file_size: Option<u64>,
}

impl Default for ValidationOptions {
    fn default() -> Self {
        Self {
            strict: false,
            check_files_exist: true,
            validate_images: true,
            max_file_size: Some(100 * 1024 * 1024), // 100MB default
        }
    }
}

/// Validation warning
#[derive(Debug, Clone)]
pub struct ValidationWarning {
    pub message: String,
}

impl ValidationWarning {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

/// Validation result with warnings
#[derive(Debug)]
pub struct ValidationResult {
    pub warnings: Vec<ValidationWarning>,
}

impl ValidationResult {
    pub fn new() -> Self {
        Self {
            warnings: Vec::new(),
        }
    }

    pub fn add_warning(&mut self, message: impl Into<String>) {
        self.warnings.push(ValidationWarning::new(message));
    }

    pub fn has_warnings(&self) -> bool {
        !self.warnings.is_empty()
    }
}

impl Default for ValidationResult {
    fn default() -> Self {
        Self::new()
    }
}

/// Validate a mod project directory structure
pub fn validate_project(
    project_path: &Path,
    config: &ModConfig,
    options: &ValidationOptions,
) -> Result<ValidationResult> {
    let mut result = ValidationResult::new();

    // Validate basic config structure
    config.validate()?;

    // Check content directory exists
    let content_dir = project_path.join("content");
    if options.check_files_exist && !content_dir.exists() {
        return Err(DmodpkgError::validation(
            "content/ directory not found in project",
        ));
    }

    // Validate each layer directory exists and contains files
    if options.check_files_exist {
        for layer in &config.layers {
            let layer_dir = content_dir.join(&layer.name);
            if !layer_dir.exists() {
                if layer.required {
                    return Err(DmodpkgError::validation(format!(
                        "Required layer '{}' directory not found at content/{}",
                        layer.name, layer.name
                    )));
                } else {
                    result.add_warning(format!(
                        "Optional layer '{}' directory not found",
                        layer.name
                    ));
                }
            } else {
                // Check if layer has any files
                let has_files = std::fs::read_dir(&layer_dir)
                    .map_err(|e| {
                        DmodpkgError::validation(format!("Failed to read layer directory: {}", e))
                    })?
                    .any(|entry| entry.map(|e| e.path().is_file()).unwrap_or(false));

                if !has_files {
                    result.add_warning(format!("Layer '{}' contains no files", layer.name));
                }
            }
        }
    }

    // Validate variant groups reference valid layers
    for group in &config.variant_groups {
        for variant in &group.variants {
            for layer_name in &variant.layers {
                if !config.layers.iter().any(|l| &l.name == layer_name) {
                    return Err(DmodpkgError::validation(format!(
                        "Variant '{}' in group '{}' references unknown layer '{}'",
                        variant.id, group.id, layer_name
                    )));
                }
            }

            // Validate preview images if specified
            if options.validate_images && options.check_files_exist {
                if let Some(preview) = &variant.preview_image {
                    validate_image_reference(project_path, preview, &mut result)?;
                }

                for screenshot in &variant.screenshots {
                    validate_image_reference(project_path, screenshot, &mut result)?;
                }
            }
        }
    }

    // Validate mod-level screenshots
    if options.validate_images && options.check_files_exist {
        for screenshot in &config.screenshots {
            validate_image_reference(project_path, screenshot, &mut result)?;
        }
    }

    // Validate README exists if specified
    if let Some(readme) = &config.readme {
        if options.check_files_exist {
            let readme_path = project_path.join(readme);
            if !readme_path.exists() {
                result.add_warning(format!("README file not found: {}", readme));
            }
        }
    }

    // Check for duplicate layer priorities (not an error, but worth warning)
    let mut priority_map: std::collections::HashMap<i32, Vec<String>> =
        std::collections::HashMap::new();
    for layer in &config.layers {
        priority_map
            .entry(layer.priority)
            .or_default()
            .push(layer.name.clone());
    }

    for (priority, layers) in priority_map {
        if layers.len() > 1 {
            result.add_warning(format!(
                "Multiple layers have priority {}: {}",
                priority,
                layers.join(", ")
            ));
        }
    }

    // Validate at least one required layer exists
    if !config.layers.iter().any(|l| l.required) {
        result.add_warning("No required layers defined - mod may be empty after installation");
    }

    Ok(result)
}

/// Validate an image reference (path or URL)
fn validate_image_reference(
    project_path: &Path,
    reference: &str,
    result: &mut ValidationResult,
) -> Result<()> {
    // Check if it's a URL
    if reference.starts_with("http://") || reference.starts_with("https://") {
        if !reference.starts_with("https://") {
            result.add_warning(format!("Image URL should use HTTPS: {}", reference));
        }
        return Ok(());
    }

    // It's a file path - validate it exists
    let image_path = project_path.join(reference);
    if !image_path.exists() {
        return Err(DmodpkgError::validation(format!(
            "Image file not found: {}",
            reference
        )));
    }

    // Check file extension
    let valid_extensions = ["png", "jpg", "jpeg", "webp"];
    let extension = image_path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase());

    match extension {
        Some(ext) if valid_extensions.contains(&ext.as_str()) => {
            // Valid extension
        }
        Some(ext) => {
            return Err(DmodpkgError::validation(format!(
                "Invalid image format '{}' for file: {} (supported: PNG, JPEG, WebP)",
                ext, reference
            )));
        }
        None => {
            return Err(DmodpkgError::validation(format!(
                "Image file has no extension: {}",
                reference
            )));
        }
    }

    // Check file size
    if let Ok(metadata) = std::fs::metadata(&image_path) {
        let size = metadata.len();

        // Warn if > 2MB
        if size > 2 * 1024 * 1024 {
            result.add_warning(format!(
                "Image file is large ({:.2} MB): {} (recommended < 2MB)",
                size as f64 / (1024.0 * 1024.0),
                reference
            ));
        }

        // Error if > 10MB
        if size > 10 * 1024 * 1024 {
            return Err(DmodpkgError::validation(format!(
                "Image file is too large ({:.2} MB): {} (maximum 10MB)",
                size as f64 / (1024.0 * 1024.0),
                reference
            )));
        }
    }

    Ok(())
}

/// Validate file paths don't have conflicts
pub fn validate_no_path_conflicts(files: &[(String, String)]) -> Result<()> {
    let mut seen = HashSet::new();

    for (path, layer) in files {
        let key = path.to_lowercase();
        if !seen.insert(key.clone()) {
            return Err(DmodpkgError::validation(format!(
                "Duplicate file path '{}' in layer '{}'",
                path, layer
            )));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Author, Layer};

    fn create_test_config() -> ModConfig {
        ModConfig {
            schema: None,
            name: "test-mod".to_string(),
            display_name: "Test Mod".to_string(),
            version: "1.0.0".to_string(),
            description: "Test description".to_string(),
            game_version: None,
            authors: vec![Author::Name("Test Author".to_string())],
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
        }
    }

    #[test]
    fn test_validation_options_default() {
        let options = ValidationOptions::default();
        assert!(!options.strict);
        assert!(options.check_files_exist);
        assert!(options.validate_images);
        assert!(options.max_file_size.is_some());
    }

    #[test]
    fn test_validation_result() {
        let mut result = ValidationResult::new();
        assert!(!result.has_warnings());

        result.add_warning("Test warning");
        assert!(result.has_warnings());
        assert_eq!(result.warnings.len(), 1);
    }

    #[test]
    fn test_validate_no_path_conflicts() {
        let files = vec![
            ("file1.vpk".to_string(), "base".to_string()),
            ("file2.vpk".to_string(), "base".to_string()),
        ];
        assert!(validate_no_path_conflicts(&files).is_ok());

        let duplicate_files = vec![
            ("file1.vpk".to_string(), "base".to_string()),
            ("file1.vpk".to_string(), "layer2".to_string()),
        ];
        assert!(validate_no_path_conflicts(&duplicate_files).is_err());
    }

    #[test]
    fn test_basic_config_validation() {
        let config = create_test_config();
        assert!(config.validate().is_ok());
    }
}
