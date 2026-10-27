use super::*;

fn request(query: &str) -> ModdingContentSearchRequest {
  ModdingContentSearchRequest {
    directory: String::new(),
    query: query.into(),
    regex: false,
    case_sensitive: false,
    path_filter: String::new(),
    cursor: 0,
  }
}

fn compiled_text() -> Vec<u8> {
  use vpkmanager::source2::kv3::{Format, Value};
  let data = vpkmanager::source2::kv3::encode(
    &Value::Object(vec![
      (
        "m_hTexture".into(),
        Value::String("materials/Needle.vtex".into()),
      ),
      ("type".into(), Value::String("citadel_music_title".into())),
    ]),
    &Format([0; 16]),
  );
  compiled_resource(data)
}

fn compiled_resource(data: Vec<u8>) -> Vec<u8> {
  let size = 28 + data.len();
  let mut bytes = vec![0u8; 28];
  bytes[0..4].copy_from_slice(&(size as u32).to_le_bytes());
  bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
  bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
  bytes[12..16].copy_from_slice(&1u32.to_le_bytes());
  bytes[16..20].copy_from_slice(b"DATA");
  bytes[20..24].copy_from_slice(&8u32.to_le_bytes());
  bytes[24..28].copy_from_slice(&(data.len() as u32).to_le_bytes());
  bytes.extend(data);
  bytes
}

