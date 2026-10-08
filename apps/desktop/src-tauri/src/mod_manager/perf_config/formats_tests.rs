use super::import_test_support::{
  AUTOEXEC, DYSON_ENGLISH, DYSON_RUSSIAN, FOG_SNIPPET, KAIZU, OPTILOCK, OPTILOCK_VIDEO, OVERRIDES,
  SQOOKY, STOCK_6711, fixture, fixture_bytes, path,
};
use super::*;

fn leaf_value<'a>(parsed: &'a ParsedConfig, joined: &str) -> Option<&'a str> {
  let wanted = path(joined);
  parsed
    .leaves
    .iter()
    .rev()
    .find(|leaf| {
      leaf.path.len() == wanted.len()
        && leaf
          .path
          .iter()
          .zip(&wanted)
          .all(|(a, b)| a.eq_ignore_ascii_case(b))
    })
    .and_then(|leaf| leaf.value.as_deref())
}

fn ignored_of(parsed: &ParsedConfig, kind: IgnoredKind) -> Vec<&IgnoredPart> {
  parsed
    .ignored
    .iter()
    .filter(|part| part.kind == kind)
    .collect()
}

#[test]
fn detects_formats_from_names_and_content() {
  let cases: &[(&str, Option<&str>, Option<ImportFormat>)] = &[
    ("dmm-perf:1:abc", None, Some(ImportFormat::ShareCode)),
    (
      "  DMM-PERF:1:abc\n",
      Some("notes.txt"),
      Some(ImportFormat::ShareCode),
    ),
    ("", Some("OptiLock.zip"), Some(ImportFormat::Archive)),
    (
      "",
      Some("C:\\Downloads\\pack.7z"),
      Some(ImportFormat::Archive),
    ),
    (
      "r_farz 4000",
      Some("overrides.gi"),
      Some(ImportFormat::OverridesGi),
    ),
    (
      "# locks\nr_farz 4000\n// fps_max",
      None,
      Some(ImportFormat::OverridesGi),
    ),
    (
      "\"setting.fps_max\" \"0\"",
      Some("video.txt"),
      Some(ImportFormat::VideoTxt),
    ),
    (
      "\t\"setting.fps_max\"\t\t\"0\"\n}",
      None,
      Some(ImportFormat::VideoTxt),
    ),
    (
      "fps_max 0\nbind f1 kill",
      Some("autoexec.cfg"),
      Some(ImportFormat::Cfg),
    ),
    ("bind f1 kill\nr_ssao 0", None, Some(ImportFormat::Cfg)),
    (
      "\"r_ssao\" \"0\"",
      Some("gameinfo.gi"),
      Some(ImportFormat::ConvarsSnippet),
    ),
    (
      "\"r_ssao\" \"0\"\n\"fps_max\" \"0\"",
      None,
      Some(ImportFormat::ConvarsSnippet),
    ),
    (
      "ConVars\n{\n\"r_ssao\" \"0\"\n}",
      Some("autoexec.cfg"),
      Some(ImportFormat::ConvarsSnippet),
    ),
    ("\"GameInfo\"\n{\n}", None, Some(ImportFormat::FullGameinfo)),
    ("", None, None),
    ("This config gives you more FPS, enjoy!", None, None),
    ("-vulkan -novid -high", Some("launch options.txt"), None),
  ];
  for (text, name, expected) in cases {
    assert_eq!(
      detect_format(text, *name),
      *expected,
      "{text:?} named {name:?}"
    );
  }
  assert_eq!(
    detect_format(&fixture(OPTILOCK), Some("gameinfo.gi")),
    Some(ImportFormat::FullGameinfo)
  );
  assert_eq!(
    detect_format(&fixture(FOG_SNIPPET), None),
    Some(ImportFormat::ConvarsSnippet)
  );
  assert_eq!(
    detect_format(&fixture(AUTOEXEC), Some("rawcode.cfg")),
    Some(ImportFormat::Cfg)
  );
  assert_eq!(
    detect_format(&fixture(OVERRIDES), None),
    Some(ImportFormat::OverridesGi)
  );
  assert_eq!(
    detect_format(&fixture(OPTILOCK_VIDEO), None),
    Some(ImportFormat::VideoTxt)
  );
}

