use super::*;
use crate::mod_manager::perf_config::formats::import_test_support::{
  DYSON_ENGLISH, DYSON_RUSSIAN, OPTILOCK_VIDEO, SQOOKY, STOCK_6711, fixture,
};

fn write(root: &Path, relative: &str, contents: &str) {
  let target = root.join(relative);
  fs::create_dir_all(target.parent().unwrap()).unwrap();
  fs::write(target, contents).unwrap();
}

/// What skin mods ship: stock gameinfo.gi with `citadel/addons` mounted.
fn loader_only_gameinfo() -> String {
  let text = fixture(STOCK_6711).replacen(
    "Game\t\t\t\tcitadel\n",
    "Game\t\t\t\tcitadel/addons\n\t\t\tGame\t\t\t\tcitadel\n",
    1,
  );
  assert!(text.contains("citadel/addons"));
  text
}

#[test]
fn discard_refuses_ids_that_could_leave_the_staging_folder() {
  let app_data = tempfile::tempdir().unwrap();
  let outside = app_data.path().join("performance").join("keep");
  fs::create_dir_all(&outside).unwrap();
  for id in [
    "",
    ".",
    "..",
    "../keep",
    "..\\keep",
    "a/b",
    "a\\b",
    "C:\\Windows",
    "/etc",
    "staging id",
    &"a".repeat(65),
  ] {
    assert!(
      matches!(discard(app_data.path(), id), Err(Error::InvalidInput(_))),
      "{id:?} should be rejected"
    );
  }
  assert!(outside.exists());
  assert!(discard(app_data.path(), "never-staged_123").is_ok());
}

#[test]
fn mod_downloads_stage_only_real_configs() {
  let app_data = tempfile::tempdir().unwrap();

  let skin = tempfile::tempdir().unwrap();
  write(skin.path(), "pak01_dir.vpk", "vpk");
  write(skin.path(), "gameinfo.gi", &loader_only_gameinfo());
  write(
    skin.path(),
    "readme.txt",
    "r_ssao 0\nfps_max 0\nInstall: copy the files",
  );
  assert!(
    stage_from_dir(app_data.path(), skin.path(), "Skin")
      .unwrap()
      .is_none()
  );

  let video_only = tempfile::tempdir().unwrap();
  write(video_only.path(), "cfg/video.txt", &fixture(OPTILOCK_VIDEO));
  assert!(
    stage_from_dir(app_data.path(), video_only.path(), "Video")
      .unwrap()
      .is_none()
  );

  let config = tempfile::tempdir().unwrap();
  write(config.path(), "Sqooky/addons/pak99_dir.vpk", "vpk");
  write(config.path(), "Sqooky/gameinfo.gi", &fixture(SQOOKY));
  write(config.path(), "Sqooky/video.txt", &fixture(OPTILOCK_VIDEO));
  let (id, variants) = stage_from_dir(app_data.path(), config.path(), "Sqooky's fps config")
    .unwrap()
    .expect("a performance config");
  assert_eq!(variants.len(), 1);
  assert_eq!(variants[0].path, "Sqooky/gameinfo.gi");
  assert_eq!(variants[0].format, ImportFormat::FullGameinfo);

  let staged = open(app_data.path(), &id).unwrap();
  assert_eq!(staged.label.as_deref(), Some("Sqooky's fps config"));
  assert_eq!(staged.read(&staged.variants[0]).unwrap(), fixture(SQOOKY));
  assert!(staged.companion_video(&staged.variants[0]).is_some());
  assert!(
    !staging_root(app_data.path())
      .join(&id)
      .join(FILES_DIR)
      .join("Sqooky/addons")
      .exists(),
    "VPKs are not staged"
  );

  discard(app_data.path(), &id).unwrap();
  assert!(!staging_root(app_data.path()).join(&id).exists());
  assert!(open(app_data.path(), &id).is_err());
}

