//! Making the ledger agree with the disk.
//!
//! Everything the mod manager does goes through this crate, but the *user* is
//! not bound by that: they delete a pak file from Explorer, rename one, drag a
//! VPK between `addons` and `addons2`, restore an old backup over the top, or
//! copy a friend's mod in by hand. Any of those leaves `.dmm.json` describing a
//! profile that no longer exists.
//!
//! Reconciliation is what closes that gap. It reads the fingerprint out of every
//! VPK it finds and rebuilds the ledger from what the files themselves say they
//! are, so a file that moved is followed rather than lost, a file that is gone
//! is recorded as gone, and a file that appeared is adopted. A fingerprint is
//! the only authority here; filenames are treated as a hint, because a filename
//! is exactly what the user is most likely to have changed.

use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::Result;
use crate::fingerprint;
use crate::ledger::{ProfileLedger, TrackedVpk, VpkState};
use crate::naming;
use crate::profile::{ProfileBase, ShardIndex};
use crate::scan::{ScannedVpk, VpkKind, scan_profile};

/// A tracked file that is no longer where the ledger said it was.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Relocation {
    pub fingerprint_id: String,
    pub mod_id: String,
    pub from: (ShardIndex, String),
    pub to: (ShardIndex, String),
}

/// A fingerprinted VPK that the ledger had never seen before.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Adoption {
    pub fingerprint_id: String,
    pub mod_id: String,
    pub shard: ShardIndex,
    pub filename: String,
}

/// Why a file still needs a fingerprint.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StampReason {
    /// Predates fingerprinting, or was added to the folder by hand.
    NeverStamped,
    /// Carries a fingerprint another file in this profile already claims, which
    /// is what copying a stamped VPK produces. It needs an identity of its own.
    DuplicateStamp,
    /// Could not be read as a VPK at all — a truncated download, or a file that
    /// only has the extension.
    UnreadableStamp,
}

/// A VPK the backfill still has to stamp.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingStamp {
    pub path: PathBuf,
    pub shard: ShardIndex,
    pub filename: String,
    pub reason: StampReason,
    /// The mod this file most likely belongs to, from the ledger and from its
    /// name. `None` means nothing in the profile claims it.
    pub mod_id: Option<String>,
    /// The name to record as the mod's shipped filename when stamping.
    pub original_name: String,
}

/// What a reconciliation pass found and fixed.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct DriftReport {
    /// Files found somewhere other than where the ledger recorded them.
    pub relocated: Vec<Relocation>,
    /// Files the ledger tracked that are no longer anywhere in the profile.
    pub vanished: Vec<TrackedVpk>,
    /// Fingerprinted files the ledger did not know about.
    pub adopted: Vec<Adoption>,
    /// Files still waiting for a fingerprint.
    pub pending_stamps: Vec<PendingStamp>,
    /// Mods whose entry had to be rewritten to match the disk.
    pub repaired_mods: BTreeSet<String>,
    /// Mods that no longer have a single file anywhere and were dropped.
    pub forgotten_mods: BTreeSet<String>,
    /// Mods whose files ended up spread over several shards, which only a
    /// reorder can put right.
    pub split_mods: BTreeSet<String>,
}

impl DriftReport {
    /// Whether the ledger already described reality.
    pub fn is_clean(&self) -> bool {
        self.relocated.is_empty()
            && self.vanished.is_empty()
            && self.adopted.is_empty()
            && self.repaired_mods.is_empty()
            && self.forgotten_mods.is_empty()
            && self.split_mods.is_empty()
    }

    /// Whether anything was written into the ledger — i.e. whether the caller
    /// has to save it. Pending stamps alone do not dirty the ledger.
    pub fn changed_ledger(&self) -> bool {
        !self.is_clean()
    }

    pub fn summary(&self) -> String {
        format!(
            "{} relocated, {} vanished, {} adopted, {} repaired, {} forgotten, {} awaiting a fingerprint",
            self.relocated.len(),
            self.vanished.len(),
            self.adopted.len(),
            self.repaired_mods.len(),
            self.forgotten_mods.len(),
            self.pending_stamps.len()
        )
    }
}

