mod config;
mod error;
mod format;
mod types;

pub use config::{BundleConfig, ModConfig};
pub use error::{DmodpkgError, Result};
pub use format::{
    BundleHeader, DEFAULT_CHUNK_SIZE, DMODBUNDLE_MAGIC, DMODPKG_MAGIC, FORMAT_VERSION,
    MAX_CHUNK_SIZE, MIN_CHUNK_SIZE, MetadataSection, PackageHeader,
};
pub use types::*;

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod codegen {
    use super::*;
    use zod_gen::ZodGenerator;

    #[test]
    fn generate_zod_schemas() {
        let mut generator = ZodGenerator::new();
        generator.add_schema::<ModConfig>("ModConfig");
        generator.add_schema::<Author>("Author");
        generator.add_schema::<Layer>("Layer");
        generator.add_schema::<Variant>("Variant");
        generator.add_schema::<VariantGroup>("VariantGroup");
        generator.add_schema::<Metadata>("Metadata");
        generator.add_schema::<Dependency>("Dependency");
        generator.add_schema::<Conflict>("Conflict");

        let content = generator.generate();
        std::fs::create_dir_all("src/generated").ok();
        std::fs::write("src/generated/schemas.ts", content).unwrap();
    }
}

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
        assert_eq!(config.name.as_deref(), Some("test-mod"));
        assert_eq!(config.display_name.as_deref(), Some("Test Mod"));
        assert!(config.validate_full().is_ok());
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
