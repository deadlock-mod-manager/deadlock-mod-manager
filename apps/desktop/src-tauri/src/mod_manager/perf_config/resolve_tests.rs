use super::*;
use crate::mod_manager::perf_config::patch::test_support::{
  CURRENT_STOCK, entry, fixture, path, synthetic_config, test_catalog,
};
use crate::mod_manager::perf_config::types::{EntryOverride, GameplayClass};

fn live() -> LiveGameinfo {
  LiveGameinfo::parse(&fixture(CURRENT_STOCK)).expect("parse stock")
}

fn options(overrides: &[EntryOverride], include_engine_sections: bool) -> ResolveOptions<'_> {
  ResolveOptions {
    overrides,
    include_engine_sections,
  }
}

fn resolve_one(config: ConfigEntry, overrides: &[EntryOverride], include: bool) -> ResolvedEntry {
  let resolved = resolve(
    &test_catalog(),
    &[config],
    &live(),
    &options(overrides, include),
  );
  assert_eq!(resolved.entries.len(), 1);
  resolved.entries.into_iter().next().expect("one entry")
}

fn status_of(joined: &str, value: Option<&str>) -> (EntryStatus, Vec<EntryNote>) {
  let resolved = resolve_one(entry(joined, value), &[], false);
  (resolved.status, resolved.notes)
}

fn set(joined: &str, value: &str) -> EntryOverride {
  EntryOverride {
    path: path(joined),
    action: OverrideAction::Set {
      value: value.to_string(),
    },
  }
}

fn action(joined: &str, action: OverrideAction) -> EntryOverride {
  EntryOverride {
    path: path(joined),
    action,
  }
}

#[test]
fn excluded_and_denied_paths() {
  assert_eq!(
    status_of("PGIVersion", Some("0")),
    (
      EntryStatus::Excluded,
      vec![EntryNote::ExcludedSection {
        section: "PGIVersion".to_string()
      }]
    )
  );
  assert_eq!(
    status_of("FileSystem/SearchPaths/Game", Some("citadel/addons")),
    (
      EntryStatus::Excluded,
      vec![EntryNote::ExcludedSection {
        section: "FileSystem".to_string()
      }]
    )
  );
  assert_eq!(
    status_of("ConVars/sv_cheats", Some("1")),
    (
      EntryStatus::Denied,
      vec![EntryNote::Denied {
        reason: "cheats".to_string()
      }]
    )
  );
  assert_eq!(
    status_of("ConVars/host_timescale", Some("2")).0,
    EntryStatus::Denied
  );
}

/// Keys a GameBanana config put in ConVars, checked against the real catalog.
#[test]
fn unknown_convars_against_the_bundled_catalog() {
  let catalog = Catalog::bundled();
  let status = |joined: &str| {
    let resolved = resolve(
      &catalog,
      &[entry(joined, Some("0"))],
      &live(),
      &options(&[], false),
    );
    let entry = resolved.entries.into_iter().next().expect("one entry");
    (entry.status, entry.notes)
  };
  let section = |section: &str| EntryNote::SectionKey {
    section: section.to_string(),
  };

  // Valve's file sets these in SceneSystem; no convar dump has them.
  assert_eq!(
    status("ConVars/CubemapFog"),
    (EntryStatus::Removed, vec![section("SceneSystem")])
  );
  assert_eq!(
    status("ConVars/DefaultShadowTextureHeight"),
    (EntryStatus::Removed, vec![section("SceneSystem")])
  );
  // Neither a convar nor a key in any stock gameinfo.gi: no reason to give.
  assert_eq!(
    status("ConVars/EnableSunlight"),
    (EntryStatus::Removed, Vec::new())
  );
  // A real convar that left the dump keeps its build.
  assert_eq!(
    status("ConVars/animgraph_enable_parallel_op_evaluation"),
    (
      EntryStatus::Removed,
      vec![EntryNote::SinceBuild { build: 6711 }]
    )
  );
}