/// How much a pass may assume about files that look untouched.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trust {
    /// Take a file at the same path, size and modified time to be the same file
    /// it was last time. Skips reading it, which is what makes reconciling a
    /// large profile on every read cheap.
    Stat,
    /// Read every file's fingerprint. Needed after an operation that renames
    /// files among themselves: a reorder can put file B at file A's name with
    /// the same size and the same modified time, and no stat can see that.
    EveryFile,
}

/// Reconcile a profile's ledger with its disk and persist the result.
///
/// This is the call to make on startup, before reading a profile's state, and
/// after any operation that touched one.
pub fn sync_profile(base: &ProfileBase, trust: Trust) -> Result<DriftReport> {
    let mut ledger = ProfileLedger::open_for_write(base.path())?;
    let report = reconcile(base, &mut ledger, trust)?;
    if report.changed_ledger() {
        ledger.save(base.path())?;
    }
    Ok(report)
}

/// One VPK on disk, together with the identity it turned out to carry.
struct Observation {
    file: ScannedVpk,
    mod_id: String,
    original_name: String,
    content_hash: String,
}

/// A VPK that needs stamping, before its owner has been worked out.
struct PendingFile {
    file: ScannedVpk,
    reason: StampReason,
    /// Owner and shipped name read off a stamp this file is not entitled to —
    /// what a copied VPK carries. Wrong as an identity, right as a hint.
    inherited: Option<(String, String)>,
}

pub fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or_default()
}

/// Bring `ledger` in line with what is on disk, and report what had drifted.
///
/// This never moves, renames or deletes a file: reconciliation changes the
/// book, not the shelf. Putting files back where they belong is a reorder's
/// job, and stamping the ones that still have no fingerprint is
/// [`crate::backfill`]'s.
pub fn reconcile(
    base: &ProfileBase,
    ledger: &mut ProfileLedger,
    trust: Trust,
) -> Result<DriftReport> {
    let mut report = DriftReport::default();
    let scanned = scan_profile(base)?;
    let now = unix_now();

    // What the ledger believed, indexed the way a scan result is shaped.
    let previous: BTreeMap<(ShardIndex, String), (String, TrackedVpk)> = ledger
        .files
        .iter()
        .map(|(id, tracked)| {
            (
                (tracked.shard, tracked.filename.clone()),
                (id.clone(), tracked.clone()),
            )
        })
        .collect();

    let mut observed: BTreeMap<String, Observation> = BTreeMap::new();
    let mut pending: Vec<PendingFile> = Vec::new();

    for file in scanned {
        // A file that is where it was, at the size it was, with the modified
        // time it had, cannot have become a different file. Trusting that is
        // what keeps a rescan from reading every VPK in the profile.
        let cached = previous
            .get(&(file.shard, file.filename.clone()))
            .filter(|_| trust == Trust::Stat)
            .filter(|(_, tracked)| tracked.matches_stat(file.size, file.modified_at));

        let identity = match cached {
            Some((id, tracked)) => Some((
                id.clone(),
                tracked.mod_id.clone(),
                tracked.original_name.clone(),
                tracked.content_hash.clone(),
            )),
            None => match fingerprint::read(&file.path) {
                Ok(Some(found)) => Some((
                    found.id,
                    found.mod_id,
                    found.original_name,
                    found.content_hash,
                )),
                Ok(None) => None,
                Err(error) => {
                    log::warn!(
                        "Could not read {} while reconciling: {error}",
                        file.path.display()
                    );
                    pending.push(PendingFile {
                        file,
                        reason: StampReason::UnreadableStamp,
                        inherited: None,
                    });
                    continue;
                }
            },
        };

        let Some((id, mod_id, original_name, content_hash)) = identity else {
            pending.push(PendingFile {
                file,
                reason: StampReason::NeverStamped,
                inherited: None,
            });
            continue;
        };

        if observed.contains_key(&id) {
            // Two files carrying one identity: someone copied a stamped VPK.
            // The copy is not this file's to keep, but it does say which mod the
            // bytes came from.
            pending.push(PendingFile {
                file,
                reason: StampReason::DuplicateStamp,
                inherited: Some((mod_id, original_name)),
            });
            continue;
        }

        observed.insert(
            id,
            Observation {
                file,
                mod_id,
                original_name,
                content_hash,
            },
        );
    }

    apply_observations(ledger, &observed, now, &mut report);

    let mut ledger_mods: BTreeSet<String> = ledger.mods.keys().cloned().collect();
    ledger_mods.extend(observed.values().map(|entry| entry.mod_id.clone()));
    for mod_id in ledger_mods {
        repair_mod(ledger, &mod_id, &observed, &pending, &mut report);
    }

    report.pending_stamps = pending
        .into_iter()
        .map(|entry| {
            let (mod_id, original_name) = match entry.inherited {
                Some((mod_id, original_name)) => (Some(mod_id), original_name),
                None => {
                    let mod_id = attributed_mod(ledger, &entry.file);
                    let original_name = original_name_for(ledger, &entry.file, mod_id.as_deref());
                    (mod_id, original_name)
                }
            };
            PendingStamp {
                path: entry.file.path,
                shard: entry.file.shard,
                filename: entry.file.filename,
                reason: entry.reason,
                mod_id,
                original_name,
            }
        })
        .collect();

    Ok(report)
}

