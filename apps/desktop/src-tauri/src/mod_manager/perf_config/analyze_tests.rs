use std::io::Write;

use super::*;
use crate::mod_manager::perf_config::formats::import_test_support::{
  AUTOEXEC, DYSON_ENGLISH, DYSON_RUSSIAN, FOG_SNIPPET, KAIZU, OPTILOCK, OPTILOCK_VIDEO, OVERRIDES,
  SQOOKY, STOCK_6462, STOCK_6652, STOCK_6711, catalog_without_stock, context, fixture,
  fixture_bytes,
};
use crate::mod_manager::perf_config::types::{OverrideAction, PerfApplyRequest, PerfConfigSource};

fn draft(text: &str, file_name: &str) -> Draft {
  draft_from_text(&Catalog::bundled(), text, Some(file_name)).unwrap()
}

fn has_entry(entries: &[ConfigEntry], joined: &str) -> bool {
  entries.iter().any(|entry| entry.path.join("/") == joined)
}

fn ignored_details(ignored: &[IgnoredPart], kind: IgnoredKind) -> Vec<&str> {
  ignored
    .iter()
    .filter(|part| part.kind == kind)
    .map(|part| part.detail.as_str())
    .collect()
}

/// Normalized values by path key for the scope base matching compares.
fn compared_values(catalog: &Catalog, entries: &[ConfigEntry]) -> HashMap<String, String> {
  entries
    .iter()
    .filter(|entry| entry.path.len() > 1 && catalog.excluded_section(&entry.path).is_none())
    .filter_map(|entry| {
      Some((
        path_key(&entry.path),
        normalize_value(entry.value.as_deref()?),
      ))
    })
    .collect()
}

fn stock(catalog: &Catalog, build: u32) -> &StockBuild {
  catalog
    .stock_builds()
    .iter()
    .find(|stock| stock.build == build)
    .unwrap_or_else(|| panic!("stock build {build}"))
}

fn write_zip(path: &Path, files: &[(&str, &[u8])]) {
  let mut writer = zip::ZipWriter::new(fs::File::create(path).unwrap());
  for (name, contents) in files {
    writer
      .start_file(*name, zip::write::SimpleFileOptions::default())
      .unwrap();
    writer.write_all(contents).unwrap();
  }
  writer.finish().unwrap();
}

fn game_folder(gameinfo: &str) -> tempfile::TempDir {
  let game = tempfile::tempdir().unwrap();
  let citadel = game.path().join("game").join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  fs::write(citadel.join("gameinfo.gi"), gameinfo).unwrap();
  game
}

#[test]
fn bundled_catalog_has_the_stock_history() {
  let catalog = Catalog::bundled();
  assert!(catalog.stock_builds().len() >= 40);
  assert_eq!(catalog.latest_stock().map(|stock| stock.build), Some(6711));
}