/// A value the live file doesn't set is compared with the convar's built-in
/// default, in any spelling (`1` for `true`).
#[test]
fn default_values_are_unchanged() {
  let catalog = Catalog::bundled();
  let status = |joined: &str, value: &str| {
    let resolved = resolve(
      &catalog,
      &[entry(joined, Some(value))],
      &live(),
      &options(&[], false),
    );
    resolved.entries[0].status
  };
  // Default true.
  assert_eq!(
    status("ConVars/citadel_damage_offscreen_indicator_disabled", "1"),
    EntryStatus::Unchanged
  );
  assert_eq!(
    status("ConVars/citadel_damage_offscreen_indicator_disabled", "0"),
    EntryStatus::Applies
  );
  // Default false.
  assert_eq!(
    status("ConVars/citadel_unit_status_hide_names", "1"),
    EntryStatus::Applies
  );
}

#[test]
fn convar_statuses_from_the_catalog() {
  assert_eq!(
    status_of("ConVars/r_shadows", Some("0")),
    (
      EntryStatus::Blocked,
      vec![EntryNote::SinceBuild { build: 6711 }]
    )
  );
  assert_eq!(
    status_of("ConVars/fog_enableskybox", Some("0")),
    (
      EntryStatus::Removed,
      vec![EntryNote::SinceBuild { build: 6736 }]
    )
  );
  assert_eq!(
    status_of("ConVars/not_a_convar_anymore", Some("0")),
    (EntryStatus::Removed, Vec::new())
  );
  assert_eq!(
    status_of("ConVars/CubemapFog", Some("0")),
    (
      EntryStatus::Removed,
      vec![EntryNote::SectionKey {
        section: "SceneSystem".to_string()
      }]
    )
  );
  assert_eq!(
    status_of("ConVars/cl_interp", Some("0")).0,
    EntryStatus::NotConvar
  );
}

#[test]
fn gameplay_classes() {
  let devtools = resolve_one(
    entry("ConVars/citadel_hideout_enable_testing_tools", Some("1")),
    &[],
    false,
  );
  assert_eq!(devtools.status, EntryStatus::Omitted);
  assert!(!devtools.overridden);
  assert_eq!(devtools.gameplay, Some(GameplayClass::Devtools));

  let enabled = resolve_one(
    entry("ConVars/citadel_hideout_enable_testing_tools", Some("1")),
    &[action(
      "ConVars/citadel_hideout_enable_testing_tools",
      OverrideAction::Enable,
    )],
    false,
  );
  assert_eq!(enabled.status, EntryStatus::Applies);
  assert!(enabled.overridden);

  let given_a_value = resolve_one(
    entry("ConVars/citadel_hideout_enable_testing_tools", Some("1")),
    &[set("ConVars/citadel_hideout_enable_testing_tools", "0")],
    false,
  );
  assert_eq!(given_a_value.status, EntryStatus::Applies);
  assert_eq!(given_a_value.value.as_deref(), Some("0"));

  let camera = resolve_one(
    entry("ConVars/citadel_camera_hero_fov", Some("100")),
    &[],
    false,
  );
  assert_eq!(camera.status, EntryStatus::Applies);
  assert_eq!(camera.gameplay, Some(GameplayClass::Camera));
  assert_eq!(
    camera.notes,
    vec![EntryNote::Clamped {
      effective: "90".to_string()
    }]
  );

  let visibility = resolve_one(
    entry("ConVars/citadel_trooper_glow_disabled", Some("1")),
    &[action(
      "ConVars/citadel_trooper_glow_disabled",
      OverrideAction::Omit,
    )],
    false,
  );
  assert_eq!(visibility.status, EntryStatus::Omitted);
  assert!(visibility.overridden);
}