/// Fold the scan's findings into `ledger.files`: follow moves, adopt strangers,
/// forget the gone.
fn apply_observations(
    ledger: &mut ProfileLedger,
    observed: &BTreeMap<String, Observation>,
    now: u64,
    report: &mut DriftReport,
) {
    for (id, entry) in observed {
        let state = if entry.file.is_enabled() {
            VpkState::Enabled
        } else {
            VpkState::Disabled
        };

        match ledger.tracked(id) {
            Some(previous)
                if previous.shard != entry.file.shard
                    || previous.filename != entry.file.filename =>
            {
                report.relocated.push(Relocation {
                    fingerprint_id: id.clone(),
                    mod_id: entry.mod_id.clone(),
                    from: (previous.shard, previous.filename.clone()),
                    to: (entry.file.shard, entry.file.filename.clone()),
                });
            }
            Some(_) => {}
            None => report.adopted.push(Adoption {
                fingerprint_id: id.clone(),
                mod_id: entry.mod_id.clone(),
                shard: entry.file.shard,
                filename: entry.file.filename.clone(),
            }),
        }

        ledger.track(
            id.clone(),
            TrackedVpk {
                mod_id: entry.mod_id.clone(),
                shard: entry.file.shard,
                filename: entry.file.filename.clone(),
                state,
                original_name: entry.original_name.clone(),
                content_hash: entry.content_hash.clone(),
                size: entry.file.size,
                modified_at: entry.file.modified_at,
                last_seen: now,
            },
        );
    }

    let gone: Vec<String> = ledger
        .files
        .keys()
        .filter(|id| !observed.contains_key(*id))
        .cloned()
        .collect();
    for id in gone {
        if let Some(tracked) = ledger.untrack(&id) {
            report.vanished.push(tracked);
        }
    }
}

