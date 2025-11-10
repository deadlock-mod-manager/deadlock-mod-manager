//! Integration tests for pack and extract functionality

use dmodpkg::*;
use std::fs;
use tempfile::TempDir;

/// Create a test mod project structure
fn create_test_project(dir: &TempDir) -> std::path::PathBuf {
    let project_dir = dir.path().join("test-mod");
    fs::create_dir_all(&project_dir).unwrap();

    // Create mod.config.json
    let config = ModConfig {
        schema: None,
        name: "test-mod".to_string(),
        display_name: "Test Mod".to_string(),
        version: "1.0.0".to_string(),
        description: "A test mod for integration testing".to_string(),
        game_version: Some(">=1.0.0".to_string()),
        authors: vec![
            Author::Name("Test Author".to_string()),
            Author::Detailed {
                name: "Contributor".to_string(),
                role: Some("Testing".to_string()),
                url: Some("https://example.com".to_string()),
            },
        ],
        license: Some("MIT".to_string()),
        readme: Some("README.md".to_string()),
        homepage: Some("https://example.com".to_string()),
        repository: Some("https://github.com/test/test-mod".to_string()),
        screenshots: vec!["previews/mod/screenshot_1.png".to_string()],
        variant_groups: vec![VariantGroup {
            id: "theme".to_string(),
            name: "Theme".to_string(),
            description: Some("Color theme".to_string()),
            default: "default".to_string(),
            variants: vec![
                Variant {
                    id: "default".to_string(),
                    name: "Default".to_string(),
                    description: Some("Default theme".to_string()),
                    layers: vec!["base".to_string()],
                    preview_image: None,
                    screenshots: vec![],
                },
                Variant {
                    id: "dark".to_string(),
                    name: "Dark".to_string(),
                    description: Some("Dark theme".to_string()),
                    layers: vec!["base".to_string(), "dark_theme".to_string()],
                    preview_image: None,
                    screenshots: vec![],
                },
            ],
        }],
        layers: vec![
            Layer {
                name: "base".to_string(),
                priority: 0,
                description: Some("Core files".to_string()),
                required: true,
            },
            Layer {
                name: "dark_theme".to_string(),
                priority: 10,
                description: Some("Dark theme files".to_string()),
                required: false,
            },
        ],
        transformers: vec![],
        metadata: Some(Metadata {
            tags: vec!["test".to_string(), "integration".to_string()],
            category: Some("testing".to_string()),
            nsfw: Some(false),
        }),
    };

    let config_json = serde_json::to_string_pretty(&config).unwrap();
    fs::write(project_dir.join("mod.config.json"), config_json).unwrap();

    // Create README
    fs::write(
        project_dir.join("README.md"),
        "# Test Mod\n\nThis is a test mod for integration testing.",
    )
    .unwrap();

    // Create content directory structure
    let content_dir = project_dir.join("content");
    fs::create_dir_all(&content_dir).unwrap();

    // Create base layer with a file
    let base_layer = content_dir.join("base");
    fs::create_dir_all(&base_layer).unwrap();
    let test_content = "This is test content for the base layer. It contains some data that will be compressed. ".repeat(100);
    fs::write(
        base_layer.join("test_file.vpk"),
        test_content.as_bytes(),
    )
    .unwrap();

    // Create dark_theme layer with a file
    let dark_layer = content_dir.join("dark_theme");
    fs::create_dir_all(&dark_layer).unwrap();
    let dark_content = "This is dark theme content. It overrides base theme files. ".repeat(100);
    fs::write(
        dark_layer.join("theme.vpk"),
        dark_content.as_bytes(),
    )
    .unwrap();

    // Create previews directory
    let previews_dir = project_dir.join("previews");
    fs::create_dir_all(previews_dir.join("mod")).unwrap();
    
    // Create a fake PNG (minimal valid PNG)
    let png_data = create_minimal_png();
    fs::write(
        previews_dir.join("mod").join("screenshot_1.png"),
        png_data,
    )
    .unwrap();

    project_dir
}