#[test]
fn values_against_the_live_file() {
  assert_eq!(
    status_of("ConVars/fps_max", Some("400")).0,
    EntryStatus::Unchanged
  );
  assert_eq!(
    status_of("ConVars/FPS_MAX", Some("400.0")).0,
    EntryStatus::Unchanged
  );
  assert_eq!(
    status_of("ConVars/sv_lagcomp_filterbyviewangle", Some("0")).0,
    EntryStatus::Unchanged
  );
  assert_eq!(
    status_of("ConVars/fps_max", Some("240")),
    (EntryStatus::Applies, Vec::new())
  );
  assert_eq!(
    status_of("ConVars/fps_max", Some("0.25")),
    (
      EntryStatus::Applies,
      vec![EntryNote::TypeMismatch {
        expected: ConvarKind::Int
      }]
    )
  );
  assert_eq!(
    status_of("ConVars/fps_max", Some("5000")),
    (
      EntryStatus::Applies,
      vec![EntryNote::Clamped {
        effective: "1000".to_string()
      }]
    )
  );
  assert_eq!(
    status_of("ConVars/r_ssao", Some("maybe")),
    (
      EntryStatus::Applies,
      vec![EntryNote::TypeMismatch {
        expected: ConvarKind::Bool
      }]
    )
  );
  assert_eq!(
    status_of("ConVars/r_ssao", Some("false")),
    (EntryStatus::Applies, Vec::new())
  );
}

#[test]
fn comment_outs_only_apply_to_keys_the_file_has() {
  assert_eq!(
    status_of("ConVars/sv_minrate", None).0,
    EntryStatus::Applies
  );
  assert_eq!(status_of("ConVars/r_ssao", None).0, EntryStatus::Unchanged);
  assert_eq!(status_of("ConVars/rate/max", None).0, EntryStatus::Applies);
}

#[test]
fn shapes_the_file_cannot_take() {
  assert_eq!(
    status_of("ConVars/rate/max", Some("2000000")).0,
    EntryStatus::Applies
  );
  assert_eq!(
    status_of("ConVars/rate/version", Some("2")).0,
    EntryStatus::Applies
  );
  assert_eq!(
    status_of("ConVars/fps_max/max", Some("1")),
    (
      EntryStatus::Unsupported,
      vec![EntryNote::MissingSection {
        section: "ConVars/fps_max".to_string()
      }]
    )
  );
  assert_eq!(
    status_of("ConVars/rate", Some("5")).0,
    EntryStatus::Unsupported
  );
  assert_eq!(
    status_of("ConVars/r_ssao", Some("a\"b")).0,
    EntryStatus::Unsupported
  );
  assert_eq!(
    status_of("ConVars/r_ssao", Some("citadel/addons")).0,
    EntryStatus::Unsupported
  );
}

#[test]
fn engine_sections() {
  let guarded = vec![EntryNote::GuardedSection {
    section: "SceneSystem".to_string(),
  }];
  let off = resolve_one(
    entry("SceneSystem/CSMCascadeResolution", Some("512")),
    &[],
    false,
  );
  assert_eq!(
    (off.status, off.notes),
    (EntryStatus::EngineSection, guarded.clone())
  );
  assert_eq!(off.category, "shadows");

  let on = resolve_one(
    entry("SceneSystem/CSMCascadeResolution", Some("512")),
    &[],
    true,
  );
  assert_eq!((on.status, on.notes), (EntryStatus::Applies, guarded));

  let unguarded = resolve_one(entry("Physics/EnableWorldCompounds", Some("0")), &[], false);
  assert_eq!(
    (unguarded.status, unguarded.notes),
    (EntryStatus::EngineSection, Vec::new())
  );
  assert_eq!(unguarded.category, "other");

  let missing = resolve_one(entry("NoSuchSection/Key", Some("1")), &[], true);
  assert_eq!(
    (missing.status, missing.notes),
    (
      EntryStatus::Unsupported,
      vec![EntryNote::MissingSection {
        section: "NoSuchSection".to_string()
      }]
    )
  );

  let same = resolve_one(
    entry("SceneSystem/CSMCascadeResolution", Some("2048")),
    &[],
    true,
  );
  assert_eq!(same.status, EntryStatus::Unchanged);
}

