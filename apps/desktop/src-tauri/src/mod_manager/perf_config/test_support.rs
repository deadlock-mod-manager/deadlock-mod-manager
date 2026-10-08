//! Fixtures and builders shared by the performance-config tests.

use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

use super::{SiteKind, parse_sites, scalar_values};
use crate::mod_manager::perf_config::catalog::{
  Catalog, CatalogCommunityConfig, CatalogFile, CatalogPreset, CatalogRules, DeniedRule, StockBuild,
};
use crate::mod_manager::perf_config::live::{path_key, values_equal};
use crate::mod_manager::perf_config::types::{
  CatalogOrigin, CategoryInfo, ConfigEntry, ConvarKind, ConvarMeta, ConvarStatus, EntryStatus,
  GameplayClass, PerfTier, PresetSourceInfo, ResolvedEntry,
};

/// Stock files from old to current. `stock-api-crlf.gi` is the API's copy of
/// the current build, with Valve's CRLF line endings.
pub const STOCK_FIXTURES: [&str; 5] = [
  "stock-2024-08-10.gi",
  "stock-2025-05-09.gi",
  "stock-2026-03-27.gi",
  "stock-2026-09-29.gi",
  "stock-api-crlf.gi",
];
pub const CURRENT_STOCK: &str = "stock-api-crlf.gi";
pub const SQOOKY: &str = "upstream-sqooky-default.gi";
pub const OPTILOCK: &str = "upstream-optilock-recommended.gi";

pub fn fixture_dir() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("tests")
    .join("fixtures")
    .join("perf_config")
}

pub fn fixture(name: &str) -> String {
  let path = fixture_dir().join(name);
  std::fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}

pub fn path(joined: &str) -> Vec<String> {
  joined.split('/').map(str::to_string).collect()
}

/// `text` with every line ending replaced by `eol`.
pub fn with_eol(text: &str, eol: &str) -> String {
  let lf = text.replace("\r\n", "\n");
  if eol == "\n" {
    lf
  } else {
    lf.replace('\n', eol)
  }
}

pub fn entry(joined: &str, value: Option<&str>) -> ConfigEntry {
  ConfigEntry {
    path: path(joined),
    value: value.map(str::to_string),
  }
}

/// A resolved entry that will be written, for driving the patcher directly.
pub fn applies(joined: &str, value: Option<&str>) -> ResolvedEntry {
  ResolvedEntry {
    path: path(joined),
    value: value.map(str::to_string),
    config_value: value.map(str::to_string),
    in_config: true,
    live_value: None,
    status: EntryStatus::Applies,
    notes: Vec::new(),
    overridden: false,
    category: "other".to_string(),
    gameplay: None,
    meta: None,
  }
}

/// Edits of every shape the patcher handles, written against the current
/// stock file: values with trailing comments, a duplicated key, an object
/// leaf edit and insert, comment-outs, new ConVars and engine-section edits.
pub fn synthetic_config() -> Vec<ConfigEntry> {
  vec![
    entry("ConVars/fps_max", Some("0")),
    entry("ConVars/cl_tickpacket_recvmargin_desired", Some("9")),
    entry("ConVars/snd_steamaudio_enable_pathing", Some("1")),
    entry("ConVars/rate/max", Some("2000000")),
    entry("ConVars/rate/version", Some("3")),
    entry("ConVars/sv_minrate", None),
    entry("ConVars/r_ssao", Some("0")),
    entry("ConVars/lb_enable_shadow_casting", Some("false")),
    entry("ConVars/r_farz", Some("7000")),
    entry("SceneSystem/CSMCascadeResolution", Some("512")),
    entry("SceneSystem/CubemapFog", None),
    entry("SceneSystem/DmmTestKey", Some("1")),
    entry("NetworkSystem/BetaUniverse/FakeLag", Some("0")),
    entry("RenderSystem/LowLatency", Some("0")),
  ]
}