/// Create a minimal valid PNG file
fn create_minimal_png() -> Vec<u8> {
    // PNG signature + minimal IHDR chunk + IEND chunk
    let mut data = Vec::new();
    // PNG signature
    data.extend_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]);
    // IHDR chunk (1x1 image)
    data.extend_from_slice(&[0, 0, 0, 13]); // Length
    data.extend_from_slice(b"IHDR");
    data.extend_from_slice(&[0, 0, 0, 1]); // Width: 1
    data.extend_from_slice(&[0, 0, 0, 1]); // Height: 1
    data.extend_from_slice(&[8, 6, 0, 0, 0]); // Bit depth, color type, etc.
    data.extend_from_slice(&[31, 21, 196, 137]); // CRC
    // IEND chunk
    data.extend_from_slice(&[0, 0, 0, 0]); // Length
    data.extend_from_slice(b"IEND");
    data.extend_from_slice(&[174, 66, 96, 130]); // CRC
    data
}

#[test]
fn test_pack_and_extract_roundtrip() {
    let temp_dir = TempDir::new().unwrap();
    
    // Create test project
    let project_dir = create_test_project(&temp_dir);
    
    // Pack the project
    let pack_options = PackOptions::default();
    let output_path = temp_dir.path().join("test-mod-1.0.0.dmodpkg");
    
    let pack_result = pack_mod(&project_dir, Some(&output_path), pack_options).unwrap();
    
    // Verify pack result
    assert!(pack_result.package_path.exists());
    assert_eq!(pack_result.stats.file_count, 4); // 2 VPK files + 1 README + 1 screenshot
    assert!(pack_result.stats.total_compressed_size > 0);
    assert!(pack_result.stats.total_compressed_size < pack_result.stats.total_uncompressed_size);
    
    // Extract the package
    let extract_dir = temp_dir.path().join("extracted");
    let extract_options = ExtractOptions::default();
    
    let extract_result = extract_mod(&output_path, Some(&extract_dir), extract_options).unwrap();
    
    // Verify extract result
    assert_eq!(extract_result.files_extracted, 4);
    assert!(extract_result.layers_extracted.contains(&"base".to_string()));
    assert!(extract_result.layers_extracted.contains(&"dark_theme".to_string()));
    
    // Verify extracted structure
    assert!(extract_dir.join("mod.config.json").exists());
    assert!(extract_dir.join("README.md").exists());
    assert!(extract_dir.join("content/base/test_file.vpk").exists());
    assert!(extract_dir.join("content/dark_theme/theme.vpk").exists());
    assert!(extract_dir.join("previews/mod/screenshot_1.png").exists());
    
    // Verify file contents
    let base_content = fs::read_to_string(extract_dir.join("content/base/test_file.vpk")).unwrap();
    assert!(base_content.contains("test content for the base layer"));
    
    let dark_content = fs::read_to_string(extract_dir.join("content/dark_theme/theme.vpk")).unwrap();
    assert!(dark_content.contains("dark theme content"));
    
    let readme = fs::read_to_string(extract_dir.join("README.md")).unwrap();
    assert!(readme.contains("Test Mod"));
}

#[test]
fn test_pack_info_read() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = create_test_project(&temp_dir);
    
    // Pack the project
    let output_path = temp_dir.path().join("test-mod.dmodpkg");
    let pack_result = pack_mod(&project_dir, Some(&output_path), PackOptions::default()).unwrap();
    
    assert!(pack_result.package_path.exists());
    
    // Read package info
    let info = read_package_info(&output_path).unwrap();
    
    // Verify config
    assert_eq!(info.config.name, "test-mod");
    assert_eq!(info.config.display_name, "Test Mod");
    assert_eq!(info.config.version, "1.0.0");
    assert_eq!(info.config.layers.len(), 2);
    
    // Verify stats
    assert_eq!(info.stats.file_count, 4);
    assert!(info.stats.compression_ratio < 1.0);
    assert!(info.stats.compression_ratio > 0.0);
    
    // Verify layers
    assert_eq!(info.layers.len(), 2);
    let base_layer = info.layers.iter().find(|l| l.name == "base").unwrap();
    assert_eq!(base_layer.priority, 0);
    assert!(base_layer.required);
    
    // Verify files
    assert_eq!(info.files.len(), 4);
    let vpk_file = info.files.iter().find(|f| f.path.contains("test_file.vpk")).unwrap();
    assert_eq!(vpk_file.layer, "base");
}