#[test]
fn overrides_replace_add_and_omit() {
  let config = [
    entry("ConVars/fps_max", Some("0")),
    entry("ConVars/r_farz", Some("7000")),
  ];
  let overrides = [
    set("ConVars/fps_max", "200"),
    action("ConVars/r_farz", OverrideAction::Omit),
    set("ConVars/r_ssao", "0"),
    action("ConVars/never_in_config", OverrideAction::Omit),
  ];
  let resolved = resolve(
    &test_catalog(),
    &config,
    &live(),
    &options(&overrides, false),
  );
  assert_eq!(resolved.entries.len(), 3);

  let fps = &resolved.entries[0];
  assert_eq!(fps.value.as_deref(), Some("200"));
  assert_eq!(fps.config_value.as_deref(), Some("0"));
  assert_eq!(fps.live_value.as_deref(), Some("400"));
  assert_eq!(fps.status, EntryStatus::Applies);
  assert!(fps.overridden);
  assert!(fps.in_config);
  assert_eq!(fps.category, "cpu");

  assert_eq!(resolved.entries[1].status, EntryStatus::Omitted);
  assert!(resolved.entries[1].overridden);

  let added = &resolved.entries[2];
  assert_eq!(added.path, path("ConVars/r_ssao"));
  assert_eq!(added.value.as_deref(), Some("0"));
  assert_eq!(added.config_value, None);
  assert!(!added.in_config);
  assert_eq!(added.status, EntryStatus::Applies);
  assert!(added.overridden);

  assert_eq!(resolved.counts.overridden, 3);
  assert_eq!(resolved.counts.applies, 2);
  assert_eq!(resolved.counts.omitted, 1);
}

#[test]
fn duplicate_entries_keep_the_last_value() {
  let config = [
    entry("ConVars/fps_max", Some("1")),
    entry("ConVars/r_ssao", Some("0")),
    entry("convars/FPS_MAX", Some("2")),
  ];
  let resolved = resolve(&test_catalog(), &config, &live(), &options(&[], false));
  assert_eq!(resolved.entries.len(), 2);
  assert_eq!(resolved.entries[0].value.as_deref(), Some("2"));
  assert_eq!(resolved.entries[0].path, path("convars/FPS_MAX"));
}

#[test]
fn counts_cover_every_entry() {
  let resolved = resolve(
    &test_catalog(),
    &synthetic_config(),
    &live(),
    &options(&[], false),
  );
  let counts = &resolved.counts;
  let total = counts.applies
    + counts.unchanged
    + counts.blocked
    + counts.removed
    + counts.not_convar
    + counts.engine_section
    + counts.excluded
    + counts.denied
    + counts.omitted
    + counts.unsupported;
  assert_eq!(total as usize, resolved.entries.len());
  assert_eq!(counts.engine_section, 5);
}

#[test]
fn revision_tracks_only_what_is_written() {
  let catalog = test_catalog();
  let live = live();
  let rev = |config: &[ConfigEntry], include: bool| {
    resolve(&catalog, config, &live, &options(&[], include)).rev
  };
  let config = synthetic_config();
  let base = rev(&config, false);
  assert_eq!(base.len(), 12);
  assert!(base.chars().all(|ch| ch.is_ascii_hexdigit()));
  assert_eq!(rev(&config, false), base);

  let mut reversed = config.clone();
  reversed.reverse();
  assert_eq!(rev(&reversed, false), base);

  let mut with_noise = config.clone();
  with_noise.push(entry("ConVars/fps_max", Some("0")));
  with_noise.push(entry("ConVars/r_shadows", Some("0")));
  with_noise.push(entry("ConVars/sv_minrate", None));
  with_noise.push(entry("ConVars/fps_max_ui", Some("120")));
  assert_eq!(rev(&with_noise, false), base);

  let mut changed = config.clone();
  changed[0] = entry("ConVars/fps_max", Some("1"));
  assert_ne!(rev(&changed, false), base);
  assert_ne!(rev(&config, true), base);
}