#[test]
fn source_style_assignments_match_compiled_fields_and_indented_source() {
  let query = request(r#"type = "citadel_music_title""#);
  let pattern = expression(&query).unwrap();
  let compiled = decode("music.vsndevts_c", compiled_text()).unwrap();
  assert_eq!(
    matches(&compiled.text, &pattern).1,
    1,
    "compiled field view: {}",
    compiled.text
  );
  for source in [
    "\t\ttype = \"citadel_music_title\"",
    "    type\t=\t\"citadel_music_title\"",
    "type    =    \"citadel_music_title\"",
  ] {
    assert_eq!(matches(source, &pattern).1, 1, "source: {source}");
  }
}

#[test]
fn flexible_spacing_preserves_quoted_values_and_explicit_regex_rules() {
  let query = request(r#"message = "say\"  hello""#);
  let pattern = expression(&query).unwrap();
  assert!(pattern.is_match("\tmessage\t=  \"say\\\"  hello\""));
  assert!(!pattern.is_match(r#"message = "say\" hello""#));
  let mut exact = request(r#"^type = "citadel_music_title"$"#);
  exact.regex = true;
  let pattern = expression(&exact).unwrap();
  assert!(pattern.is_match(r#"type = "citadel_music_title""#));
  assert!(!pattern.is_match("\ttype = \"citadel_music_title\""));
  assert!(!pattern.is_match("type\t=\t\"citadel_music_title\""));
}

#[test]
fn source_style_decoding_keeps_escaped_keys_arrays_and_preview_size_limit() {
  let value = serde_json::json!({ "type": "citadel_music_title", "color": [1, 2, 3], "needs spaces": [{ "message": "line\n\"quoted\"" }] });
  let mut buffer = TextBuffer(Vec::new());
  let encoded = vpkmanager::source2::kv3::encode(
    &vpkmanager::source2::kv3::Value::Object(vec![
      ("type".into(), Value::String("citadel_music_title".into())),
      (
        "color".into(),
        Value::Array(vec![Value::Int(1), Value::Int(2), Value::Int(3)]),
      ),
      (
        "needs spaces".into(),
        Value::Array(vec![Value::Object(vec![(
          "message".into(),
          Value::String("line\n\"quoted\"".into()),
        )])]),
      ),
    ]),
    &vpkmanager::source2::kv3::Format([0; 16]),
  );
  let (tree, encoding) = vpkmanager::source2::kv3::decode_preserving(&encoded).unwrap();
  text::write(&mut buffer, &tree, Some(&encoding), 0).unwrap();
  let source = String::from_utf8(buffer.0).unwrap();
  assert!(source.contains("type = \"citadel_music_title\""));
  assert!(source.contains("color = [ 1, 2, 3 ]"));
  let parsed = super::super::modding_source::tree(&source)
    .unwrap()
    .to_json();
  assert_eq!(
    parsed["needs spaces"][0]["message"],
    value["needs spaces"][0]["message"]
  );
  assert!(
    text::write(
      &mut TextBuffer(Vec::new()),
      &Value::String("x".repeat(MAX_TEXT + 1)),
      None,
      0
    )
    .is_err()
  );
}

#[test]
#[ignore = "requires DMM_CONTENT_SEARCH_VPK pointing to an installed Deadlock archive"]
fn installed_music_assets_match_source_style_assignment_query() {
  let path = std::env::var("DMM_CONTENT_SEARCH_VPK").expect("set DMM_CONTENT_SEARCH_VPK");
  let archive = VpkArchive::open(std::path::Path::new(&path)).unwrap();
  let mut query = request(r#"type = "citadel_music_title""#);
  query.directory = "soundevents".into();
  query.path_filter = "music".into();
  let page = search(&archive, &query).unwrap();
  assert!(page.next_cursor.is_none());
  assert!(
    !page.files.is_empty(),
    "scanned={}, skipped={}, diagnostics={:?}",
    page.scanned_files,
    page.skipped_files,
    page.diagnostics
  );
  for file in page.files {
    println!(
      "{}: {} matching lines",
      file.entry.path, file.matching_lines
    );
  }
}

#[test]
fn literal_case_regex_and_utf16_columns_are_consistent_with_line_previews() {
  let document = decode(
    "one.txt",
    "header\r\n😀 café Needle.*\r\nneedle\n".as_bytes().to_vec(),
  )
  .unwrap();
  let (hits, count) = matches(&document.text, &expression(&request("needle.*")).unwrap());
  assert_eq!(count, 1);
  assert_eq!(hits[0].line, 2);
  assert_eq!(hits[0].column, 8);
  assert_eq!(hits[0].end_column, 16);
  let mut sensitive = request("needle");
  sensitive.case_sensitive = true;
  assert_eq!(
    matches(&document.text, &expression(&sensitive).unwrap()).1,
    1
  );
  sensitive.regex = true;
  sensitive.query = "[".into();
  assert!(expression(&sensitive).is_err());
  let long = format!("{}😀Needle{}", "é".repeat(300), "x".repeat(500));
  let (hits, _) = matches(&long, &expression(&request("needle")).unwrap());
  assert!(hits[0].snippet.chars().count() < 330);
  let units: Vec<_> = hits[0].snippet.encode_utf16().collect();
  assert_eq!(
    String::from_utf16(&units[hits[0].match_start..hits[0].match_end]).unwrap(),
    "Needle"
  );
}

#[test]
fn compiled_fields_and_valve_text_encodings_are_searchable_but_binary_is_not() {
  let document = decode("test.vpcf_c", compiled_text()).unwrap();
  assert!(document.decoded);
  assert!(document.text.contains("m_hTexture"));
  assert_eq!(
    matches(&document.text, &expression(&request("needle")).unwrap()).1,
    1
  );
  assert_eq!(
    decode("test.txt", vec![0xff, 0xfe, b'H', 0, b'i', 0])
      .unwrap()
      .text,
    "Hi"
  );
  assert!(decode("test.txt", vec![0, 1, 2]).is_err());
  assert!(decode("test.vpcf_c", b"not a resource".to_vec()).is_err());
}

#[test]
fn archive_search_scopes_contents_without_treating_names_as_matches_or_crossing_folders() {
  let temp = tempfile::tempdir().unwrap();
  let root = temp.path().join("source");
  for folder in ["particles/haze", "particles/hazel"] {
    std::fs::create_dir_all(root.join(folder)).unwrap();
  }
  std::fs::write(
    root.join("particles/haze/hit.txt"),
    "a Needle value\nneedle again\n",
  )
  .unwrap();
  std::fs::write(root.join("particles/haze/needle.txt"), "unrelated text").unwrap();
  std::fs::write(root.join("particles/haze/hit.vpcf_c"), compiled_text()).unwrap();
  std::fs::write(root.join("particles/haze/bad.vpcf_c"), "invalid").unwrap();
  std::fs::write(root.join("particles/haze/binary.png"), "needle").unwrap();
  std::fs::write(root.join("particles/hazel/other.txt"), "needle").unwrap();
  let path = temp.path().join("archive.vpk");
  vpkmanager::pack_directory(&root, &path).unwrap();
  let archive = VpkArchive::open(&path).unwrap();
  let mut query = request("needle");
  query.directory = "particles/haze".into();
  let found = search(&archive, &query).unwrap();
  assert_eq!(found.files.len(), 2);
  assert_eq!(found.files[0].entry.path, "particles/haze/hit.txt");
  assert_eq!(found.files[0].matching_lines, 2);
  assert_eq!(found.files[0].entry.file_count, 1);
  assert!(!found.files[0].entry.directory);
  assert_eq!(found.files[1].entry.path, "particles/haze/hit.vpcf_c");
  assert_eq!(found.skipped_files, 2);
  assert_eq!(found.diagnostics.len(), 1);
  assert!(found.next_cursor.is_none());
  query.path_filter = ".vpcf_c".into();
  assert_eq!(search(&archive, &query).unwrap().files.len(), 1);
  query.directory = "../outside".into();
  assert!(search(&archive, &query).is_err());
}

#[test]
fn search_pages_resume_without_repeating_or_losing_matching_files() {
  let temp = tempfile::tempdir().unwrap();
  let root = temp.path().join("source");
  std::fs::create_dir(&root).unwrap();
  for index in 0..=MAX_PAGE_RESULTS {
    std::fs::write(
      root.join(format!("file-{index:04}.txt")),
      "needle\n".repeat(7),
    )
    .unwrap();
  }
  let path = temp.path().join("archive.vpk");
  vpkmanager::pack_directory(&root, &path).unwrap();
  let archive = VpkArchive::open(&path).unwrap();
  let mut query = request("needle");
  let first = search(&archive, &query).unwrap();
  assert_eq!(first.files.len(), MAX_PAGE_RESULTS);
  assert_eq!(first.files[0].matches.len(), MAX_FILE_SNIPPETS);
  assert_eq!(first.files[0].matching_lines, 7);
  query.cursor = first.next_cursor.unwrap();
  let second = search(&archive, &query).unwrap();
  assert_eq!(second.files.len(), 1);
  assert!(second.next_cursor.is_none());
  assert!(
    !first
      .files
      .iter()
      .any(|file| file.entry.path == second.files[0].entry.path)
  );
}

#[test]
fn panorama_flags_are_preserved_in_searchable_compiled_assignments() {
  use vpkmanager::source2::kv3::{Format, Value};
  let mut data = vpkmanager::source2::kv3::encode(
    &Value::Object(vec![(
      "m_strAbilityImage".into(),
      Value::String("file://{images}/hud/abilities/wraith_lift.psd".into()),
    )]),
    &Format([0; 16]),
  );
  // The last type in this uncompressed v4 fixture is the string, before its trailer.
  let type_offset = data.len() - 5;
  assert_eq!(data[type_offset], 6);
  data[type_offset] |= 0x80;
  data.insert(type_offset + 1, 3);
  for offset in [40, 48, 52] {
    let value = u32::from_le_bytes(data[offset..offset + 4].try_into().unwrap());
    data[offset..offset + 4].copy_from_slice(&(value + 1).to_le_bytes());
  }
  let bytes = compiled_resource(data);
  let document = decode("wraith.vdata_c", bytes).unwrap();
  let pattern = expression(&request(
    r#"m_strAbilityImage = panorama:"file://{images}/hud/abilities/wraith_lift.psd""#,
  ))
  .unwrap();
  assert_eq!(matches(&document.text, &pattern).1, 1, "{}", document.text);
}

#[test]
fn large_game_data_documents_keep_searchable_fields_beyond_the_first_megabyte() {
  use vpkmanager::source2::kv3::{Format, Value};
  let data = vpkmanager::source2::kv3::encode(
    &Value::Object(vec![
      ("padding".into(), Value::String("x".repeat(1024 * 1024))),
      ("type".into(), Value::String("citadel_music_title".into())),
    ]),
    &Format([0; 16]),
  );
  let document = decode("abilities.vdata_c", compiled_resource(data)).unwrap();
  assert_eq!(
    matches(
      &document.text,
      &expression(&request(r#"type = "citadel_music_title""#)).unwrap()
    )
    .1,
    1
  );
}

#[test]
fn root_search_checks_sound_events_before_large_model_collections() {
  let temp = tempfile::tempdir().unwrap();
  let root = temp.path().join("source");
  std::fs::create_dir_all(root.join("animation")).unwrap();
  std::fs::create_dir_all(root.join("soundevents")).unwrap();
  let data = compiled_text();
  for index in 0..MAX_PAGE_RESULTS {
    std::fs::write(root.join(format!("animation/{index:04}.vmdl_c")), &data).unwrap();
  }
  std::fs::write(root.join("soundevents/music.vsndevts_c"), &data).unwrap();
  let path = temp.path().join("archive.vpk");
  vpkmanager::pack_directory(&root, &path).unwrap();
  let archive = VpkArchive::open(&path).unwrap();
  let page = search(&archive, &request(r#"type = "citadel_music_title""#)).unwrap();
  assert_eq!(page.files[0].entry.path, "soundevents/music.vsndevts_c");
  assert!(page.next_cursor.is_some());
}

#[test]
#[ignore = "requires DMM_CONTENT_SEARCH_VPK pointing to an installed Deadlock archive"]
fn installed_archive_root_finds_music_and_panorama_assignments() {
  let path = std::env::var("DMM_CONTENT_SEARCH_VPK").expect("set DMM_CONTENT_SEARCH_VPK");
  let archive = VpkArchive::open(std::path::Path::new(&path)).unwrap();
  let queries = [
    r#"type = "citadel_music_title""#,
    r#"m_strAbilityImage = panorama:"file://{images}/hud/abilities/wraith_lift.psd""#,
  ];
  for text in queries {
    let mut query = request(text);
    let started = Instant::now();
    let mut found = false;
    for _ in 0..10 {
      let page = search(&archive, &query).unwrap();
      for file in page.files {
        eprintln!(
          "{text} => {}: {} matching lines after {:?}",
          file.entry.path,
          file.matching_lines,
          started.elapsed()
        );
        found = true;
      }
      if found {
        break;
      }
      eprintln!(
        "cursor {:?}, scanned {}, skipped {}, diagnostics {:?}",
        page.next_cursor, page.scanned_files, page.skipped_files, page.diagnostics
      );
      match page.next_cursor {
        Some(cursor) => {
          assert!(cursor > query.cursor);
          query.cursor = cursor;
        }
        None => break,
      }
    }
    assert!(found, "no matches for {text} within ten root search pages");
  }
}