#[test]
fn test_extract_specific_layer() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = create_test_project(&temp_dir);
    
    // Pack the project
    let output_path = temp_dir.path().join("test-mod.dmodpkg");
    pack_mod(&project_dir, Some(&output_path), PackOptions::default()).unwrap();
    
    // Extract only base layer
    let extract_dir = temp_dir.path().join("extracted");
    let mut options = ExtractOptions::default();
    options.layers = vec!["base".to_string()];
    
    let result = extract_mod(&output_path, Some(&extract_dir), options).unwrap();
    
    // Should extract base layer and metadata files
    assert!(extract_dir.join("content/base/test_file.vpk").exists());
    assert!(!extract_dir.join("content/dark_theme/theme.vpk").exists());
    assert!(extract_dir.join("README.md").exists()); // Metadata always extracted
}

#[test]
fn test_list_files() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = create_test_project(&temp_dir);
    
    // Pack the project
    let output_path = temp_dir.path().join("test-mod.dmodpkg");
    pack_mod(&project_dir, Some(&output_path), PackOptions::default()).unwrap();
    
    // List all files
    let files = list_files(&output_path).unwrap();
    assert_eq!(files.len(), 4);
    
    // Verify we have files from both layers
    let base_files: Vec<_> = files.iter().filter(|f| f.layer == "base").collect();
    let dark_files: Vec<_> = files.iter().filter(|f| f.layer == "dark_theme").collect();
    
    assert!(!base_files.is_empty());
    assert!(!dark_files.is_empty());
}

#[test]
fn test_compression_levels() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = create_test_project(&temp_dir);
    
    // Pack with low compression
    let mut options_low = PackOptions::default();
    options_low.compression_level = 1;
    let output_low = temp_dir.path().join("test-mod-low.dmodpkg");
    let result_low = pack_mod(&project_dir, Some(&output_low), options_low).unwrap();
    
    // Pack with high compression
    let mut options_high = PackOptions::default();
    options_high.compression_level = 22;
    let output_high = temp_dir.path().join("test-mod-high.dmodpkg");
    let result_high = pack_mod(&project_dir, Some(&output_high), options_high).unwrap();
    
    // High compression should produce smaller package
    let size_low = fs::metadata(&output_low).unwrap().len();
    let size_high = fs::metadata(&output_high).unwrap().len();
    
    assert!(size_high <= size_low);
    
    // Both should extract correctly
    let extract_low = temp_dir.path().join("extracted-low");
    extract_mod(&output_low, Some(&extract_low), ExtractOptions::default()).unwrap();
    
    let extract_high = temp_dir.path().join("extracted-high");
    extract_mod(&output_high, Some(&extract_high), ExtractOptions::default()).unwrap();
    
    // Verify both extracted correctly
    assert!(extract_low.join("content/base/test_file.vpk").exists());
    assert!(extract_high.join("content/base/test_file.vpk").exists());
}

#[test]
fn test_format_package_info() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = create_test_project(&temp_dir);
    
    let output_path = temp_dir.path().join("test-mod.dmodpkg");
    pack_mod(&project_dir, Some(&output_path), PackOptions::default()).unwrap();
    
    let info = read_package_info(&output_path).unwrap();
    let formatted = format_package_info(&info);
    
    // Verify formatted output contains key information
    assert!(formatted.contains("Test Mod"));
    assert!(formatted.contains("1.0.0"));
    assert!(formatted.contains("Test Author"));
    assert!(formatted.contains("Layers:"));
    assert!(formatted.contains("base"));
    assert!(formatted.contains("Package Info:"));
}

#[test]
fn test_validation() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = create_test_project(&temp_dir);
    
    // Test validation with valid project
    let config_content = fs::read_to_string(project_dir.join("mod.config.json")).unwrap();
    let config = ModConfig::from_json(&config_content).unwrap();
    
    let validation_options = ValidationOptions::default();
    let result = validate_project(&project_dir, &config, &validation_options).unwrap();
    
    // Should have minimal warnings for a well-formed project
    assert!(result.warnings.len() <= 2); // May warn about missing variant previews
}

#[test]
fn test_checksum_verification() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = create_test_project(&temp_dir);
    
    let output_path = temp_dir.path().join("test-mod.dmodpkg");
    pack_mod(&project_dir, Some(&output_path), PackOptions::default()).unwrap();
    
    // Extract with checksum verification enabled
    let extract_dir = temp_dir.path().join("extracted");
    let mut options = ExtractOptions::default();
    options.verify_checksums = true;
    
    let result = extract_mod(&output_path, Some(&extract_dir), options);
    assert!(result.is_ok());
}