#[test]
fn reads_crlf_gameinfo_with_cyrillic_comments() {
  let bytes = fixture_bytes(DYSON_RUSSIAN);
  assert!(bytes.windows(2).any(|pair| pair == b"\r\n"));
  let parsed = parse(&fixture(DYSON_RUSSIAN), ImportFormat::FullGameinfo);
  assert_eq!(parsed.format, ImportFormat::FullGameinfo);
  assert_eq!(parsed.unreadable_lines, 0);
  let r_ssao = parsed
    .leaves
    .iter()
    .find(|leaf| leaf.path == path("ConVars/r_ssao"))
    .expect("r_ssao");
  assert_eq!(r_ssao.value.as_deref(), Some("0"));
  assert_eq!(r_ssao.line, 645);
  assert!(
    parsed.leaves.iter().all(|leaf| leaf
      .value
      .as_deref()
      .is_none_or(|value| !value.contains('\r'))),
    "values keep no carriage returns"
  );

  let english = parse(&fixture(DYSON_ENGLISH), ImportFormat::FullGameinfo);
  let values = |parsed: &ParsedConfig| {
    let (entries, _) = collapse(&parsed.leaves);
    entries
      .into_iter()
      .map(|entry| {
        (
          path_key(&entry.path),
          entry.value.map(|value| normalize_value(&value)),
        )
      })
      .collect::<Vec<_>>()
  };
  assert_eq!(
    values(&parsed),
    values(&english),
    "the translation only changes comments"
  );
}

#[test]
fn keeps_every_leaf_below_gameinfo_with_root_keys_and_markers() {
  let parsed = parse(&fixture(OPTILOCK), ImportFormat::FullGameinfo);
  assert_eq!(parsed.format, ImportFormat::FullGameinfo);
  assert_eq!(
    leaf_value(&parsed, "PGIVersion"),
    Some("6E09D3ED5A47F6A97443813F0E00F90BAA435918F82DF0C9B5DA46D27A33D903")
  );
  assert_eq!(
    leaf_value(&parsed, "DisallowGameInfoConditionals"),
    Some("0")
  );
  assert!(
    parsed
      .leaves
      .iter()
      .any(|leaf| leaf.path == path("FileSystem/SearchPaths/Game")
        && leaf.value.as_deref() == Some("citadel/addons/profile_1788286995090_8lc3039pw_qollite")),
    "SearchPaths are parsed so the analyzer can report them"
  );
  assert_eq!(leaf_value(&parsed, "ConVars/rate/max"), Some("1000000"));
  let markers = ignored_of(&parsed, IgnoredKind::ModManagerMarkers);
  assert_eq!(markers.len(), 1);
  assert_eq!(markers[0].line, Some(79));
}

#[test]
fn collapse_keeps_the_last_value_and_reports_conflicting_duplicates() {
  let parsed = parse(&fixture(OPTILOCK), ImportFormat::FullGameinfo);
  let (entries, duplicates) = collapse(&parsed.leaves);
  let async_send = entries
    .iter()
    .find(|entry| entry.path == path("ConVars/cl_async_usercmd_send"))
    .expect("cl_async_usercmd_send");
  assert_eq!(async_send.value.as_deref(), Some("false"));
  let duplicate = duplicates
    .iter()
    .find(|part| part.detail.starts_with("ConVars/cl_async_usercmd_send ="))
    .expect("duplicate reported");
  assert_eq!(duplicate.kind, IgnoredKind::DuplicateKey);
  assert_eq!(duplicate.line, Some(1085));
  assert_eq!(duplicate.detail, "ConVars/cl_async_usercmd_send = true");

  let parsed = parse(
    "\"a\" \"1\"\n\"A\" \"2\"\n\"b\" \"1\"\n\"b\" \"true\"\n",
    ImportFormat::ConvarsSnippet,
  );
  let (entries, duplicates) = collapse(&parsed.leaves);
  assert_eq!(
    entries,
    vec![
      ConfigEntry {
        path: path("ConVars/a"),
        value: Some("2".to_string())
      },
      ConfigEntry {
        path: path("ConVars/b"),
        value: Some("true".to_string())
      },
    ]
  );
  assert_eq!(
    duplicates.len(),
    1,
    "equal values after normalising aren't a conflict"
  );
  assert_eq!(duplicates[0].line, Some(1));
}

