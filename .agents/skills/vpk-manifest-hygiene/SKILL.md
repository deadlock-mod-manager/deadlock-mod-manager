---
name: vpk-manifest-hygiene
description: Enforce VPK ledger updates whenever VPK files are created, moved, renamed, enabled, disabled, or deleted. Use when modifying VPK-related Rust code, touching the vpkmanager package, manager.rs, mods.rs, profiles.rs, or any code that mutates the addons directory. Prevents state drift between on-disk VPKs and .dmm.json.
disable-model-invocation: true
---

# VPK Ledger Hygiene

Every mutation to VPK files on disk **must** be followed by a corresponding update to the profile ledger (`.dmm.json`). Skipping this causes state drift: the ledger no longer reflects reality, leading to ghost mods, missing mods, and broken enable/disable cycles.

## The Ledger

- File: `.dmm.json` inside the profile's addons directory
- Struct: `ProfileLedger` in `packages/vpkmanager/src/ledger.rs`
- Tracks per mod: `enabled`, `current_vpks`, `disabled_vpks`, `original_vpk_names`, `order`
- Tracks per file, keyed by fingerprint id: where that exact VPK was last seen

## The Rule

**Do not touch VPKs on disk from outside `packages/vpkmanager`.** The operations in `vpkmanager::ops` are the only code allowed to rename, copy or delete a file in a `citadel/addonsN` directory; `vpkmanager::locate` and `vpkmanager::scan` are the only ways to find or list them. Adding a `fs::rename` or a `read_dir` over an addons folder anywhere else is the defect this skill exists to catch.

Within that boundary, any operation must update the ledger and save it:

| Disk operation               | Ledger call                                                             |
| ---------------------------- | ----------------------------------------------------------------------- |
| Install / enable VPKs        | `ledger.mark_enabled(mod_id, current_vpks, original_vpk_names, order, shard)` |
| Disable VPKs (prefix-rename) | `ledger.mark_disabled(mod_id, disabled_vpks, original_vpk_names)`       |
| Uninstall / delete VPKs      | `ledger.remove_mod(mod_id)`                                             |
| Reorder VPKs                 | Update placements, then reconcile with `Trust::EveryFile`               |
| Replace / swap VPK files     | `mark_enabled` or `mark_disabled` depending on final state              |

## Reconciliation is a backstop, not a substitute

`vpkmanager::reconcile::sync_profile` rebuilds the ledger from the fingerprints stamped inside the VPKs, which is what recovers from changes the user made outside the app. Call it after an operation and before reading a profile's state. It does **not** excuse skipping the ledger update in the operation itself: reconciliation can only recover what a fingerprint can prove, and a file the backfill has not reached yet has none.

Use `Trust::EveryFile` after anything that renames files among themselves — a reorder can give file B the name file A just had, at the same size and modified time, which the stat shortcut cannot see through.

## Checklist for Code Review

- [ ] No new VPK disk operation outside `packages/vpkmanager`
- [ ] No new `read_dir` over an addons folder outside `scan`/`locate`
- [ ] Ledger is loaded (`open_for_write`) before disk mutations begin
- [ ] Every disk mutation has a matching ledger update
- [ ] `ledger.save()` is called after all mutations complete
- [ ] Error paths roll the files back (see `vpkmanager::staging`) rather than leaving the ledger out of sync
- [ ] A profile the operation touched is reconciled afterwards