#[test]
fn optilock_is_diffed_against_the_build_its_pgiversion_names() {
  let catalog = Catalog::bundled();
  let text = fixture(OPTILOCK);
  let draft = draft(&text, "gameinfo.gi");
  assert_eq!(draft.format, ImportFormat::FullGameinfo);
  let base = draft.base.clone().expect("base");
  assert_eq!(
    (base.build, base.exact, base.distance),
    (6462, true, 0),
    "6417 and 6462 share the hash; the closer one wins"
  );
  assert!(
    draft
      .warnings
      .iter()
      .any(|warning| warning.contains("Built for game build 6462 (2026-04-28)"))
  );

  for entry in &draft.entries {
    assert!(entry.path.len() > 1, "root key imported: {:?}", entry.path);
    assert!(
      catalog.excluded_section(&entry.path).is_none(),
      "excluded section imported: {:?}",
      entry.path
    );
  }
  assert_eq!(
    ignored_details(&draft.ignored, IgnoredKind::SearchPaths),
    vec!["FileSystem"]
  );
  assert_eq!(
    ignored_details(&draft.ignored, IgnoredKind::ListSection),
    vec!["MaterialSystem2/RenderModes"]
  );
  let root_keys = ignored_details(&draft.ignored, IgnoredKind::RootKey);
  assert!(root_keys.contains(&"PGIVersion"));
  assert!(root_keys.contains(&"DisallowGameInfoConditionals"));
  assert_eq!(
    ignored_details(&draft.ignored, IgnoredKind::ModManagerMarkers).len(),
    1
  );

  let convars = draft
    .entries
    .iter()
    .filter(|entry| entry.path[0] == "ConVars")
    .count();
  assert_eq!(convars, 499, "matches the research's count against b6462");

  // Valve changed these between 6462 and 6711 and the file still has 6462's
  // value: diffing against today's stock would invent an edit for each.
  let parsed = formats::parse(&text, ImportFormat::FullGameinfo);
  let (file_entries, _) = formats::collapse(&parsed.leaves);
  let file = compared_values(&catalog, &file_entries);
  let old = compared_values(&catalog, &stock(&catalog, 6462).entries);
  let new = compared_values(&catalog, &stock(&catalog, 6711).entries);
  let phantom: Vec<&String> = old
    .iter()
    .filter(|(key, value)| {
      new.get(*key).is_some_and(|now| now != *value) && file.get(*key) == Some(*value)
    })
    .map(|(key, _)| key)
    .collect();
  assert!(!phantom.is_empty());
  for key in phantom {
    assert!(
      !draft
        .entries
        .iter()
        .any(|entry| path_key(&entry.path) == *key),
      "{key} is Valve's change, not the author's"
    );
  }
}

#[test]
fn sqooky_matches_the_current_build_exactly() {
  let draft = draft(&fixture(SQOOKY), "gameinfo.gi");
  let base = draft.base.expect("base");
  assert_eq!((base.build, base.exact, base.distance), (6711, true, 0));
  assert!(
    !draft
      .warnings
      .iter()
      .any(|warning| warning.contains("Built for"))
  );
  assert!(has_entry(&draft.entries, "ConVars/r_ssao"));
  let sections: std::collections::BTreeSet<&str> = draft
    .entries
    .iter()
    .map(|entry| entry.path[0].as_str())
    .filter(|section| *section != "ConVars")
    .collect();
  assert_eq!(
    sections.into_iter().collect::<Vec<_>>(),
    vec!["Particles", "RenderSystem", "SceneSystem", "WorldRenderer"]
  );
}

#[test]
fn files_without_pgiversion_match_the_closest_build() {
  let kaizu = draft(&fixture(KAIZU), "gameinfo.gi");
  let base = kaizu.base.expect("base");
  assert!(!base.exact, "Kaizu comments PGIVersion out");
  assert_eq!(base.build, 6711);
  assert!(base.distance < 30, "distance {}", base.distance);
  assert!(!ignored_details(&kaizu.ignored, IgnoredKind::RootKey).contains(&"PGIVersion"));

  let stock_copy: String = fixture(STOCK_6652)
    .lines()
    .filter(|line| !line.contains("PGIVersion"))
    .collect::<Vec<_>>()
    .join("\r\n");
  let copy = draft(&stock_copy, "gameinfo.gi");
  let base = copy.base.expect("base");
  assert_eq!((base.build, base.exact, base.distance), (6652, false, 0));
  assert!(copy.entries.is_empty());

  let crlf = draft(&fixture(STOCK_6711).replace('\n', "\r\n"), "gameinfo.gi");
  assert_eq!(
    crlf.base.map(|base| (base.build, base.exact)),
    Some((6711, true))
  );
  assert!(crlf.entries.is_empty());
  assert!(crlf.ignored.iter().all(|part| matches!(
    part.kind,
    IgnoredKind::SearchPaths | IgnoredKind::ListSection | IgnoredKind::RootKey
  )));
}