#[test]
fn skips_broken_lines_without_shifting_the_rest() {
  let text = "\u{feff}GameInfo\r\n{\r\n\tConVars\r\n\t{\r\n\
              \t\tr_ssao \"0\" [ $WIN64 ]\r\n\
              ---------------------- END OF CONFIG -- ver. 4.6 ----------\n\
              \t\tcl_glow_brightness \"0\"  \"0\"\n\
              \t\t\"orphan\"\n\
              \t\t\"r_farz\" \"4000\" /* trailing */\n\
              \t\tai_disabled \"0\" Turns off AI\n\
              \t\tThis line lost its comment\n\
              \t\t{\n\
              \t\t\tr_drawropes 0\n\
              \t\t}\n\
              \t\t\"unterminated\" \"1\n\
              \t\tfps_max\u{a0}0\n\
              \t}\n\
              \tFileSystem\n\t{\n\t}\n\
              }\n\
              }\n";
  let parsed = parse(text, ImportFormat::ConvarsSnippet);
  let values: Vec<(String, Option<&str>)> = parsed
    .leaves
    .iter()
    .map(|leaf| (leaf.path.join("/"), leaf.value.as_deref()))
    .collect();
  assert_eq!(
    values,
    vec![
      ("ConVars/r_ssao".to_string(), Some("0")),
      ("ConVars/cl_glow_brightness".to_string(), Some("0")),
      ("ConVars/r_farz".to_string(), Some("4000")),
      ("ConVars/ai_disabled".to_string(), Some("0")),
      ("ConVars/r_drawropes".to_string(), Some("0")),
      ("ConVars/unterminated".to_string(), Some("1")),
      ("ConVars/fps_max".to_string(), Some("0")),
    ]
  );
  let error_lines: Vec<u32> = ignored_of(&parsed, IgnoredKind::ParseError)
    .iter()
    .filter_map(|part| part.line)
    .collect();
  assert_eq!(error_lines, vec![6, 7, 8, 10, 11, 12, 15, 22]);
  assert_eq!(parsed.unreadable_lines, 8);
}

#[test]
fn a_gameinfo_wrapper_around_a_few_convars_is_a_snippet() {
  let parsed = parse(
    "\"GameInfo\"\n{\n\tConVars\n\t{\n\t\t\"r_ssao\" \"0\"\n\t}\n}\n",
    ImportFormat::FullGameinfo,
  );
  assert_eq!(parsed.format, ImportFormat::ConvarsSnippet);
  assert_eq!(leaf_value(&parsed, "ConVars/r_ssao"), Some("0"));

  let parsed = parse(&fixture(STOCK_6711), ImportFormat::ConvarsSnippet);
  assert_eq!(parsed.format, ImportFormat::FullGameinfo);
}

#[test]
fn bare_snippets_and_sections_land_under_their_paths() {
  let parsed = parse(&fixture(FOG_SNIPPET), ImportFormat::ConvarsSnippet);
  assert_eq!(parsed.format, ImportFormat::ConvarsSnippet);
  assert_eq!(parsed.leaves.len(), 8);
  assert!(parsed.leaves.iter().all(|leaf| leaf.path[0] == "ConVars"));
  let (entries, duplicates) = collapse(&parsed.leaves);
  assert_eq!(entries.len(), 5);
  assert!(duplicates.is_empty());

  let parsed = parse(
    "ConVars\n{\n\t\"r_ssao\"\t\t\"0\"\n}\n\nSceneSystem\n{\n\t\"CSMCascadeResolution\"\t\t\"512\"\n}\n",
    ImportFormat::ConvarsSnippet,
  );
  assert_eq!(leaf_value(&parsed, "ConVars/r_ssao"), Some("0"));
  assert_eq!(
    leaf_value(&parsed, "SceneSystem/CSMCascadeResolution"),
    Some("512")
  );
}

#[test]
fn cfg_keeps_convars_and_reports_binds_aliases_and_commands() {
  let parsed = parse(&fixture(AUTOEXEC), ImportFormat::Cfg);
  assert_eq!(parsed.format, ImportFormat::Cfg);
  assert_eq!(
    leaf_value(&parsed, "ConVars/citadel_unit_status_use_new"),
    Some("true")
  );
  assert_eq!(leaf_value(&parsed, "ConVars/fps_max"), Some("165"));
  assert_eq!(
    leaf_value(&parsed, "ConVars/zoom_sensitivity_ratio"),
    Some("0.818933027098955175"),
    "quotes and trailing comments are dropped"
  );
  assert_eq!(parsed.leaves.len(), 21);
  assert_eq!(ignored_of(&parsed, IgnoredKind::Bind).len(), 6);
  assert_eq!(ignored_of(&parsed, IgnoredKind::Alias).len(), 23);
  assert!(
    ignored_of(&parsed, IgnoredKind::ConsoleCommand)
      .iter()
      .any(|part| part.detail == "autoexec"),
    "an alias run on its own is a command"
  );
  assert_eq!(parsed.unreadable_lines, 2, "the backslash banners");

  let parsed = parse(
    "exec autoexec; r_ssao 0; +jump\nbind \"f1\" \"echo hi; r_ssao 1\"",
    ImportFormat::Cfg,
  );
  assert_eq!(leaf_value(&parsed, "ConVars/r_ssao"), Some("0"));
  assert_eq!(parsed.leaves.len(), 1, "a bind's body isn't run");
  assert_eq!(ignored_of(&parsed, IgnoredKind::Exec).len(), 1);
  assert_eq!(ignored_of(&parsed, IgnoredKind::ConsoleCommand).len(), 1);
  assert_eq!(ignored_of(&parsed, IgnoredKind::Bind).len(), 1);
}