/// Rewrite one mod's entry so it describes the files that are really there.
fn repair_mod(
    ledger: &mut ProfileLedger,
    mod_id: &str,
    observed: &BTreeMap<String, Observation>,
    pending: &[PendingFile],
    report: &mut DriftReport,
) {
    let entry = ledger.mods.get(mod_id).cloned().unwrap_or_default();

    // Fingerprinted files are authoritative about which mod they belong to.
    let mut enabled: Vec<(ShardIndex, u32, String, String)> = Vec::new();
    let mut disabled: Vec<(String, String)> = Vec::new();
    for observation in observed.values().filter(|entry| entry.mod_id == mod_id) {
        match &observation.file.kind {
            VpkKind::Enabled { number } => enabled.push((
                observation.file.shard,
                *number,
                observation.file.filename.clone(),
                observation.original_name.clone(),
            )),
            _ => disabled.push((
                observation.file.filename.clone(),
                observation.original_name.clone(),
            )),
        }
    }

    // Files with no fingerprint yet can still be attributed by name — that is
    // every file in a profile that has not been backfilled. A file carrying a
    // stamp that belongs to another file is deliberately not counted here: it
    // joins the mod once backfill has given it an identity of its own.
    for PendingFile {
        file, inherited, ..
    } in pending
    {
        if inherited.is_some() {
            continue;
        }
        match &file.kind {
            VpkKind::Enabled { number } => {
                let claimed_here = entry.enabled
                    && entry.shard == file.shard
                    && entry.current_vpks.iter().any(|name| *name == file.filename);
                if claimed_here {
                    let original = original_at_index(&entry, &file.filename);
                    enabled.push((file.shard, *number, file.filename.clone(), original));
                }
            }
            VpkKind::Disabled { mod_id: named } if named == mod_id => disabled.push((
                file.filename.clone(),
                naming::strip_mod_prefix(&file.filename, mod_id).to_string(),
            )),
            _ => {}
        }
    }

    enabled.sort_by(|left, right| (left.0, left.1).cmp(&(right.0, right.1)));
    disabled.sort();
    disabled.dedup();

    if enabled.is_empty() && disabled.is_empty() {
        // Nothing of this mod is left in the profile at all.
        if ledger.mods.contains_key(mod_id) {
            ledger.remove_mod(mod_id);
            report.forgotten_mods.insert(mod_id.to_string());
        }
        return;
    }

    let mut updated = entry.clone();
    if let Some(shard) = enabled.first().map(|(shard, _, _, _)| *shard) {
        if enabled.iter().any(|(other, _, _, _)| *other != shard) {
            report.split_mods.insert(mod_id.to_string());
        }
        let in_shard: Vec<_> = enabled
            .iter()
            .filter(|(other, _, _, _)| *other == shard)
            .collect();

        updated.enabled = true;
        updated.shard = shard;
        updated.current_vpks = in_shard
            .iter()
            .map(|(_, _, filename, _)| filename.clone())
            .collect();
        updated.original_vpk_names = in_shard
            .iter()
            .map(|(_, _, _, original)| original.clone())
            .collect();
    } else {
        updated.enabled = false;
        updated.current_vpks.clear();
        updated.original_vpk_names = disabled
            .iter()
            .map(|(_, original)| original.clone())
            .collect();
    }
    updated.disabled_vpks = disabled.iter().map(|(name, _)| name.clone()).collect();

    if !ledger.mods.contains_key(mod_id) || updated != entry {
        report.repaired_mods.insert(mod_id.to_string());
        ledger.mods.insert(mod_id.to_string(), updated);
    }
}

/// The shipped name recorded for `filename` in an entry, by its position in the
/// entry's parallel lists.
fn original_at_index(entry: &crate::ledger::ModEntry, filename: &str) -> String {
    entry
        .current_vpks
        .iter()
        .position(|name| name == filename)
        .and_then(|index| entry.original_vpk_names.get(index))
        .cloned()
        .unwrap_or_else(|| filename.to_string())
}

/// Which mod an unstamped file most likely belongs to.
fn attributed_mod(ledger: &ProfileLedger, file: &ScannedVpk) -> Option<String> {
    if let Some(mod_id) = file.named_mod_id() {
        return Some(mod_id.to_string());
    }
    ledger
        .mods
        .iter()
        .find(|(_, entry)| {
            entry.enabled
                && entry.shard == file.shard
                && entry.current_vpks.iter().any(|name| *name == file.filename)
        })
        .map(|(mod_id, _)| mod_id.clone())
}