#[test]
fn translated_files_import_the_same_settings() {
  let russian = draft(&fixture(DYSON_RUSSIAN), "gameinfo.gi");
  let english = draft(&fixture(DYSON_ENGLISH), "gameinfo.gi");
  assert_eq!(russian.base.as_ref().map(|base| base.build), Some(6462));
  assert_eq!(russian.entries.len(), english.entries.len());
  assert!(russian.entries.len() > 600);
  assert!(
    ignored_details(&russian.ignored, IgnoredKind::DuplicateKey)
      .contains(&"ConVars/cl_async_usercmd_send = true"),
    "Valve's own line further down overrides the author's"
  );
  assert!(!has_entry(
    &russian.entries,
    "ConVars/cl_async_usercmd_send"
  ));
}

#[test]
fn without_stock_history_every_value_counts_as_intended() {
  let catalog = catalog_without_stock();
  let draft = draft_from_text(&catalog, &fixture(OPTILOCK), Some("gameinfo.gi")).unwrap();
  assert_eq!(draft.base, None);
  assert!(has_entry(&draft.entries, "ConVars/rate/min"));
  assert!(has_entry(&draft.entries, "SceneSystem/GpuLightBinner"));
  assert!(!draft.entries.iter().any(|entry| entry.path.len() == 1));
  assert_eq!(
    ignored_details(&draft.ignored, IgnoredKind::RootKey),
    vec!["DisallowGameInfoConditionals", "PGIVersion"]
  );
}

#[tokio::test]
async fn no_ops_resolve_as_unchanged_against_the_live_file() {
  let app_data = tempfile::tempdir().unwrap();
  let game = game_folder(&fixture(STOCK_6711));
  let mut ctx = context(app_data.path(), catalog_without_stock());
  ctx.game_path = Some(game.path().to_path_buf());
  let report = analyze(
    &ctx,
    ImportSource::Text {
      text: fixture(SQOOKY),
      file_name: Some("gameinfo.gi".to_string()),
    },
  )
  .await
  .unwrap();
  assert_eq!(report.base, None);
  assert!(report.resolved.counts.unchanged > 50);
  assert!(report.resolved.counts.applies > 50);
}

#[tokio::test]
async fn every_text_format_imports() {
  let app_data = tempfile::tempdir().unwrap();
  let ctx = context(app_data.path(), Catalog::bundled());
  let import = |text: String, file_name: Option<&str>| {
    let ctx = ctx.clone();
    let file_name = file_name.map(str::to_string);
    async move { analyze(&ctx, ImportSource::Text { text, file_name }).await }
  };

  let fog = import(fixture(FOG_SNIPPET), Some("FOG Removal.txt"))
    .await
    .unwrap();
  assert_eq!(fog.format, ImportFormat::ConvarsSnippet);
  assert_eq!(fog.base, None);
  assert_eq!(fog.entries.len(), 5);
  assert_eq!(fog.suggested_name.as_deref(), Some("FOG Removal"));
  assert_eq!(fog.resolved.entries.len(), 5);

  let cfg = import(fixture(AUTOEXEC), Some("rawcode.cfg"))
    .await
    .unwrap();
  assert_eq!(cfg.format, ImportFormat::Cfg);
  assert_eq!(
    cfg.suggested_name, None,
    "rawcode says nothing about the config"
  );
  assert!(has_entry(&cfg.entries, "ConVars/fps_max"));
  assert!(!ignored_details(&cfg.ignored, IgnoredKind::Bind).is_empty());
  assert!(!ignored_details(&cfg.ignored, IgnoredKind::Alias).is_empty());

  let overrides = import(fixture(OVERRIDES), None).await.unwrap();
  assert_eq!(overrides.format, ImportFormat::OverridesGi);
  assert_eq!(
    overrides
      .entries
      .iter()
      .filter(|entry| entry.value.is_none())
      .count(),
    5
  );

  let video = import(fixture(OPTILOCK_VIDEO), Some("video.txt"))
    .await
    .unwrap();
  assert_eq!(video.format, ImportFormat::VideoTxt);
  assert!(video.entries.is_empty());
  assert!(!video.video_settings.is_empty());
  assert!(!ignored_details(&video.ignored, IgnoredKind::MachineSpecific).is_empty());

  for garbage in ["", "hello there, this is my config", "{{{{"] {
    assert!(
      matches!(
        import(garbage.to_string(), None).await,
        Err(Error::InvalidInput(_))
      ),
      "{garbage:?}"
    );
  }
  let huge = "r_ssao 0\n".repeat(600_000);
  assert!(matches!(
    import(huge, None).await,
    Err(Error::InvalidInput(_))
  ));
}

