//! The promise this crate exists to keep: the mod manager knows where every
//! mod file is, and keeps knowing it after the user edits the folder by hand.
//!
//! These go through the same calls the desktop app makes, in the same order,
//! against a real profile tree on disk.

use std::fs;
use std::path::Path;

use vpkmanager::backfill;
use vpkmanager::fingerprint;
use vpkmanager::ledger::ProfileLedger;
use vpkmanager::ops::{self, MissingVpkPolicy, ShardAssignment};
use vpkmanager::profile::{ProfileBase, ShardIndex};
use vpkmanager::reconcile::{Trust, sync_profile};

/// A profile tree shaped the way the game install is.
fn profile(temp: &tempfile::TempDir) -> ProfileBase {
    let path = temp.path().join("game/citadel/addons");
    fs::create_dir_all(&path).unwrap();
    ProfileBase::new(path).unwrap()
}

/// An extracted mod download: a directory holding one or more real VPKs.
fn downloaded_mod(root: &Path, names: &[&str]) -> std::path::PathBuf {
    let extracted = root.join("extracted");
    for name in names {
        let source = extracted.join(format!("{name}.src"));
        fs::create_dir_all(source.join("models")).unwrap();
        fs::write(source.join("models/skin.vmdl_c"), name.as_bytes()).unwrap();
        vpkmanager::pack_directory(&source, &extracted.join(name)).unwrap();
        fs::remove_dir_all(&source).unwrap();
    }
    extracted
}

/// Install a mod the way the app does: copy it in under its prefix, then enable
/// it and record that in the ledger.
fn install(base: &ProfileBase, mod_id: &str, extracted: &Path) -> Vec<String> {
    let prefixed = ops::copy_vpks_with_prefix(extracted, base, mod_id, None).unwrap();
    let originals: Vec<String> = prefixed
        .iter()
        .map(|name| vpkmanager::naming::strip_mod_prefix(name, mod_id).to_string())
        .collect();

    let enabled = ops::enable_vpks_in(base, base, mod_id, &prefixed).unwrap();

    let mut ledger = ProfileLedger::open_for_write(base.path()).unwrap();
    ledger.mark_enabled(
        mod_id,
        enabled.clone(),
        originals,
        Some(0),
        ShardIndex::FIRST,
    );
    ledger.save(base.path()).unwrap();
    sync_profile(base, Trust::Stat).unwrap();
    enabled
}

/// The whole point: a mod survives the user renaming its file behind our back,
/// and can still be disabled afterwards — which is the operation that goes
/// wrong when the manager has lost track.
#[test]
fn a_mod_renamed_by_hand_can_still_be_disabled() {
    let temp = tempfile::tempdir().unwrap();
    let base = profile(&temp);
    let extracted = downloaded_mod(temp.path(), &["cool_mod.vpk"]);

    let enabled = install(&base, "650634", &extracted);
    assert_eq!(enabled, vec!["pak01_dir.vpk".to_string()]);

    // The user shuffles load order in Explorer.
    fs::rename(base.join("pak01_dir.vpk"), base.join("pak40_dir.vpk")).unwrap();

    let report = sync_profile(&base, Trust::Stat).unwrap();
    assert_eq!(report.relocated.len(), 1);
    assert!(report.vanished.is_empty());

    let ledger = ProfileLedger::load(base.path()).unwrap();
    let entry = ledger.mods.get("650634").unwrap();
    assert!(entry.enabled);
    assert_eq!(entry.current_vpks, vec!["pak40_dir.vpk".to_string()]);

    // Disabling now works against where the file actually is.
    let disabled = ops::disable_vpks_in(
        &base,
        &base,
        "650634",
        &entry.current_vpks,
        &entry.original_vpk_names,
        MissingVpkPolicy::Strict,
    )
    .unwrap();

    assert_eq!(disabled, vec!["650634_cool_mod.vpk".to_string()]);
    assert!(!base.join("pak40_dir.vpk").exists());
    assert!(base.join("650634_cool_mod.vpk").is_file());
}