/// Every scalar of an upstream file that differs from `base` or that `base`
/// lacks: the file read as a config, phantom edits included.
pub fn config_from_file(file: &str, base: &str) -> Vec<ConfigEntry> {
  let base = scalar_values(&parse_sites(base).expect("parse base"));
  let sites = parse_sites(file).expect("parse config file");
  let mut seen = BTreeSet::new();
  let mut entries: Vec<ConfigEntry> = Vec::new();
  for site in sites.iter().rev() {
    let SiteKind::Scalar { value, .. } = &site.kind else {
      continue;
    };
    let key = path_key(&site.path);
    if !seen.insert(key.clone()) {
      continue;
    }
    if base
      .get(&key)
      .is_some_and(|stock| values_equal(stock, value))
    {
      continue;
    }
    entries.push(ConfigEntry {
      path: site.path.clone(),
      value: Some(value.clone()),
    });
  }
  entries.reverse();
  entries
}

fn meta(name: &str, kind: ConvarKind, category: &str) -> ConvarMeta {
  ConvarMeta {
    name: name.to_string(),
    kind,
    default: None,
    min: None,
    max: None,
    step: None,
    enum_values: Vec::new(),
    flags: Vec::new(),
    help: None,
    label: None,
    description: None,
    category: category.to_string(),
    gameplay: None,
    side_effects: None,
    status: ConvarStatus::Active,
    status_since_build: None,
  }
}

/// Convars with curated facts the resolve tests rely on.
fn curated_convars() -> Vec<ConvarMeta> {
  vec![
    ConvarMeta {
      min: Some(0.0),
      max: Some(1000.0),
      ..meta("fps_max", ConvarKind::Int, "cpu")
    },
    meta("r_ssao", ConvarKind::Bool, "shadows"),
    meta("lb_enable_shadow_casting", ConvarKind::Bool, "shadows"),
    meta("r_texturefilteringquality", ConvarKind::Int, "textures"),
    meta("r_particle_max_size_cull", ConvarKind::Float, "particles"),
    meta("r_farz", ConvarKind::Int, "world"),
    meta("snd_steamaudio_enable_pathing", ConvarKind::Bool, "audio"),
    meta("rate", ConvarKind::Int, "network"),
    meta("sv_minrate", ConvarKind::Int, "network"),
    ConvarMeta {
      status: ConvarStatus::Blocked,
      status_since_build: Some(6711),
      ..meta("r_shadows", ConvarKind::Bool, "shadows")
    },
    ConvarMeta {
      status: ConvarStatus::Removed,
      status_since_build: Some(6736),
      ..meta("fog_enableskybox", ConvarKind::Bool, "world")
    },
    ConvarMeta {
      status: ConvarStatus::NotConvar,
      ..meta("cl_interp", ConvarKind::Float, "network")
    },
    ConvarMeta {
      gameplay: Some(GameplayClass::Devtools),
      ..meta(
        "citadel_hideout_enable_testing_tools",
        ConvarKind::Bool,
        "other",
      )
    },
    ConvarMeta {
      gameplay: Some(GameplayClass::Camera),
      min: Some(75.0),
      max: Some(90.0),
      ..meta("citadel_camera_hero_fov", ConvarKind::Int, "camera")
    },
    ConvarMeta {
      gameplay: Some(GameplayClass::Visibility),
      ..meta("citadel_trooper_glow_disabled", ConvarKind::Bool, "camera")
    },
  ]
}

fn categories() -> Vec<CategoryInfo> {
  [
    ("shadows", 3.0),
    ("postprocessing", 2.0),
    ("textures", 2.0),
    ("particles", 2.0),
    ("world", 2.5),
    ("cpu", 1.0),
    ("network", 0.0),
    ("interface", 0.5),
    ("audio", 0.5),
    ("camera", 0.0),
    ("other", 0.5),
  ]
  .into_iter()
  .map(|(id, weight)| CategoryInfo {
    id: id.to_string(),
    label: id.to_string(),
    weight,
  })
  .collect()
}

fn rules() -> CatalogRules {
  CatalogRules {
    excluded_sections: [
      "FileSystem",
      "MaterialSystem2/RenderModes",
      "Hammer",
      "ResourceCompiler",
      "ContentBuilder",
      "ToolsEnvironment",
      "MaterialEditor",
      "ModelDoc",
      "Localize",
      "SupportedLanguages",
      "hidden_maps",
    ]
    .map(str::to_string)
    .to_vec(),
    guarded_sections: [
      "Engine2",
      "MaterialSystem2",
      "NetworkSystem",
      "Particles",
      "RenderSystem",
      "SceneSystem",
      "WorldRenderer",
    ]
    .map(str::to_string)
    .to_vec(),
    denied: vec![
      DeniedRule {
        path: Some(path("ConVars/sv_cheats")),
        pattern: None,
        reason: "cheats".to_string(),
      },
      DeniedRule {
        path: None,
        pattern: Some("^(host_)?timescale$".to_string()),
        reason: "game speed".to_string(),
      },
    ],
  }
}