#[tokio::test]
async fn share_codes_import_presets_with_their_overrides() {
  let app_data = tempfile::tempdir().unwrap();
  let catalog = Catalog::bundled();
  let preset = catalog.preset("optimizationlock").expect("preset");
  let ctx = context(app_data.path(), catalog.clone());
  let request = PerfApplyRequest {
    config_id: "preset:optimizationlock".to_string(),
    name: "Sqooky, 240 fps".to_string(),
    source: PerfConfigSource::Preset {
      id: "optimizationlock".to_string(),
    },
    overrides: vec![EntryOverride {
      path: vec!["ConVars".to_string(), "fps_max".to_string()],
      action: OverrideAction::Set {
        value: "240".to_string(),
      },
    }],
    include_engine_sections: false,
  };
  let code = share::encode(&request).unwrap();
  let report = analyze(
    &ctx,
    ImportSource::Text {
      text: code,
      file_name: None,
    },
  )
  .await
  .unwrap();
  assert_eq!(report.format, ImportFormat::ShareCode);
  assert_eq!(report.preset_id.as_deref(), Some("optimizationlock"));
  assert_eq!(report.suggested_name.as_deref(), Some("Sqooky, 240 fps"));
  assert_eq!(report.entries, preset.entries);
  assert_eq!(report.overrides, request.overrides);
  let fps = report
    .resolved
    .entries
    .iter()
    .find(|entry| entry.path.join("/") == "ConVars/fps_max")
    .expect("fps_max");
  assert_eq!(fps.value.as_deref(), Some("240"));

  let unknown = share::encode(&PerfApplyRequest {
    source: PerfConfigSource::Preset {
      id: "retired-preset".to_string(),
    },
    ..request
  })
  .unwrap();
  let report = analyze(
    &ctx,
    ImportSource::Text {
      text: unknown,
      file_name: None,
    },
  )
  .await
  .unwrap();
  assert!(report.entries.is_empty());
  assert!(
    report
      .warnings
      .iter()
      .any(|warning| warning.contains("retired-preset"))
  );
}

#[tokio::test]
async fn files_are_named_after_their_folder() {
  let app_data = tempfile::tempdir().unwrap();
  let ctx = context(app_data.path(), Catalog::bundled());
  let downloads = tempfile::tempdir().unwrap();
  let folder = downloads.path().join("OptiLock FPS Config (Recommended)");
  fs::create_dir_all(&folder).unwrap();
  fs::write(folder.join("gameinfo.gi"), fixture_bytes(OPTILOCK)).unwrap();
  let report = analyze(
    &ctx,
    ImportSource::File {
      path: folder.join("gameinfo.gi").to_string_lossy().to_string(),
    },
  )
  .await
  .unwrap();
  assert_eq!(report.format, ImportFormat::FullGameinfo);
  assert_eq!(
    report.suggested_name.as_deref(),
    Some("OptiLock FPS Config (Recommended)")
  );
  assert_eq!(report.base.map(|base| base.build), Some(6462));
  assert_eq!(report.staging_id, None);
}