#[test]
fn overrides_lock_values_and_force_comment_outs() {
  let parsed = parse(&fixture(OVERRIDES), ImportFormat::OverridesGi);
  let commented: Vec<&str> = parsed
    .leaves
    .iter()
    .filter(|leaf| leaf.value.is_none())
    .map(|leaf| leaf.path[1].as_str())
    .collect();
  assert_eq!(
    commented,
    vec![
      "citadel_camera_hero_fov",
      "r_farz",
      "sc_screen_size_lod_scale_override",
      "sc_fade_distance_scale_override",
      "citadel_camera_pitch_max",
    ]
  );
  assert_eq!(
    leaf_value(&parsed, "ConVars/r_size_cull_threshold"),
    Some("0.7")
  );
  assert_eq!(
    leaf_value(
      &parsed,
      "ConVars/citadel_damage_offscreen_indicator_disabled"
    ),
    Some("false")
  );
  assert_eq!(
    leaf_value(&parsed, "ConVars/r_aspectratio"),
    Some("2.4"),
    "the last line has no line break"
  );
  assert!(parsed.ignored.is_empty());

  let parsed = parse(
    "\u{feff}// r_farz # lock it off\nr_farz \"4000\" # but this wins\n\n# note\nbad-name 1\n",
    ImportFormat::OverridesGi,
  );
  assert_eq!(parsed.leaves.len(), 1);
  assert_eq!(leaf_value(&parsed, "ConVars/r_farz"), Some("4000"));
  assert_eq!(
    ignored_of(&parsed, IgnoredKind::ParseError)[0].line,
    Some(5)
  );
}

#[test]
fn video_settings_skip_machine_specific_keys_and_get_menu_labels() {
  let parsed = parse(&fixture(OPTILOCK_VIDEO), ImportFormat::VideoTxt);
  assert_eq!(parsed.format, ImportFormat::VideoTxt);
  assert!(parsed.leaves.is_empty(), "video.txt is never written");
  let machine: Vec<&str> = ignored_of(&parsed, IgnoredKind::MachineSpecific)
    .iter()
    .map(|part| part.detail.as_str())
    .collect();
  for key in [
    "setting.defaultres",
    "setting.defaultresheight",
    "setting.refreshrate_numerator",
    "setting.fullscreen",
    "setting.monitor_index",
    "setting.aspectratiomode",
    "setting.gpu_mem_level",
  ] {
    assert!(machine.contains(&key), "{key} is machine-specific");
  }
  assert_eq!(
    ignored_of(&parsed, IgnoredKind::ParseError)
      .iter()
      .filter_map(|part| part.line)
      .collect::<Vec<_>>(),
    vec![76],
    "the fragment's stray closing brace"
  );
  let setting = |key: &str| {
    parsed
      .video_settings
      .iter()
      .find(|setting| setting.key == key)
      .unwrap_or_else(|| panic!("{key}"))
  };
  assert!(
    parsed
      .video_settings
      .iter()
      .all(|setting| !setting.key.starts_with("defaultres"))
  );
  let shadows = setting("r_citadel_shadow_quality");
  assert_eq!(shadows.label.as_deref(), Some("Shadow quality"));
  assert_eq!(shadows.display.as_deref(), Some("Low"));
  assert_eq!(setting("fps_max").display.as_deref(), Some("No limit"));
  assert_eq!(
    setting("mat_viewportscale").display.as_deref(),
    Some("100%")
  );
  assert_eq!(setting("r_effects_bloom").display.as_deref(), Some("Off"));
  assert_eq!(setting("r_low_latency").display.as_deref(), Some("Enabled"));
  let mip_bias = setting("r_texture_stream_mip_bias");
  assert_eq!(mip_bias.label.as_deref(), Some("Texture quality"));
  assert_eq!(mip_bias.value, "4");
  assert_eq!(mip_bias.display, None, "below the menu's lowest choice");
  assert_eq!(setting("r_citadel_mboit").label, None);
  assert_eq!(
    parsed
      .video_settings
      .iter()
      .filter(|setting| setting.key == "r_particle_max_detail_level")
      .count(),
    1,
    "repeated keys collapse"
  );

  let parsed = parse(
    "\"video.cfg\"\n{\n\t\"Version\"\t\"20\"\n\t\"VendorID\"\t\"4318\"\n\t\"DeviceID\"\t\"????\"\n\t\"setting.r_citadel_upscaling\"\t\"4\"\n}\n",
    ImportFormat::VideoTxt,
  );
  assert_eq!(ignored_of(&parsed, IgnoredKind::MachineSpecific).len(), 2);
  assert_eq!(parsed.video_settings.len(), 1);
  assert_eq!(
    parsed.video_settings[0].display.as_deref(),
    Some("NVIDIA DLSS")
  );
}