fn original_name_for(ledger: &ProfileLedger, file: &ScannedVpk, mod_id: Option<&str>) -> String {
    let Some(mod_id) = mod_id else {
        return file.filename.clone();
    };
    if file.named_mod_id() == Some(mod_id) {
        return naming::strip_mod_prefix(&file.filename, mod_id).to_string();
    }
    ledger
        .mods
        .get(mod_id)
        .map(|entry| original_at_index(entry, &file.filename))
        .unwrap_or_else(|| file.filename.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ledger::ModEntry;
    use std::fs;

    fn base(temp: &tempfile::TempDir) -> ProfileBase {
        let path = temp.path().join("citadel").join("addons");
        fs::create_dir_all(&path).unwrap();
        ProfileBase::new(path).unwrap()
    }

    /// A real VPK, unstamped, written at `path`.
    fn unstamped_vpk(path: &std::path::Path) {
        let source = path.with_extension("src");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("asset.txt"), path.to_string_lossy().as_bytes()).unwrap();
        crate::pack::pack_directory(&source, path).unwrap();
        fs::remove_dir_all(&source).unwrap();
    }

    /// A real VPK, stamped for `mod_id`, written at `path`.
    fn stamped_vpk(path: &std::path::Path, mod_id: &str, original_name: &str) -> String {
        unstamped_vpk(path);
        fingerprint::stamp(path, mod_id, original_name).unwrap().id
    }

    fn enabled_ledger(mod_id: &str, filename: &str, original: &str) -> ProfileLedger {
        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled(
            mod_id,
            vec![filename.to_string()],
            vec![original.to_string()],
            Some(0),
            ShardIndex::FIRST,
        );
        ledger
    }

    /// The plain case: nothing changed since the last pass, so nothing is
    /// reported and no VPK is re-read.
    #[test]
    fn a_profile_that_matches_its_ledger_reports_no_drift() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        stamped_vpk(&base.join("pak01_dir.vpk"), "650634", "cool_mod.vpk");
        let mut ledger = enabled_ledger("650634", "pak01_dir.vpk", "cool_mod.vpk");

        let first = reconcile(&base, &mut ledger, Trust::Stat).unwrap();
        assert_eq!(first.adopted.len(), 1, "the file is tracked on first sight");

        let second = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert!(second.is_clean(), "{second:?}");
        assert!(second.pending_stamps.is_empty());
    }

    /// The headline case: the user renames a pak file in Explorer. The ledger
    /// has to follow the file rather than declare the mod missing.
    #[test]
    fn a_renamed_vpk_is_followed_by_its_fingerprint() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        let id = stamped_vpk(&base.join("pak01_dir.vpk"), "650634", "cool_mod.vpk");
        let mut ledger = enabled_ledger("650634", "pak01_dir.vpk", "cool_mod.vpk");
        reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        fs::rename(base.join("pak01_dir.vpk"), base.join("pak07_dir.vpk")).unwrap();
        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert_eq!(report.relocated.len(), 1);
        assert_eq!(report.relocated[0].to.1, "pak07_dir.vpk");
        assert!(report.vanished.is_empty(), "a rename is not a deletion");
        assert_eq!(ledger.tracked(&id).unwrap().filename, "pak07_dir.vpk");
        let entry = ledger.mods.get("650634").unwrap();
        assert!(entry.enabled);
        assert_eq!(entry.current_vpks, vec!["pak07_dir.vpk".to_string()]);
        assert_eq!(entry.original_vpk_names, vec!["cool_mod.vpk".to_string()]);
    }

    /// Dragging a pak file into `addons2` by hand changes which shard a mod
    /// lives in. The ledger must record the new shard, not the old one.
    #[test]
    fn a_vpk_moved_to_another_shard_is_followed_across_it() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        let id = stamped_vpk(&base.join("pak01_dir.vpk"), "650634", "cool_mod.vpk");
        let mut ledger = enabled_ledger("650634", "pak01_dir.vpk", "cool_mod.vpk");
        reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        let shard_two = base.shard_dir(ShardIndex::new(2).unwrap());
        fs::create_dir_all(&shard_two).unwrap();
        fs::rename(base.join("pak01_dir.vpk"), shard_two.join("pak01_dir.vpk")).unwrap();

        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert_eq!(report.relocated.len(), 1);
        assert_eq!(
            ledger.tracked(&id).unwrap().shard,
            ShardIndex::new(2).unwrap()
        );
        assert_eq!(
            ledger.mods.get("650634").unwrap().shard,
            ShardIndex::new(2).unwrap()
        );
    }

    /// A file the user deleted is gone for good, and the mod that owned it must
    /// stop claiming to be installed.
    #[test]
    fn a_deleted_vpk_disables_the_mod_that_owned_it() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        stamped_vpk(&base.join("pak01_dir.vpk"), "650634", "cool_mod.vpk");
        let mut ledger = enabled_ledger("650634", "pak01_dir.vpk", "cool_mod.vpk");
        reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        fs::remove_file(base.join("pak01_dir.vpk")).unwrap();
        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert_eq!(report.vanished.len(), 1);
        assert!(report.forgotten_mods.contains("650634"));
        assert!(!ledger.mods.contains_key("650634"));
        assert!(ledger.files.is_empty());
    }

    /// Disabling by hand — renaming the pak back to its prefixed form — has to
    /// read as "disabled", not as "deleted and a stranger appeared".
    #[test]
    fn a_vpk_renamed_to_its_disabled_form_disables_the_mod() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        stamped_vpk(&base.join("pak01_dir.vpk"), "650634", "cool_mod.vpk");
        let mut ledger = enabled_ledger("650634", "pak01_dir.vpk", "cool_mod.vpk");
        reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        fs::rename(base.join("pak01_dir.vpk"), base.join("650634_cool_mod.vpk")).unwrap();
        reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        let entry = ledger.mods.get("650634").unwrap();
        assert!(!entry.enabled);
        assert!(entry.current_vpks.is_empty());
        assert_eq!(entry.disabled_vpks, vec!["650634_cool_mod.vpk".to_string()]);
    }

    /// A stamped VPK copied in from somewhere else brings its own identity, so
    /// the profile learns which mod it is without being told.
    #[test]
    fn a_stamped_vpk_dropped_into_the_folder_is_adopted() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        let mut ledger = ProfileLedger::default();
        stamped_vpk(&base.join("pak01_dir.vpk"), "650634", "cool_mod.vpk");

        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert_eq!(report.adopted.len(), 1);
        assert_eq!(report.adopted[0].mod_id, "650634");
        let entry = ledger.mods.get("650634").unwrap();
        assert!(entry.enabled);
        assert_eq!(entry.current_vpks, vec!["pak01_dir.vpk".to_string()]);
        assert_eq!(entry.original_vpk_names, vec!["cool_mod.vpk".to_string()]);
    }

    /// Copying a stamped VPK produces two files with one identity. The copy has
    /// to be sent back for a fresh stamp rather than silently shadowing the
    /// original.
    #[test]
    fn a_copied_vpk_is_queued_for_a_fresh_stamp() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        stamped_vpk(&base.join("pak01_dir.vpk"), "650634", "cool_mod.vpk");
        fs::copy(base.join("pak01_dir.vpk"), base.join("pak02_dir.vpk")).unwrap();
        let mut ledger = ProfileLedger::default();

        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert_eq!(report.pending_stamps.len(), 1);
        assert_eq!(report.pending_stamps[0].reason, StampReason::DuplicateStamp);
        assert_eq!(report.pending_stamps[0].filename, "pak02_dir.vpk");
    }

    /// The state every existing install starts in: real files, a real ledger,
    /// and not a fingerprint anywhere. Reconciliation must leave that ledger
    /// alone and simply queue the files for stamping.
    #[test]
    fn an_unstamped_profile_is_left_intact_and_queued_for_backfill() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        unstamped_vpk(&base.join("pak01_dir.vpk"));
        unstamped_vpk(&base.join("650634_second.vpk"));
        let mut ledger = enabled_ledger("650634", "pak01_dir.vpk", "cool_mod.vpk");
        let before = ledger.mods.get("650634").cloned().unwrap();

        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert_eq!(report.pending_stamps.len(), 2);
        assert!(
            report
                .pending_stamps
                .iter()
                .all(|pending| pending.reason == StampReason::NeverStamped)
        );
        assert_eq!(
            report
                .pending_stamps
                .iter()
                .filter_map(|pending| pending.mod_id.as_deref())
                .collect::<Vec<_>>(),
            vec!["650634", "650634"],
            "both files are attributed to the mod that claims them"
        );

        let after = ledger.mods.get("650634").unwrap();
        assert!(after.enabled);
        assert_eq!(after.current_vpks, before.current_vpks);
        assert_eq!(after.original_vpk_names, before.original_vpk_names);
        // The prefixed file on disk is picked up as the mod's disabled copy.
        assert_eq!(after.disabled_vpks, vec!["650634_second.vpk".to_string()]);
    }

    /// An entry pointing at a file that was never there, in a profile with no
    /// fingerprints, still has to stop claiming the mod is enabled.
    #[test]
    fn an_entry_with_no_files_at_all_is_dropped() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        let mut ledger = enabled_ledger("650634", "pak01_dir.vpk", "cool_mod.vpk");

        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert!(report.forgotten_mods.contains("650634"));
        assert!(ledger.mods.is_empty());
    }

    /// Multi-file mods keep their files paired with the names they shipped
    /// under, in load order, which is what disabling them again depends on.
    #[test]
    fn a_multi_file_mod_keeps_its_names_paired_in_load_order() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        stamped_vpk(&base.join("pak02_dir.vpk"), "650634", "second.vpk");
        stamped_vpk(&base.join("pak01_dir.vpk"), "650634", "first.vpk");
        let mut ledger = ProfileLedger::default();

        reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        let entry = ledger.mods.get("650634").unwrap();
        assert_eq!(
            entry.current_vpks,
            vec!["pak01_dir.vpk".to_string(), "pak02_dir.vpk".to_string()]
        );
        assert_eq!(
            entry.original_vpk_names,
            vec!["first.vpk".to_string(), "second.vpk".to_string()]
        );
    }

    /// A mod whose files were split across shards by hand cannot be described
    /// by one entry, so it is flagged for a reorder to put right.
    #[test]
    fn a_mod_split_across_shards_is_flagged() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        let shard_two = base.shard_dir(ShardIndex::new(2).unwrap());
        fs::create_dir_all(&shard_two).unwrap();
        stamped_vpk(&base.join("pak01_dir.vpk"), "650634", "first.vpk");
        stamped_vpk(&shard_two.join("pak01_dir.vpk"), "650634", "second.vpk");
        let mut ledger = ProfileLedger::default();

        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert!(report.split_mods.contains("650634"));
        // Both files stay tracked even though only one shard fits in the entry.
        assert_eq!(ledger.tracked_for_mod("650634").count(), 2);
    }

    /// Untouched files must not be re-read on every pass: that is what makes
    /// reconciling a hundred-mod profile cheap enough to do on every launch.
    #[test]
    fn an_unchanged_file_is_not_reopened() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        let path = base.join("pak01_dir.vpk");
        let id = stamped_vpk(&path, "650634", "cool_mod.vpk");
        let mut ledger = ProfileLedger::default();
        reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        // Replace the bytes with something unreadable while keeping the size
        // and modified time the ledger recorded. Only a re-read would notice.
        let tracked = ledger.tracked(&id).unwrap().clone();
        let filler = vec![0u8; tracked.size as usize];
        let handle = fs::OpenOptions::new().write(true).open(&path).unwrap();
        use std::io::Write;
        let mut handle = handle;
        handle.write_all(&filler).unwrap();
        handle
            .set_modified(
                SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(tracked.modified_at),
            )
            .unwrap();
        drop(handle);

        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert!(report.is_clean(), "{report:?}");
        assert!(ledger.tracked(&id).is_some());
    }

    /// Two files that swap names keep their size and their modified time, so
    /// the stat shortcut cannot tell them apart — it will happily report that
    /// nothing moved. A reorder does exactly this swap, which is why it
    /// reconciles with [`Trust::EveryFile`] rather than the cheap default.
    #[test]
    fn swapped_files_are_only_told_apart_by_a_full_verify() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        let first = base.join("pak01_dir.vpk");
        let second = base.join("pak02_dir.vpk");
        // Same-length payloads, so the two VPKs come out byte-for-byte the same
        // size — the case the stat shortcut cannot see through.
        let left = stamped_vpk(&first, "650634", "aaa.vpk");
        let right = stamped_vpk(&second, "650635", "bbb.vpk");
        let stamped_at = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000);
        for path in [&first, &second] {
            fs::OpenOptions::new()
                .write(true)
                .open(path)
                .unwrap()
                .set_modified(stamped_at)
                .unwrap();
        }
        assert_eq!(
            fs::metadata(&first).unwrap().len(),
            fs::metadata(&second).unwrap().len()
        );

        let mut ledger = ProfileLedger::default();
        reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        // Swap them, preserving the modified times a rename would preserve.
        let scratch = base.join("swap.tmp");
        fs::rename(&first, &scratch).unwrap();
        fs::rename(&second, &first).unwrap();
        fs::rename(&scratch, &second).unwrap();
        for path in [&first, &second] {
            fs::OpenOptions::new()
                .write(true)
                .open(path)
                .unwrap()
                .set_modified(stamped_at)
                .unwrap();
        }

        let mut trusting = ledger.clone();
        let missed = reconcile(&base, &mut trusting, Trust::Stat).unwrap();
        assert!(
            missed.is_clean(),
            "the stat shortcut is expected to miss a swap; if it no longer does, this test is obsolete"
        );

        let caught = reconcile(&base, &mut ledger, Trust::EveryFile).unwrap();

        assert_eq!(caught.relocated.len(), 2);
        assert_eq!(ledger.tracked(&left).unwrap().filename, "pak02_dir.vpk");
        assert_eq!(ledger.tracked(&right).unwrap().filename, "pak01_dir.vpk");
        assert_eq!(
            ledger.mods.get("650634").unwrap().current_vpks,
            vec!["pak02_dir.vpk".to_string()]
        );
    }

    /// A mod entry that already matches the disk must not be rewritten, or
    /// every launch would dirty the ledger for nothing.
    #[test]
    fn reconciling_twice_does_not_keep_repairing_the_same_mod() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        stamped_vpk(&base.join("pak01_dir.vpk"), "650634", "cool_mod.vpk");
        stamped_vpk(&base.join("650634_spare.vpk"), "650634", "spare.vpk");
        let mut ledger = ProfileLedger::default();

        reconcile(&base, &mut ledger, Trust::Stat).unwrap();
        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert!(report.repaired_mods.is_empty(), "{report:?}");
        assert!(!report.changed_ledger());
    }

    #[test]
    fn a_foreign_vpk_nobody_claims_is_reported_without_an_owner() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        fs::write(base.join("random_thing.vpk"), b"dropped in by hand").unwrap();
        let mut ledger = ProfileLedger::default();

        let report = reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        assert_eq!(report.pending_stamps.len(), 1);
        assert_eq!(report.pending_stamps[0].mod_id, None);
        assert!(ledger.mods.is_empty());
    }

    /// The entry keeps a `ModEntry`'s untouched fields — install order in
    /// particular — through a repair.
    #[test]
    fn repairing_an_entry_preserves_its_install_order() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        stamped_vpk(&base.join("pak04_dir.vpk"), "650634", "cool_mod.vpk");
        let mut ledger = ProfileLedger::default();
        ledger.mods.insert(
            "650634".to_string(),
            ModEntry {
                enabled: true,
                order: Some(12),
                current_vpks: vec!["pak01_dir.vpk".to_string()],
                original_vpk_names: vec!["cool_mod.vpk".to_string()],
                ..Default::default()
            },
        );

        reconcile(&base, &mut ledger, Trust::Stat).unwrap();

        let entry = ledger.mods.get("650634").unwrap();
        assert_eq!(entry.order, Some(12));
        assert_eq!(entry.current_vpks, vec!["pak04_dir.vpk".to_string()]);
    }
}
