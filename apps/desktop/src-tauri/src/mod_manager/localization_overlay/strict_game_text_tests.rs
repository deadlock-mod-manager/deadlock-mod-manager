use super::*;

const TEXT_PATH: &str = "resource/localization/citadel_heroes/citadel_heroes_english.txt";
const UNSUPPORTED_PATH: &str =
  "resource/localization/citadel_vdata/accolades/accolades_english.txt";
const MALFORMED_TEXT: &[u8] = br#""lang"
{
  "Language" "English"
  "Tokens"
  {
    "hero_current" "Current name"
    "broken" "Unclosed value
    "hero_custom" "Custom name"
  }
}
"#;

fn text_file() -> LocalizationFile {
  LocalizationFile {
    language: "English".into(),
    tokens: BTreeMap::from([("hero_current".into(), "Current name".into())]),
  }
}

#[test]
fn unsupported_game_formats_leave_each_mod_file_as_shipped() {
  let temp = tempfile::tempdir().unwrap();
  let citadel = temp.path().join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  resources::tests::pack(
    &citadel,
    "pak01",
    &[
      (UNSUPPORTED_PATH, br#""accolades.vdata" { "token" "game" }"#),
      (TEXT_PATH, &render_localization(&text_file())),
    ],
  );
  let mut authored = text_file();
  authored
    .tokens
    .insert("hero_custom".into(), "Custom name".into());
  let mod_text = render_localization(&authored);
  let mods: Vec<_> = ["first", "second"]
    .into_iter()
    .map(|id| LocalizationModInput {
      mod_id: id.into(),
      vpks: vec![resources::tests::pack(
        temp.path(),
        id,
        &[(UNSUPPORTED_PATH, &[0xff]), (TEXT_PATH, &mod_text)],
      )],
    })
    .collect();
  let plan = LocalizationOverlayPlan::build(&citadel, &mods).unwrap();
  assert_eq!(plan.analysis.parse_warnings.len(), mods.len());
  for input in &mods {
    let warning = plan
      .analysis
      .parse_warnings
      .iter()
      .find(|warning| warning.mod_id == input.mod_id)
      .unwrap();
    assert_eq!(warning.file_path, UNSUPPORTED_PATH);
    assert!(warning.skipped_lines.is_empty());
    let message = warning.error.as_deref().unwrap();
    assert!(message.contains("format DMM does not merge"));
    assert!(message.contains("left as is"));
  }
  assert_eq!(plan.analysis.new_tokens, 1);
  let output = temp.path().join("overlay_dir.vpk");
  plan.write(&output, &[]).unwrap();
  let archive = VpkArchive::open(&output).unwrap();
  assert_eq!(archive.list_entries(), vec![TEXT_PATH.to_string()]);
  assert!(!archive.contains_entry(UNSUPPORTED_PATH));
  let merged =
    parse_localization_bytes(&archive.extract_entry(TEXT_PATH).unwrap(), TEXT_PATH).unwrap();
  assert_eq!(merged.file.tokens["hero_current"], "Current name");
  assert_eq!(merged.file.tokens["hero_custom"], "Custom name");
}

#[test]
fn damaged_game_baseline_fails_analysis_without_writing_an_overlay() {
  let temp = tempfile::tempdir().unwrap();
  let citadel = temp.path().join("citadel");
  let game_path = citadel.join(TEXT_PATH);
  fs::create_dir_all(game_path.parent().unwrap()).unwrap();
  fs::write(game_path, MALFORMED_TEXT).unwrap();
  let input = LocalizationModInput {
    mod_id: "mod".into(),
    vpks: vec![resources::tests::pack(
      temp.path(),
      "mod",
      &[(TEXT_PATH, &render_localization(&text_file()))],
    )],
  };
  let output = temp.path().join("overlay_dir.vpk");
  let result =
    LocalizationOverlayPlan::build(&citadel, &[input]).and_then(|plan| plan.write(&output, &[]));
  let error = result.unwrap_err();
  assert!(matches!(&error, Error::GameLocalizationInvalid(path) if path == TEXT_PATH));
  assert!(
    error
      .to_string()
      .contains("Verify the game's files in Steam")
  );
  assert_eq!(
    serde_json::to_value(error).unwrap()["kind"],
    "gameLocalizationInvalid"
  );
  assert!(!output.exists());
}

#[test]
fn damaged_mod_text_still_merges_with_a_warning() {
  let temp = tempfile::tempdir().unwrap();
  let citadel = temp.path().join("citadel");
  let game_path = citadel.join(TEXT_PATH);
  fs::create_dir_all(game_path.parent().unwrap()).unwrap();
  fs::write(game_path, render_localization(&text_file())).unwrap();
  let input = LocalizationModInput {
    mod_id: "mod".into(),
    vpks: vec![resources::tests::pack(
      temp.path(),
      "mod",
      &[(TEXT_PATH, MALFORMED_TEXT)],
    )],
  };
  let plan = LocalizationOverlayPlan::build(&citadel, &[input]).unwrap();
  let warnings = &plan.analysis.parse_warnings;
  assert_eq!(warnings.len(), 1);
  assert_eq!(warnings[0].skipped_lines, vec![7]);
  assert!(warnings[0].error.is_none());
  let output = temp.path().join("overlay_dir.vpk");
  plan.write(&output, &[]).unwrap();
  let archive = VpkArchive::open(&output).unwrap();
  let merged =
    parse_localization_bytes(&archive.extract_entry(TEXT_PATH).unwrap(), TEXT_PATH).unwrap();
  assert_eq!(merged.file.tokens["hero_current"], "Current name");
  assert_eq!(merged.file.tokens["hero_custom"], "Custom name");
}

#[test]
fn salvage_reports_an_unclosed_tokens_block() {
  let bytes = b"\"lang\"\n{\n\"Tokens\"\n{\n\"token\" \"value\"\n";
  let parsed = parse_localization_bytes(bytes, TEXT_PATH).unwrap();
  assert_eq!(parsed.file.tokens["token"], "value");
  assert_eq!(parsed.skipped_lines, vec![4]);
  assert!(matches!(
    parse_game_localization_bytes(bytes, TEXT_PATH),
    Err(Error::GameLocalizationInvalid(_))
  ));
}

#[test]
fn salvage_reports_token_lines_with_extra_quoted_fields() {
  let bytes = b"\"lang\"\n{\n\"Language\" \"English\" \"extra\"\n\"Tokens\"\n{\n\"first\" \"one\" \"second\" \"two\"\n}\n}\n";
  let parsed = parse_localization_bytes(bytes, TEXT_PATH).unwrap();
  assert_eq!(parsed.file.tokens["first"], "one");
  assert!(!parsed.file.tokens.contains_key("second"));
  assert_eq!(parsed.skipped_lines, vec![6]);
  assert!(matches!(
    parse_game_localization_bytes(bytes, TEXT_PATH),
    Err(Error::GameLocalizationInvalid(_))
  ));
}

#[test]
fn only_well_formed_keyvalues_can_be_an_unsupported_game_format() {
  for bytes in [
    br#""accolades.vdata" { "token" "value" }"#.as_slice(),
    br#""lang" { "Language" "English" }"#.as_slice(),
  ] {
    assert!(matches!(
      parse_game_localization_bytes(bytes, TEXT_PATH),
      Ok(GameLocalizationBaseline::Unsupported)
    ));
  }
  for bytes in [
    &[0xff][..],
    br#""accolades.vdata" { "token" "value""#.as_slice(),
  ] {
    assert!(matches!(
      parse_game_localization_bytes(bytes, TEXT_PATH),
      Err(Error::GameLocalizationInvalid(_))
    ));
  }
}

#[test]
fn diagnostic_free_salvage_can_supply_a_game_baseline() {
  let bytes =
    b"\"lang\"\n{\n\"Language\" \"English\" \"extra\"\n\"Tokens\"\n{\n\"token\" \"value\"\n}\n}\n";
  assert!(keyvalues_parser::parse(std::str::from_utf8(bytes).unwrap()).is_err());
  let Ok(GameLocalizationBaseline::Complete(file)) =
    parse_game_localization_bytes(bytes, TEXT_PATH)
  else {
    panic!("diagnostic-free salvage should remain supported");
  };
  assert_eq!(file.tokens["token"], "value");
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL pointing to an installed game's citadel directory"]
fn installed_game_text_baselines_are_complete() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  assert!(
    citadel.is_dir(),
    "DMM_REAL_CITADEL must be a game directory"
  );
  let mut paths = BTreeSet::new();
  for directory in [&citadel, &citadel.with_file_name("core")] {
    if !directory.is_dir() {
      continue;
    }
    for entry in fs::read_dir(directory).unwrap() {
      let path = entry.unwrap().path();
      if path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.ends_with("_dir.vpk"))
      {
        let archive = VpkArchive::open(&path).unwrap();
        paths.extend(
          archive
            .list_entries()
            .into_iter()
            .filter(|entry| is_localization_path(entry))
            .map(|entry| normalize_path(&entry)),
        );
      }
    }
    let localization = directory.join("resource/localization");
    let mut pending = vec![localization];
    while let Some(folder) = pending.pop() {
      if !folder.is_dir() {
        continue;
      }
      for entry in fs::read_dir(folder).unwrap() {
        let entry = entry.unwrap();
        let entry_path = entry.path();
        if entry.file_type().unwrap().is_dir() {
          pending.push(entry_path);
        } else if entry.file_type().unwrap().is_file() {
          let path = entry_path
            .strip_prefix(directory)
            .unwrap()
            .to_str()
            .unwrap();
          if is_localization_path(path) {
            paths.insert(normalize_path(path));
          }
        }
      }
    }
  }
  assert!(!paths.is_empty(), "no installed localization files found");
  let resources =
    resources::ResourceSnapshot::with_game(Arc::new(GameIndex::open(&citadel).unwrap()), &[])
      .unwrap();
  let mut primary_count = 0;
  let mut salvage_count = 0;
  let mut failures = Vec::new();
  let mut unsupported = BTreeSet::new();
  for path in &paths {
    let bytes = resources.game_bytes(path).unwrap().unwrap();
    let text = decode_localization_text(&bytes).unwrap();
    let primary_result = keyvalues_parser::parse(text.trim_start_matches('\u{feff}'));
    let primary = primary_result.is_ok();
    if let Err(error) = primary_result {
      println!("{path}: primary error: {error}");
    }
    let parsed = parse_localization_bytes(&bytes, path);
    let diagnostics = match &parsed {
      Ok(parsed) => format!("{:?}", parsed.skipped_lines),
      Err(error) => error.to_string(),
    };
    println!(
      "{path}: primary={primary}, salvage={}, diagnostics={diagnostics}",
      !primary
    );
    if primary {
      primary_count += 1;
    } else {
      salvage_count += 1;
    }
    match parse_game_localization_bytes(&bytes, path) {
      Ok(GameLocalizationBaseline::Complete(_)) => {}
      Ok(GameLocalizationBaseline::Unsupported) => {
        unsupported.insert(path.clone());
        if path == "resource/localization/items_english.txt" {
          println!("{path}: decoded text: {text:?}");
        }
      }
      Err(error) => failures.push(format!("{error}; diagnostics={diagnostics}")),
    }
  }
  println!(
    "game text corpus: files={}, primary={primary_count}, salvage={salvage_count}, unsupported={}, damaged={}",
    paths.len(),
    unsupported.len(),
    failures.len()
  );
  assert!(failures.is_empty(), "{}", failures.join("\n"));
  let expected_unsupported: BTreeSet<_> = paths
    .into_iter()
    .filter(|path| {
      path == "resource/localization/items_english.txt"
        || (path.starts_with("resource/localization/citadel_vdata/accolades/accolades_")
          && path.ends_with(".txt"))
    })
    .collect();
  assert!(expected_unsupported.contains("resource/localization/items_english.txt"));
  assert_eq!(unsupported, expected_unsupported);
}
