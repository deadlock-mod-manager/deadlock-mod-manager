use std::fs;

use vpk_parser::{VpkParseOptions, VpkParser};

fn parse(path: &std::path::Path) -> vpk_parser::VpkParsed {
    VpkParser::parse(
        fs::read(path).expect("read VPK"),
        VpkParseOptions {
            include_full_file_hash: false,
            file_path: path.to_string_lossy().to_string(),
            last_modified: None,
            include_merkle: true,
            include_entries: true,
        },
    )
    .expect("parse VPK")
}

#[test]
fn stamping_does_not_change_lockdex_content_hashes() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("src");
    fs::create_dir_all(source.join("models/heroes")).unwrap();
    fs::write(source.join("models/heroes/skin.vmdl_c"), b"model bytes").unwrap();
    let vpk = temp.path().join("mod.vpk");
    vpkmanager::pack_directory(&source, &vpk).unwrap();

    let before = parse(&vpk);
    vpkmanager::fingerprint::stamp(&vpk, "650634", "cool_mod.vpk").unwrap();
    let after = parse(&vpk);

    assert_eq!(
        before.fingerprint.content_signature,
        after.fingerprint.content_signature
    );
    assert_eq!(before.fingerprint.merkle_root, after.fingerprint.merkle_root);
    assert_eq!(before.fingerprint.file_count, after.fingerprint.file_count);
    assert_eq!(before.manifest_sha256, after.manifest_sha256);
    assert_eq!(after.entries.len(), before.entries.len() + 1);
}
