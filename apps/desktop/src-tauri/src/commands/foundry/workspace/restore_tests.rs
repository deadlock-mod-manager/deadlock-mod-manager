use super::*;

const ENTRY: &str = "folder/sample.txt";
const OTHER_ENTRY: &str = "folder/other.txt";

fn original_archive(path: &Path, name: &str, bytes: &[u8], archive_index: u16) {
  let mut tree = b"txt\0folder\0".to_vec();
  tree.extend_from_slice(name.as_bytes());
  tree.push(0);
  tree.extend_from_slice(&0u32.to_le_bytes());
  tree.extend_from_slice(&0u16.to_le_bytes());
  tree.extend_from_slice(&archive_index.to_le_bytes());
  tree.extend_from_slice(&0u32.to_le_bytes());
  tree.extend_from_slice(&u32::try_from(bytes.len()).unwrap().to_le_bytes());
  tree.extend_from_slice(&0xffffu16.to_le_bytes());
  tree.extend_from_slice(b"\0\0\0");

  let mut archive = 0x55aa1234u32.to_le_bytes().to_vec();
  archive.extend_from_slice(&1u32.to_le_bytes());
  archive.extend_from_slice(&u32::try_from(tree.len()).unwrap().to_le_bytes());
  archive.extend_from_slice(&tree);
  if archive_index == 0x7fff {
    archive.extend_from_slice(bytes);
  }
  std::fs::write(path, archive).unwrap();
}

fn edited_workspace(root: &Path) -> Vec<(PathBuf, Vec<u8>)> {
  let files = root.join("files");
  write_workspace_entry(&files, ENTRY, b"edited bytes").unwrap();
  write_workspace_entry(&files, OTHER_ENTRY, b"other edit").unwrap();
  let entries = [ENTRY.to_string(), OTHER_ENTRY.to_string()];
  record_edits(root, &entries, true).unwrap();
  record_paint(
    root,
    &entries,
    Some(&FoundryAppliedPaint {
      entry_path: ENTRY.into(),
      color_hex: "#ff8800".into(),
      saturation: 1.0,
      brightness: 1.0,
      pattern: None,
      pattern_intensity: 1.0,
      pattern_phase: 0.0,
    }),
  )
  .unwrap();
  std::fs::create_dir(root.join(SOUND_SOURCES)).unwrap();
  let source = root.join(SOUND_SOURCES).join("replacement.wav");
  std::fs::write(&source, b"replacement audio").unwrap();
  write_sound_settings(
    root,
    &BTreeMap::from([
      (
        ENTRY.into(),
        StoredSound {
          gain_db: 6.0,
          source: Some("replacement.wav".into()),
          ..Default::default()
        },
      ),
      (OTHER_ENTRY.into(), StoredSound::default()),
    ]),
  )
  .unwrap();
  [
    files.join(ENTRY),
    files.join(OTHER_ENTRY),
    root.join(EDIT_JOURNAL),
    root.join(PAINT_JOURNAL),
    root.join(SOUND_SETTINGS),
    source,
  ]
  .into_iter()
  .map(|path| {
    let bytes = std::fs::read(&path).unwrap();
    (path, bytes)
  })
  .collect()
}

fn assert_unchanged(snapshot: &[(PathBuf, Vec<u8>)]) {
  for (path, bytes) in snapshot {
    assert_eq!(&std::fs::read(path).unwrap(), bytes, "{}", path.display());
  }
}

fn assert_reverted_journals(root: &Path) {
  assert_eq!(read_edit_journal(root), vec![OTHER_ENTRY.to_string()]);
  assert_eq!(
    read_paint_journal(root).into_keys().collect::<Vec<_>>(),
    vec![OTHER_ENTRY.to_string()]
  );
  assert_eq!(
    read_sound_settings(root).into_keys().collect::<Vec<_>>(),
    vec![OTHER_ENTRY.to_string()]
  );
  assert!(!root.join(SOUND_SOURCES).join("replacement.wav").exists());
  assert_eq!(
    std::fs::read(root.join("files").join(OTHER_ENTRY)).unwrap(),
    b"other edit"
  );
}