fn preset(id: &str, entries: Vec<ConfigEntry>) -> CatalogPreset {
  CatalogPreset {
    id: id.to_string(),
    name: format!("Preset {id}"),
    author: "Tester".to_string(),
    tier: PerfTier::Balanced,
    blurb: String::new(),
    highlights: Vec::new(),
    recommended: false,
    version: Some("1.0".to_string()),
    updated_at: None,
    base_build: None,
    source: PresetSourceInfo::Github {
      repo: "tester/configs".to_string(),
      path: "gameinfo.gi".to_string(),
      commit: "0123456789abcdef0123456789abcdef01234567".to_string(),
      url: "https://github.com/tester/configs".to_string(),
      license: "GPL-3.0".to_string(),
    },
    entries,
    video_settings: Vec::new(),
    notes: Vec::new(),
  }
}

/// A catalog that knows every ConVars key in the fixtures (as plain strings in
/// "other") plus the curated cases, with presets `synthetic`, `sqooky` and
/// `noop` (stock values only) and the current stock file as its latest build.
pub fn test_catalog() -> Catalog {
  let stock_text = fixture(CURRENT_STOCK);
  let mut convars: BTreeMap<String, ConvarMeta> = BTreeMap::new();
  for name in STOCK_FIXTURES.iter().chain(&[SQOOKY, OPTILOCK]) {
    for site in parse_sites(&fixture(name)).expect("parse fixture") {
      if site.path.len() >= 2 && site.path[0].eq_ignore_ascii_case("ConVars") {
        let name = site.path[1].to_ascii_lowercase();
        convars
          .entry(name.clone())
          .or_insert_with(|| meta(&name, ConvarKind::String, "other"));
      }
    }
  }
  for curated in curated_convars() {
    convars.insert(curated.name.clone(), curated);
  }

  let stock_entries: Vec<ConfigEntry> = parse_sites(&stock_text)
    .expect("parse stock")
    .into_iter()
    .filter_map(|site| match site.kind {
      SiteKind::Scalar { value, .. } => Some(ConfigEntry {
        path: site.path,
        value: Some(value),
      }),
      SiteKind::Object { .. } => None,
    })
    .collect();
  let noop = vec![
    entry("ConVars/fps_max", Some("400")),
    entry("ConVars/r_ssao", None),
  ];

  let file = CatalogFile {
    schema_version: crate::mod_manager::perf_config::catalog::SCHEMA_VERSION,
    version: "2026.10.08-1".to_string(),
    generated_at: "2026-10-08T00:00:00Z".to_string(),
    latest_build: Some(6711),
    convar_build: Some(6757),
    categories: categories(),
    section_categories: [
      ("scenesystem", "shadows"),
      ("worldrenderer", "world"),
      ("rendersystem", "cpu"),
      ("particles", "particles"),
      ("networksystem", "network"),
    ]
    .into_iter()
    .map(|(section, category)| (section.to_string(), category.to_string()))
    .collect(),
    convars: convars.into_values().collect(),
    stock: vec![StockBuild {
      build: 6711,
      date: "2026-09-29".to_string(),
      pgi_version: None,
      entries: stock_entries,
    }],
    presets: vec![
      preset("synthetic", synthetic_config()),
      preset("sqooky", config_from_file(&fixture(SQOOKY), &stock_text)),
      preset("noop", noop),
    ],
    community: vec![CatalogCommunityConfig {
      id: "gb-1".to_string(),
      gamebanana_id: 1,
      name: "Community".to_string(),
      author: "Someone".to_string(),
      downloads: 10,
      updated_at: None,
      tier: PerfTier::Lean,
      blurb: String::new(),
      base_build: None,
      file_id: 2,
      variant_hint: None,
      settings_count: 12,
      engine_edit_count: 0,
      category_counts: [("shadows".to_string(), 5), ("world".to_string(), 3)]
        .into_iter()
        .collect(),
    }],
    rules: rules(),
  };
  Catalog::from_file(file, CatalogOrigin::Bundled).expect("test catalog")
}