#[test]
fn utf16_and_bom_text_decodes() {
  let mut utf16 = vec![0xFF, 0xFE];
  for unit in "r_ssao 0".encode_utf16() {
    utf16.extend_from_slice(&unit.to_le_bytes());
  }
  assert_eq!(decode_text(&utf16), "r_ssao 0");
  assert_eq!(decode_text(b"\xEF\xBB\xBFr_ssao 0"), "r_ssao 0");
  assert_eq!(decode_text(b"r_ssao \xFF0"), "r_ssao \u{fffd}0");
}

/// Small deterministic generator so the garbage below is the same on every run.
struct Lcg(u64);

impl Lcg {
  fn next(&mut self) -> u64 {
    self.0 = self
      .0
      .wrapping_mul(6_364_136_223_846_793_005)
      .wrapping_add(1_442_695_040_888_963_407);
    self.0 >> 33
  }
}

#[test]
fn never_panics_on_garbage() {
  let mut inputs: Vec<String> = [
    "",
    "{",
    "}",
    "}}}}{{{{",
    "\"",
    "\"unterminated",
    "/*",
    "/* never closed {",
    "[",
    "[$WIN64",
    "//",
    "\0\0\0",
    "GameInfo",
    "GameInfo {",
    "GameInfo { ConVars { \"rate\" { \"min\" } } }",
    "\"setting.\"",
    "setting.",
    "dmm-perf:",
    "# only a comment",
    "// \u{feff}\u{a0}",
    "\r\r\r\n\n\r",
    "a b c d e f g h i j",
    "\"\" \"\"",
    "+ - ; ; ;",
    "alias",
    "bind",
    "ConVars { ConVars { ConVars {",
  ]
  .iter()
  .map(|text| text.to_string())
  .collect();
  inputs.push("{".repeat(100_000));
  inputs.push("}".repeat(100_000));
  inputs.push("a {\n".repeat(5_000));
  inputs.push("x".repeat(1_000_000));
  inputs.push("\"k\" \"v\" ".repeat(10_000));
  inputs.push(String::from_utf8_lossy(&fixture_bytes(SQOOKY)[..5_000]).to_string());
  inputs.push(fixture(KAIZU).replace('}', ""));
  inputs.push(fixture(KAIZU).replace('{', ""));
  inputs.push(fixture(KAIZU).replace('"', ""));

  let alphabet: Vec<char> = "{}\"[]/*#;+- \t\r\nabcZ_09.$é\u{feff}".chars().collect();
  let mut random = Lcg(42);
  for _ in 0..300 {
    let length = (random.next() % 400) as usize;
    inputs.push(
      (0..length)
        .map(|_| alphabet[(random.next() as usize) % alphabet.len()])
        .collect(),
    );
  }

  let formats = [
    ImportFormat::FullGameinfo,
    ImportFormat::ConvarsSnippet,
    ImportFormat::Cfg,
    ImportFormat::OverridesGi,
    ImportFormat::VideoTxt,
  ];
  for input in &inputs {
    let _ = detect_format(input, None);
    let _ = detect_format(input, Some("gameinfo.gi"));
    for format in formats {
      let parsed = parse(input, format);
      assert!(parsed.leaves.iter().all(|leaf| !leaf.path.is_empty()));
      let _ = collapse(&parsed.leaves);
    }
  }
}