#[test]
fn failed_restore_preserves_edited_file_and_journals() {
  for failure in ["corrupt", "unreadable", "missing", "companion", "truncated"] {
    let root = tempfile::tempdir().unwrap();
    let snapshot = edited_workspace(root.path());
    let skin = root.path().join("skin_dir.vpk");
    match failure {
      "corrupt" => std::fs::write(&skin, b"invalid VPK header").unwrap(),
      "unreadable" => std::fs::create_dir(&skin).unwrap(),
      "missing" => {}
      "companion" => original_archive(&skin, "sample", b"original", 0),
      "truncated" => {
        original_archive(&skin, "sample", b"original", 0x7fff);
        let file = std::fs::OpenOptions::new().write(true).open(&skin).unwrap();
        file.set_len(file.metadata().unwrap().len() - 1).unwrap();
      }
      _ => unreachable!(),
    }
    let base = root.path().join("base_dir.vpk");
    original_archive(&base, "sample", b"base original", 0x7fff);
    let result =
      revert_workspace_file_with_base(root.path().into(), ENTRY.into(), Some(skin), || {
        Ok(Some(base))
      });
    let error = result.unwrap_err();
    if matches!(failure, "unreadable" | "missing" | "companion") {
      assert!(matches!(error, Error::Io(_)), "{failure}: {error}");
    }
    assert_unchanged(&snapshot);
  }
}

#[test]
fn successful_restore_replaces_bytes_then_clears_only_its_journals() {
  let root = tempfile::tempdir().unwrap();
  edited_workspace(root.path());
  let skin = root.path().join("skin_dir.vpk");
  original_archive(&skin, "sample", b"skin original", 0x7fff);
  revert_workspace_file(root.path().into(), ENTRY.into(), Some(skin)).unwrap();
  assert_eq!(
    std::fs::read(root.path().join("files").join(ENTRY)).unwrap(),
    b"skin original"
  );
  assert_reverted_journals(root.path());
}

#[test]
fn base_only_override_removal_succeeds_with_or_without_a_skin() {
  for has_skin in [false, true] {
    let root = tempfile::tempdir().unwrap();
    edited_workspace(root.path());
    let skin = root.path().join("skin_dir.vpk");
    original_archive(&skin, "other", b"skin original", 0x7fff);
    let base = root.path().join("base_dir.vpk");
    original_archive(&base, "sample", b"base original", 0x7fff);
    revert_workspace_file_with_base(
      root.path().into(),
      ENTRY.into(),
      has_skin.then_some(skin),
      || Ok(Some(base)),
    )
    .unwrap();
    assert!(!root.path().join("files").join(ENTRY).exists());
    assert_reverted_journals(root.path());
  }
}

#[test]
fn extraction_falls_back_only_when_the_skin_entry_is_absent() {
  let root = tempfile::tempdir().unwrap();
  let skin_path = root.path().join("skin_dir.vpk");
  let base_path = root.path().join("base_dir.vpk");
  original_archive(&base_path, "sample", b"base original", 0x7fff);
  let base = source2_model::vpk_extract::VpkArchive::open(&base_path).unwrap();
  original_archive(&skin_path, "other", b"skin original", 0x7fff);
  let skin = source2_model::vpk_extract::VpkArchive::open(&skin_path).unwrap();
  assert_eq!(
    extract_either(&skin, Some(&base), ENTRY).unwrap(),
    b"base original"
  );
  assert!(extract_either(&skin, None, ENTRY).is_err());

  original_archive(&skin_path, "sample", b"skin original", 0);
  let skin = source2_model::vpk_extract::VpkArchive::open(&skin_path).unwrap();
  assert!(extract_either(&skin, Some(&base), ENTRY).is_err());
  original_archive(&skin_path, "sample", b"skin original", 0x7fff);
  let skin = source2_model::vpk_extract::VpkArchive::open(&skin_path).unwrap();
  let file = std::fs::OpenOptions::new()
    .write(true)
    .open(&skin_path)
    .unwrap();
  file.set_len(file.metadata().unwrap().len() - 1).unwrap();
  assert!(extract_either(&skin, Some(&base), ENTRY).is_err());
}

#[test]
fn failed_sound_reset_retains_settings_and_edited_bytes() {
  let root = tempfile::tempdir().unwrap();
  edited_workspace(root.path());
  let mut settings = read_sound_settings(root.path());
  settings.get_mut(ENTRY).unwrap().source = None;
  write_sound_settings(root.path(), &settings).unwrap();
  let journal = std::fs::read(root.path().join(SOUND_SETTINGS)).unwrap();
  let skin = root.path().join("skin_dir.vpk");
  std::fs::write(&skin, b"corrupt archive").unwrap();
  let result = adjust_workspace_sound(
    root.path().into(),
    ENTRY.into(),
    Some(skin),
    StoredSound::default().adjust(),
  );
  assert!(result.is_err());
  assert_eq!(
    std::fs::read(root.path().join(SOUND_SETTINGS)).unwrap(),
    journal
  );
  assert_eq!(
    std::fs::read(root.path().join("files").join(ENTRY)).unwrap(),
    b"edited bytes"
  );
  assert!(read_edit_journal(root.path()).contains(&ENTRY.to_string()));
}
