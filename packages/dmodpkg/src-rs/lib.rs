mod config;
mod error;
mod format;
mod types;

pub use config::{BundleConfig, ModConfig};
pub use error::{DmodpkgError, Result};
pub use format::{
    BundleHeader, PackageHeader, MetadataSection,
    DMODPKG_MAGIC, DMODBUNDLE_MAGIC, FORMAT_VERSION,
    DEFAULT_CHUNK_SIZE, MIN_CHUNK_SIZE, MAX_CHUNK_SIZE,
};
pub use types::*;

/// Get library version
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// FFI interface will be implemented later when needed
// For now, this module provides the Rust library foundation

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert!(!version().is_empty());
    }

    #[test]
    fn test_mod_config_parse() {
        let json = r#"{
            "name": "test-mod",
            "display_name": "Test Mod",
            "version": "1.0.0",
            "description": "A test mod",
            "authors": ["TestAuthor"],
            "layers": [
                {
                    "name": "base",
                    "priority": 0,
                    "required": true
                }
            ]
        }"#;

        let config = ModConfig::from_json(json).unwrap();
        assert_eq!(config.name, "test-mod");
        assert_eq!(config.display_name, "Test Mod");
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_bundle_config_parse() {
        let json = r#"{
            "name": "test-bundle",
            "display_name": "Test Bundle",
            "version": "1.0.0",
            "description": "A test bundle",
            "authors": ["TestAuthor"],
            "mods": [
                {
                    "package": "test-mod.dmodpkg",
                    "required": true
                }
            ]
        }"#;

        let config = BundleConfig::from_json(json).unwrap();
        assert_eq!(config.name, "test-bundle");
        assert_eq!(config.display_name, "Test Bundle");
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_format_constants() {
        assert_eq!(DMODPKG_MAGIC, b"DMODPKG\0");
        assert_eq!(DMODBUNDLE_MAGIC, b"DMODBNDL");
        assert_eq!(FORMAT_VERSION, 1);
        assert_eq!(DEFAULT_CHUNK_SIZE, 1024 * 1024);
    }
}

