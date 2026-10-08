//! Fixtures and builders shared by the import tests.
//!
//! Import fixtures live in `tests/fixtures/perf_import`; the stock files and
//! the two upstream configs the patcher tests also use are read from
//! `tests/fixtures/perf_config`.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::mod_manager::perf_config::analyze::AnalyzeContext;
use crate::mod_manager::perf_config::catalog::Catalog;
use crate::mod_manager::perf_config::formats;
pub use crate::mod_manager::perf_config::patch::test_support::{OPTILOCK, SQOOKY, path};
use crate::mod_manager::perf_config::types::CatalogOrigin;

pub const DYSON_RUSSIAN: &str = "dyson-russian.gi";
pub const DYSON_ENGLISH: &str = "dyson-english.gi";
pub const OPTILOCK_VIDEO: &str = "optilock-video.txt";
pub const KAIZU: &str = "kaizu.gi";
pub const FOG_SNIPPET: &str = "fog-removal-snippet.txt";
pub const AUTOEXEC: &str = "maidehnless-autoexec.cfg";
pub const OVERRIDES: &str = "overrides.gi";
pub const STOCK_6462: &str = "stock-6462.gi";
pub const STOCK_6652: &str = "stock-6652.gi";
pub const STOCK_6711: &str = "stock-2026-09-29.gi";

pub fn fixture_path(name: &str) -> PathBuf {
  let fixtures = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("tests")
    .join("fixtures");
  let import = fixtures.join("perf_import").join(name);
  if import.exists() {
    import
  } else {
    fixtures.join("perf_config").join(name)
  }
}

pub fn fixture_bytes(name: &str) -> Vec<u8> {
  let path = fixture_path(name);
  std::fs::read(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}

pub fn fixture(name: &str) -> String {
  formats::decode_text(&fixture_bytes(name))
}

/// The bundled catalog without its stock history, as the placeholder catalog
/// shipped before the generator ran.
pub fn catalog_without_stock() -> Arc<Catalog> {
  let mut file = Catalog::bundled().file.clone();
  file.stock.clear();
  Arc::new(Catalog::from_file(file, CatalogOrigin::Bundled).expect("catalog without stock"))
}

/// A context with no game folder, so imports resolve against the catalog's
/// newest stock file.
pub fn context(app_data_dir: &Path, catalog: Arc<Catalog>) -> AnalyzeContext {
  AnalyzeContext {
    catalog,
    game_path: None,
    app_data_dir: app_data_dir.to_path_buf(),
  }
}