#[tokio::test]
async fn archives_stage_variants_and_pick_the_original() {
  let app_data = tempfile::tempdir().unwrap();
  let ctx = context(app_data.path(), Catalog::bundled());
  let downloads = tempfile::tempdir().unwrap();
  let archive = downloads.path().join("dyson-config.zip");
  let folder = "dyson build/gameinfo (now with 15 languages)";
  let russian = format!("{folder}/russian/gameinfo.gi");
  let english = format!("{folder}/english/gameinfo.gi");
  let video = format!("{folder}/english/video.txt");
  write_zip(
    &archive,
    &[
      (&russian, &fixture_bytes(DYSON_RUSSIAN)),
      (&english, &fixture_bytes(DYSON_ENGLISH)),
      (&video, &fixture_bytes(OPTILOCK_VIDEO)),
      (
        "dyson build/gameinfo default.gi",
        &fixture_bytes(STOCK_6462),
      ),
      ("dyson build/readme eu.txt", b"fps_max 0\nr_ssao 0\n"),
      ("dyson build/pak01_dir.vpk", b"vpk"),
    ],
  );

  let report = analyze(
    &ctx,
    ImportSource::File {
      path: archive.to_string_lossy().to_string(),
    },
  )
  .await
  .unwrap();
  let staging_id = report.staging_id.clone().expect("staged");
  assert_eq!(report.selected_variant.as_deref(), Some(english.as_str()));
  assert_eq!(report.variants.len(), 3);
  let russian_variant = report
    .variants
    .iter()
    .find(|variant| variant.path == russian)
    .expect("russian variant");
  assert_eq!(
    russian_variant.duplicate_of.as_deref(),
    Some(english.as_str())
  );
  assert_eq!(
    report.suggested_name.as_deref(),
    Some("dyson-config – English")
  );
  assert_eq!(report.base.as_ref().map(|base| base.build), Some(6462));
  assert!(
    report
      .warnings
      .iter()
      .any(|warning| warning.contains("1 translated copy"))
  );
  assert!(
    report
      .video_settings
      .iter()
      .any(|setting| setting.key == "r_citadel_shadow_quality"),
    "video.txt beside the variant"
  );
  assert!(!ignored_details(&report.ignored, IgnoredKind::MachineSpecific).is_empty());

  let staged = analyze(
    &ctx,
    ImportSource::Staged {
      staging_id: staging_id.clone(),
      variant_path: russian.clone(),
    },
  )
  .await
  .unwrap();
  assert_eq!(staged.selected_variant.as_deref(), Some(russian.as_str()));
  assert_eq!(staged.staging_id.as_deref(), Some(staging_id.as_str()));
  assert_eq!(staged.entries.len(), report.entries.len());

  let missing = analyze(
    &ctx,
    ImportSource::Staged {
      staging_id: staging_id.clone(),
      variant_path: "../../gameinfo.gi".to_string(),
    },
  )
  .await;
  assert!(matches!(missing, Err(Error::InvalidInput(_))));

  staging::discard(app_data.path(), &staging_id).unwrap();
  let expired = analyze(
    &ctx,
    ImportSource::Staged {
      staging_id,
      variant_path: english,
    },
  )
  .await;
  assert!(matches!(expired, Err(Error::PerformanceConfig(_))));
}

#[tokio::test]
async fn unsafe_and_empty_archives_are_refused() {
  let app_data = tempfile::tempdir().unwrap();
  let ctx = context(app_data.path(), Catalog::bundled());
  let downloads = tempfile::tempdir().unwrap();

  let traversal = downloads.path().join("nested").join("evil.zip");
  fs::create_dir_all(traversal.parent().unwrap()).unwrap();
  write_zip(
    &traversal,
    &[("../../escaped.gi", fixture(SQOOKY).as_bytes())],
  );
  let result = analyze(
    &ctx,
    ImportSource::File {
      path: traversal.to_string_lossy().to_string(),
    },
  )
  .await;
  assert!(
    matches!(result, Err(Error::UnauthorizedPath(_))),
    "{result:?}"
  );
  assert!(!downloads.path().join("escaped.gi").exists());

  let skin = downloads.path().join("skin.zip");
  write_zip(
    &skin,
    &[("pak01_dir.vpk", b"vpk"), ("readme.txt", b"enjoy")],
  );
  let result = analyze(
    &ctx,
    ImportSource::File {
      path: skin.to_string_lossy().to_string(),
    },
  )
  .await;
  assert!(
    matches!(result, Err(Error::PerformanceConfig(_))),
    "{result:?}"
  );
}