#[test]
fn cut_score_rises_with_what_is_cut() {
  let catalog = test_catalog();
  let live = live();
  let score =
    |config: &[ConfigEntry]| resolve(&catalog, config, &live, &options(&[], false)).cut_score;
  assert_eq!(score(&[]), 0.0);

  let steps = [
    entry("ConVars/r_ssao", Some("0")),
    entry("ConVars/lb_enable_shadow_casting", Some("0")),
    entry("ConVars/r_farz", Some("7000")),
    entry("ConVars/r_texturefilteringquality", Some("0")),
    entry("ConVars/r_particle_max_size_cull", Some("900")),
    entry("ConVars/fps_max", Some("0")),
    entry("ConVars/sv_minrate", Some("1")),
  ];
  let mut previous = 0.0;
  for count in 1..=steps.len() {
    let current = score(&steps[..count]);
    assert!(current >= previous, "{count}: {current} < {previous}");
    assert!((0.0..=1.0).contains(&current));
    previous = current;
  }
  assert!(previous > 0.0);
  assert_eq!(score(&steps[6..]), 0.0);
}

#[test]
fn category_counts_score_like_resolved_configs() {
  let catalog = test_catalog();
  let config = [
    entry("ConVars/r_ssao", Some("0")),
    entry("ConVars/lb_enable_shadow_casting", Some("0")),
    entry("ConVars/r_farz", Some("7000")),
  ];
  let resolved = resolve(&catalog, &config, &live(), &options(&[], false));
  let counts: BTreeMap<String, u32> = [("shadows".to_string(), 2), ("world".to_string(), 1)]
    .into_iter()
    .collect();
  assert_eq!(
    cut_score_from_category_counts(&catalog, &counts),
    resolved.cut_score
  );
  let more: BTreeMap<String, u32> = [("shadows".to_string(), 9), ("world".to_string(), 1)]
    .into_iter()
    .collect();
  assert!(cut_score_from_category_counts(&catalog, &more) > resolved.cut_score);
}

#[test]
fn presets_and_inline_sources() {
  let catalog = test_catalog();
  let preset = entries_for_source(
    &catalog,
    &PerfConfigSource::Preset {
      id: "synthetic".to_string(),
    },
  )
  .expect("preset");
  assert_eq!(preset, synthetic_config());
  assert!(matches!(
    entries_for_source(
      &catalog,
      &PerfConfigSource::Preset {
        id: "missing".to_string()
      }
    ),
    Err(Error::PerformanceConfig(_))
  ));
  let inline = entries_for_source(
    &catalog,
    &PerfConfigSource::Inline {
      definition: crate::mod_manager::perf_config::types::PerfConfigDefinition {
        id: "user:1".to_string(),
        name: "Mine".to_string(),
        entries: vec![entry("ConVars/r_ssao", Some("0"))],
      },
    },
  )
  .expect("inline");
  assert_eq!(inline, vec![entry("ConVars/r_ssao", Some("0"))]);
}

#[test]
fn bundled_presets_spread_across_the_scale() {
  let catalog = Catalog::bundled();
  let Some(stock) = catalog.latest_stock() else {
    return;
  };
  let live = LiveGameinfo::from_entries(&stock.entries);
  let score = |id: &str| {
    let preset = catalog.preset(id).expect("bundled preset");
    resolve(&catalog, &preset.entries, &live, &options(&[], false)).cut_score
  };
  let clean = score("dmm-clean");
  let balanced = score("optimizationlock");
  let optilock = score("optilock-fps");
  assert!(clean < balanced && balanced < optilock);
  assert!(clean < 0.45, "dmm-clean at {clean}");
  assert!(optilock < 0.9, "optilock-fps at {optilock}");
}
