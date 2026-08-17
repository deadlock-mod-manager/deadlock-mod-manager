//! Giving a fingerprint to the VPKs that do not have one yet.
//!
//! Newly downloaded mods are stamped as they are installed, but every profile
//! that existed before fingerprinting is full of files that are not, and the
//! user keeps adding more by hand. Backfill closes that gap in the background:
//! it takes the list of unstamped files a reconciliation pass produced, stamps
//! as many as its budget allows, and records each one in the ledger.
//!
//! It is written as "do a bounded amount of work and return" rather than as a
//! loop, because it shares a profile with the operations the user triggers. The
//! caller holds the same lock for a stamp as it does for an install, and a small
//! budget is what keeps that lock from being held for long.
//!
//! Files no mod claims are deliberately left alone — see [`BackfillOutcome`].

use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use crate::error::Result;
use crate::fingerprint;
use crate::ledger::{ProfileLedger, TrackedVpk, VpkState};
use crate::naming;
use crate::profile::ProfileBase;
use crate::reconcile::{DriftReport, PendingStamp, StampReason, Trust, reconcile, unix_now};

/// How many VPKs one background pass stamps before returning. Each stamp
/// rewrites a whole VPK, so this trades responsiveness for how fast a large
/// profile finishes.
pub const DEFAULT_BUDGET: usize = 8;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct BackfillOutcome {
    pub stamped: usize,
    /// Files skipped because no mod in this profile claims them. They are left
    /// exactly as they are: stamping a stranger's VPK would invent a mod.
    pub unclaimed: usize,
    /// Files that could not be stamped, with why.
    pub failed: Vec<(PathBuf, String)>,
    /// Claimed files still waiting after this pass.
    pub remaining: usize,
}

impl BackfillOutcome {
    /// Whether another pass has work to do.
    pub fn has_more(&self) -> bool {
        self.remaining > 0
    }

    /// Whether this pass changed the ledger.
    pub fn changed_ledger(&self) -> bool {
        self.stamped > 0
    }
}

/// Stamp up to `budget` of the files a reconciliation pass found unstamped.
///
/// Updates `ledger` for every file it stamps; the caller saves it.
pub fn run(ledger: &mut ProfileLedger, pending: &[PendingStamp], budget: usize) -> BackfillOutcome {
    let mut outcome = BackfillOutcome::default();
    let mut claimed = pending.iter().filter(|file| {
        if file.mod_id.is_none() {
            return false;
        }
        // A file we could not parse is not a VPK we can stamp; leave it for a
        // human to look at rather than rewriting it.
        file.reason != StampReason::UnreadableStamp
    });

    for file in claimed.by_ref().take(budget) {
        let mod_id = file.mod_id.as_deref().unwrap_or_default();
        // Every file here either has no fingerprint or has one that belongs to
        // another file, so both cases want a freshly issued identity.
        match fingerprint::stamp(&file.path, mod_id, &file.original_name) {
            Ok(fingerprint) => match track_stamped(ledger, file, &fingerprint) {
                Ok(()) => outcome.stamped += 1,
                Err(error) => outcome.failed.push((
                    file.path.clone(),
                    format!("stamped, but not tracked: {error}"),
                )),
            },
            Err(error) => {
                log::warn!("Failed to fingerprint {}: {error}", file.path.display());
                outcome.failed.push((file.path.clone(), error.to_string()));
            }
        }
    }

    outcome.remaining = claimed.count();
    outcome.unclaimed = pending.iter().filter(|file| file.mod_id.is_none()).count();
    outcome
}

/// Record a freshly stamped file, re-reading its size and modified time so the
/// next scan recognizes it without opening it again.
fn track_stamped(
    ledger: &mut ProfileLedger,
    file: &PendingStamp,
    fingerprint: &fingerprint::VpkFingerprint,
) -> Result<()> {
    let metadata = fs::metadata(&file.path)?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_secs())
        .unwrap_or_default();

    // A file that was tracked under a stamp it had inherited from another file
    // must stop being tracked under it, or the original would look relocated.
    if let Some(previous) = ledger
        .tracked_at(file.shard, &file.filename)
        .map(str::to_string)
        && previous != fingerprint.id
    {
        ledger.untrack(&previous);
    }

    let state = if naming::is_enabled_vpk_name(&file.filename) {
        VpkState::Enabled
    } else {
        VpkState::Disabled
    };

    ledger.track(
        fingerprint.id.clone(),
        TrackedVpk {
            mod_id: fingerprint.mod_id.clone(),
            shard: file.shard,
            filename: file.filename.clone(),
            state,
            original_name: fingerprint.original_name.clone(),
            content_hash: fingerprint.content_hash.clone(),
            size: metadata.len(),
            modified_at,
            last_seen: unix_now(),
        },
    );
    Ok(())
}