#[tokio::test]
async fn archives_are_recognised_by_content() {
  let downloads = tempfile::tempdir().unwrap();
  let download = downloads.path().join("download");
  write_zip(&download, &[("gameinfo.gi", fixture(SQOOKY).as_bytes())]);
  assert_eq!(archive_kind(&download).unwrap(), Some("zip"));
  fs::write(&download, fixture(SQOOKY)).unwrap();
  assert_eq!(archive_kind(&download).unwrap(), None);
  fs::write(&download, b"").unwrap();
  assert_eq!(archive_kind(&download).unwrap(), None);

  let app_data = tempfile::tempdir().unwrap();
  let ctx = context(app_data.path(), Catalog::bundled());
  write_zip(
    &download,
    &[("Sqooky/gameinfo.gi", fixture(SQOOKY).as_bytes())],
  );
  let report = run_blocking({
    let ctx = ctx.clone();
    let download = download.clone();
    move || {
      analyze_file(
        &ctx,
        &download,
        FileName::Given(Some("Sqooky's fps config".to_string())),
      )
    }
  })
  .await
  .unwrap();
  assert_eq!(
    report.suggested_name.as_deref(),
    Some("Sqooky's fps config")
  );
  assert_eq!(report.variants.len(), 1);
}

#[tokio::test]
async fn current_gameinfo_imports_the_live_file() {
  let app_data = tempfile::tempdir().unwrap();
  let game = game_folder(&fixture(SQOOKY));
  let mut ctx = context(app_data.path(), Catalog::bundled());
  assert!(matches!(
    analyze(&ctx, ImportSource::CurrentGameinfo).await,
    Err(Error::GamePathNotSet)
  ));
  ctx.game_path = Some(game.path().to_path_buf());
  let report = analyze(&ctx, ImportSource::CurrentGameinfo).await.unwrap();
  assert_eq!(report.format, ImportFormat::FullGameinfo);
  assert_eq!(
    report.base.map(|base| (base.build, base.exact)),
    Some((6711, true))
  );
  assert!(has_entry(&report.entries, "ConVars/r_ssao"));
  assert_eq!(
    report.resolved.counts.applies, 0,
    "the live file already has every value"
  );
}

#[test]
fn default_variant_follows_the_catalog_hint() {
  let variant = |path: &str, duplicate_of: Option<&str>| ImportVariant {
    path: path.to_string(),
    label: path.to_string(),
    format: ImportFormat::FullGameinfo,
    duplicate_of: duplicate_of.map(str::to_string),
  };
  let variants = vec![
    variant("dyson build/english/gameinfo.gi", None),
    variant("dyson build/gameinfo default.gi", None),
    variant(
      "dyson build/russian/gameinfo.gi",
      Some("dyson build/english/gameinfo.gi"),
    ),
  ];
  let pick = |hint| default_variant(&variants, hint).map(|variant| variant.path.as_str());
  assert_eq!(pick(None), Some("dyson build/english/gameinfo.gi"));
  assert_eq!(
    pick(Some("GAMEINFO DEFAULT.gi")),
    Some("dyson build/gameinfo default.gi")
  );
  assert_eq!(
    pick(Some("russian/gameinfo.gi")),
    Some("dyson build/english/gameinfo.gi"),
    "a hint naming a copy picks its original"
  );
  assert_eq!(
    pick(Some("default.gi")),
    Some("dyson build/english/gameinfo.gi")
  );
  assert_eq!(
    pick(Some("missing.gi")),
    Some("dyson build/english/gameinfo.gi")
  );
  assert_eq!(default_variant(&[], None), None);
}