#[test]
fn translated_copies_point_at_the_original() {
  let app_data = tempfile::tempdir().unwrap();
  let source = tempfile::tempdir().unwrap();
  let folder = "dyson build/gameinfo (now with 15 languages)";
  write(
    source.path(),
    &format!("{folder}/russian/gameinfo.gi"),
    &fixture(DYSON_RUSSIAN),
  );
  write(
    source.path(),
    &format!("{folder}/english/gameinfo.gi"),
    &fixture(DYSON_ENGLISH),
  );
  write(
    source.path(),
    "dyson build/gameinfo default.gi",
    &fixture(STOCK_6711),
  );
  write(
    source.path(),
    "dyson build/readme eu.txt",
    "fps_max 0\nr_ssao 0",
  );

  let staged = stage_import(app_data.path(), source.path(), &Catalog::bundled(), None)
    .unwrap()
    .expect("staged");
  let summary: Vec<(&str, &str, Option<&str>)> = staged
    .variants
    .iter()
    .map(|variant| {
      (
        variant.path.as_str(),
        variant.label.as_str(),
        variant.duplicate_of.as_deref(),
      )
    })
    .collect();
  let english = format!("{folder}/english/gameinfo.gi");
  let russian = format!("{folder}/russian/gameinfo.gi");
  assert_eq!(
    summary,
    vec![
      (english.as_str(), "English", None),
      ("dyson build/gameinfo default.gi", "default", None),
      (russian.as_str(), "Russian", Some(english.as_str())),
    ]
  );
}

#[test]
fn labels_drop_shared_and_wrapper_folders() {
  let labels = |paths: &[&str]| {
    variant_labels(
      &paths
        .iter()
        .map(|path| path.to_string())
        .collect::<Vec<_>>(),
    )
  };
  assert_eq!(
    labels(&[
      "OptiLock FPS Config (Recommended)/gameinfo.gi",
      "OptiLock Potato Config/gameinfo.gi",
      "Localization/FPS Configs (Russian)/Рекомендуемый пресет/gameinfo.gi",
    ]),
    vec![
      "OptiLock FPS Config (Recommended)",
      "OptiLock Potato Config",
      "FPS Configs (Russian) / Рекомендуемый пресет",
    ]
  );
  assert_eq!(
    labels(&["Sqooky/gameinfo.gi", "Sqooky/gameinfoextremelow.gi"]),
    vec!["gameinfo.gi", "extremelow"]
  );
  assert_eq!(
    labels(&["gameinfo/eu/gameinfo.gi", "gameinfo/ru/gameinfo.gi"]),
    vec!["English", "Russian"]
  );
  assert_eq!(
    labels(&["a/gameinfo (v1)/gameinfo.gi", "a/gameinfo (v2)/gameinfo.gi"]),
    vec!["a/gameinfo (v1)/gameinfo.gi", "a/gameinfo (v2)/gameinfo.gi"],
    "labels that would collide fall back to the path"
  );
}

#[test]
fn languages_come_from_folder_names() {
  let language_of = |path: &str| language(path).map(|language| language.name);
  assert_eq!(language_of("dyson build/eu/gameinfo.gi"), Some("English"));
  assert_eq!(
    language_of("Localization/FPS Configs (Ukrainian)/Картопляний пресет/gameinfo.gi"),
    Some("Ukrainian")
  );
  assert_eq!(
    language_of("x/schinese/gameinfo.gi"),
    Some("Simplified Chinese")
  );
  assert_eq!(
    language_of("OptiLock FPS Config (Recommended)/gameinfo.gi"),
    None
  );
  assert_eq!(
    language_of("Rush/gameinfo.gi"),
    None,
    "codes only match a whole name"
  );
}

#[test]
fn cleanup_keeps_fresh_imports() {
  let app_data = tempfile::tempdir().unwrap();
  let fresh = staging_root(app_data.path()).join("fresh");
  fs::create_dir_all(&fresh).unwrap();
  cleanup_stale(app_data.path());
  assert!(fresh.exists());
  cleanup_stale(&app_data.path().join("missing"));
}