/// A reorder renames nearly every file in the profile at once. Every mod has to
/// come out of it still pointing at its own VPKs.
#[test]
fn a_reorder_keeps_every_mod_pointing_at_its_own_files() {
    let temp = tempfile::tempdir().unwrap();
    let base = profile(&temp);

    for (index, mod_id) in ["650634", "650635", "650636"].iter().enumerate() {
        let extracted = downloaded_mod(
            &temp.path().join(format!("download{index}")),
            &[&format!("mod{index}.vpk")],
        );
        install(&base, mod_id, &extracted);
    }

    // Reverse the load order, as dragging mods in the UI does.
    let ledger = ProfileLedger::load(base.path()).unwrap();
    let mut assignments: Vec<ShardAssignment> = ledger
        .mods
        .iter()
        .map(|(mod_id, entry)| ShardAssignment {
            mod_id: mod_id.clone(),
            shard: entry.shard,
            vpks: entry.current_vpks.clone(),
        })
        .collect();
    assignments.reverse();
    let expected_order: Vec<String> = assignments
        .iter()
        .map(|assignment| assignment.mod_id.clone())
        .collect();

    ops::reorder_vpks_sharded(&assignments, base.path()).unwrap();
    sync_profile(&base, Trust::EveryFile).unwrap();

    let ledger = ProfileLedger::load(base.path()).unwrap();
    for (position, mod_id) in expected_order.iter().enumerate() {
        let entry = ledger.mods.get(mod_id).unwrap();
        assert_eq!(
            entry.current_vpks,
            vec![format!("pak{:02}_dir.vpk", position + 1)],
            "{mod_id} did not land in slot {}",
            position + 1
        );
        // And the file in that slot really is this mod's.
        let stamp = fingerprint::read(&base.join(&entry.current_vpks[0]))
            .unwrap()
            .unwrap();
        assert_eq!(&stamp.mod_id, mod_id);
    }
}

/// The upgrade an existing install goes through: files with no fingerprints,
/// a ledger from an older version, and a user who moved things around before
/// ever opening the new build.
#[test]
fn an_unstamped_profile_is_backfilled_and_then_survives_a_move() {
    let temp = tempfile::tempdir().unwrap();
    let base = profile(&temp);
    let extracted = downloaded_mod(temp.path(), &["cool_mod.vpk"]);

    // Simulate the pre-fingerprint world: the file is in place and the ledger
    // knows about it, but nothing is stamped.
    fs::copy(extracted.join("cool_mod.vpk"), base.join("pak01_dir.vpk")).unwrap();
    fs::write(
        base.join(".dmm.json"),
        r#"{"version": 1, "mods": {"650634": {"enabled": true, "order": 0,
            "currentVpks": ["pak01_dir.vpk"], "originalVpkNames": ["cool_mod.vpk"]}}}"#,
    )
    .unwrap();
    assert!(
        fingerprint::read(&base.join("pak01_dir.vpk"))
            .unwrap()
            .is_none()
    );

    let (_, outcome) = backfill::run_pass(&base, backfill::DEFAULT_BUDGET).unwrap();
    assert_eq!(outcome.stamped, 1);

    // Now the file can be followed. Move it to another shard by hand.
    let shard_two = base.shard_dir(ShardIndex::new(2).unwrap());
    fs::create_dir_all(&shard_two).unwrap();
    fs::rename(base.join("pak01_dir.vpk"), shard_two.join("pak07_dir.vpk")).unwrap();

    sync_profile(&base, Trust::Stat).unwrap();

    let ledger = ProfileLedger::load(base.path()).unwrap();
    let entry = ledger.mods.get("650634").unwrap();
    assert_eq!(entry.shard, ShardIndex::new(2).unwrap());
    assert_eq!(entry.current_vpks, vec!["pak07_dir.vpk".to_string()]);
    assert_eq!(
        entry.order,
        Some(0),
        "the install order survived the upgrade"
    );
}

/// Deleting a mod's file in Explorer is the case that used to leave the app
/// insisting a mod was installed.
#[test]
fn deleting_a_file_by_hand_removes_the_mod_from_the_ledger() {
    let temp = tempfile::tempdir().unwrap();
    let base = profile(&temp);
    let extracted = downloaded_mod(temp.path(), &["cool_mod.vpk"]);
    install(&base, "650634", &extracted);

    fs::remove_file(base.join("pak01_dir.vpk")).unwrap();
    let report = sync_profile(&base, Trust::Stat).unwrap();

    assert_eq!(report.vanished.len(), 1);
    assert!(report.forgotten_mods.contains("650634"));
    assert!(ProfileLedger::load(base.path()).unwrap().mods.is_empty());
}