/// Reconcile a profile and stamp a budget's worth of what is still unstamped,
/// saving the ledger if either step changed it.
///
/// This is the whole background pass: one call, one lock, bounded work.
pub fn run_pass(base: &ProfileBase, budget: usize) -> Result<(DriftReport, BackfillOutcome)> {
    let mut ledger = ProfileLedger::open_for_write(base.path())?;
    // Stat is enough here: backfill only ever runs from a quiet background pass,
    // never on the heels of an operation that reshuffled filenames.
    let report = reconcile(base, &mut ledger, Trust::Stat)?;
    let outcome = run(&mut ledger, &report.pending_stamps, budget);

    if report.changed_ledger() || outcome.changed_ledger() {
        ledger.save(base.path())?;
    }
    Ok((report, outcome))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::ShardIndex;

    fn base(temp: &tempfile::TempDir) -> ProfileBase {
        let path = temp.path().join("citadel").join("addons");
        fs::create_dir_all(&path).unwrap();
        ProfileBase::new(path).unwrap()
    }

    fn vpk(path: &std::path::Path) {
        let source = path.with_extension("src");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("asset.txt"), path.to_string_lossy().as_bytes()).unwrap();
        crate::pack::pack_directory(&source, path).unwrap();
        fs::remove_dir_all(&source).unwrap();
    }

    fn ledger_with_enabled_mod(base: &ProfileBase, mod_id: &str, vpks: &[(&str, &str)]) {
        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled(
            mod_id,
            vpks.iter().map(|(name, _)| name.to_string()).collect(),
            vpks.iter()
                .map(|(_, original)| original.to_string())
                .collect(),
            Some(0),
            ShardIndex::FIRST,
        );
        ledger.save(base.path()).unwrap();
    }

    /// The upgrade path every existing install takes: files that were installed
    /// before fingerprints existed get stamped without being moved or renamed.
    #[test]
    fn backfill_stamps_existing_files_in_place() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        vpk(&base.join("pak01_dir.vpk"));
        vpk(&base.join("650634_spare.vpk"));
        ledger_with_enabled_mod(&base, "650634", &[("pak01_dir.vpk", "cool_mod.vpk")]);

        let (report, outcome) = run_pass(&base, DEFAULT_BUDGET).unwrap();

        assert_eq!(report.pending_stamps.len(), 2);
        assert_eq!(outcome.stamped, 2);
        assert!(!outcome.has_more());
        assert!(outcome.failed.is_empty());

        // Both files are still exactly where they were, and now carry the mod.
        assert!(base.join("pak01_dir.vpk").is_file());
        assert!(base.join("650634_spare.vpk").is_file());
        let enabled = fingerprint::read(&base.join("pak01_dir.vpk"))
            .unwrap()
            .unwrap();
        assert_eq!(enabled.mod_id, "650634");
        assert_eq!(enabled.original_name, "cool_mod.vpk");
        let disabled = fingerprint::read(&base.join("650634_spare.vpk"))
            .unwrap()
            .unwrap();
        assert_eq!(disabled.original_name, "spare.vpk");

        // And the ledger can now find them by fingerprint.
        let ledger = ProfileLedger::load(base.path()).unwrap();
        assert_eq!(ledger.files.len(), 2);
        assert_eq!(
            ledger.tracked(&enabled.id).unwrap().filename,
            "pak01_dir.vpk"
        );
    }

    /// The point of stamping: once a file is stamped, renaming it no longer
    /// loses it.
    #[test]
    fn a_backfilled_file_survives_being_renamed_afterwards() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        vpk(&base.join("pak01_dir.vpk"));
        ledger_with_enabled_mod(&base, "650634", &[("pak01_dir.vpk", "cool_mod.vpk")]);
        run_pass(&base, DEFAULT_BUDGET).unwrap();

        fs::rename(base.join("pak01_dir.vpk"), base.join("pak09_dir.vpk")).unwrap();
        let (report, _) = run_pass(&base, DEFAULT_BUDGET).unwrap();

        assert_eq!(report.relocated.len(), 1);
        let ledger = ProfileLedger::load(base.path()).unwrap();
        assert_eq!(
            ledger.mods.get("650634").unwrap().current_vpks,
            vec!["pak09_dir.vpk".to_string()]
        );
    }

    /// A pass must not hold the profile lock for a whole library, so it stops at
    /// its budget and says how much is left.
    #[test]
    fn a_pass_stops_at_its_budget_and_reports_the_rest() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        let names: Vec<String> = (1..=5).map(|i| format!("pak{i:02}_dir.vpk")).collect();
        for name in &names {
            vpk(&base.join(name));
        }
        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled(
            "650634",
            names.clone(),
            names.iter().map(|name| format!("src-{name}")).collect(),
            Some(0),
            ShardIndex::FIRST,
        );
        ledger.save(base.path()).unwrap();

        let (_, first) = run_pass(&base, 2).unwrap();

        assert_eq!(first.stamped, 2);
        assert_eq!(first.remaining, 3);
        assert!(first.has_more());

        let (_, second) = run_pass(&base, 10).unwrap();

        assert_eq!(second.stamped, 3);
        assert!(!second.has_more());
        for name in &names {
            assert!(
                fingerprint::read(&base.join(name)).unwrap().is_some(),
                "{name}"
            );
        }
    }

    /// A VPK no mod claims belongs to the user, not to us. Leave it untouched.
    #[test]
    fn an_unclaimed_vpk_is_left_alone() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        vpk(&base.join("someone_elses.vpk"));
        let before = fs::read(base.join("someone_elses.vpk")).unwrap();

        let (_, outcome) = run_pass(&base, DEFAULT_BUDGET).unwrap();

        assert_eq!(outcome.stamped, 0);
        assert_eq!(outcome.unclaimed, 1);
        assert_eq!(fs::read(base.join("someone_elses.vpk")).unwrap(), before);
    }

    /// A file that is not a VPK at all must be reported, never rewritten.
    #[test]
    fn a_file_that_is_not_a_vpk_is_not_stamped() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        fs::write(base.join("650634_broken.vpk"), b"truncated download").unwrap();

        let (report, outcome) = run_pass(&base, DEFAULT_BUDGET).unwrap();

        assert_eq!(
            report.pending_stamps[0].reason,
            StampReason::UnreadableStamp
        );
        assert_eq!(outcome.stamped, 0);
        assert_eq!(
            fs::read(base.join("650634_broken.vpk")).unwrap(),
            b"truncated download"
        );
    }

    /// A copied VPK arrives carrying someone else's identity. After backfill the
    /// two files must be tracked separately, both still owned by the mod.
    #[test]
    fn a_copy_gets_its_own_identity() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        vpk(&base.join("pak01_dir.vpk"));
        ledger_with_enabled_mod(&base, "650634", &[("pak01_dir.vpk", "cool_mod.vpk")]);
        run_pass(&base, DEFAULT_BUDGET).unwrap();

        fs::copy(base.join("pak01_dir.vpk"), base.join("pak02_dir.vpk")).unwrap();
        run_pass(&base, DEFAULT_BUDGET).unwrap();
        let (report, outcome) = run_pass(&base, DEFAULT_BUDGET).unwrap();

        assert!(report.pending_stamps.is_empty(), "{report:?}");
        assert_eq!(outcome.stamped, 0);
        let first = fingerprint::read(&base.join("pak01_dir.vpk"))
            .unwrap()
            .unwrap();
        let second = fingerprint::read(&base.join("pak02_dir.vpk"))
            .unwrap()
            .unwrap();
        assert_ne!(first.id, second.id);
        assert_eq!(second.mod_id, "650634");

        let ledger = ProfileLedger::load(base.path()).unwrap();
        assert_eq!(ledger.files.len(), 2);
        assert_eq!(ledger.tracked(&first.id).unwrap().filename, "pak01_dir.vpk");
        assert_eq!(
            ledger.tracked(&second.id).unwrap().filename,
            "pak02_dir.vpk"
        );
    }

    /// A pass over a profile that is already fully stamped must not rewrite a
    /// single byte — otherwise the background worker would churn forever.
    #[test]
    fn a_settled_profile_is_not_touched_again() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        vpk(&base.join("pak01_dir.vpk"));
        ledger_with_enabled_mod(&base, "650634", &[("pak01_dir.vpk", "cool_mod.vpk")]);
        run_pass(&base, DEFAULT_BUDGET).unwrap();

        let vpk_before = fs::read(base.join("pak01_dir.vpk")).unwrap();
        let ledger_before = fs::read(base.join(crate::ledger::LEDGER_FILENAME)).unwrap();

        let (report, outcome) = run_pass(&base, DEFAULT_BUDGET).unwrap();

        assert!(report.is_clean(), "{report:?}");
        assert_eq!(outcome.stamped, 0);
        assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), vpk_before);
        assert_eq!(
            fs::read(base.join(crate::ledger::LEDGER_FILENAME)).unwrap(),
            ledger_before
        );
    }
}
