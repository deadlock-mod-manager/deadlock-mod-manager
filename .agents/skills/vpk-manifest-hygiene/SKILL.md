---
name: vpk-manifest-hygiene
description: Enforce VPK manifest updates whenever VPK files are created, moved, renamed, enabled, disabled, or deleted. Use when modifying VPK-related Rust code, touching vpk_manager, manager.rs, mods.rs, profiles.rs, or any code that mutates the addons directory. Prevents state drift between on-disk VPKs and the .dmm.json manifest.
disable-model-invocation: true
---

# VPK Manifest Hygiene

Every mutation to VPK files on disk **must** be followed by a corresponding update to the `ProfileVpkManifest` (`.dmm.json`). Skipping this causes state drift: the manifest no longer reflects reality, leading to ghost mods, missing mods, and broken enable/disable cycles.

## The Manifest

- File: `.dmm.json` inside the profile's addons directory
- Struct: `ProfileVpkManifest` in `apps/desktop/src-tauri/src/mod_manager/vpk_manifest.rs`
- Tracks per-mod: `enabled`, `current_vpks`, `disabled_vpks`, `original_vpk_names`, `order`

## The Rule

**If you touch VPKs on disk, you must update and save the manifest in the same operation.**

Concretely, any code path that does one of the following must call the corresponding manifest method and then `manifest.save()`:

| Disk operation               | Manifest call                                                            |
| ---------------------------- | ------------------------------------------------------------------------ |
| Install / enable VPKs        | `manifest.mark_enabled(mod_id, current_vpks, original_vpk_names, order)` |
| Disable VPKs (prefix-rename) | `manifest.mark_disabled(mod_id, disabled_vpks, original_vpk_names)`      |
| Uninstall / delete VPKs      | `manifest.remove_mod(mod_id)`                                            |
| Reorder VPKs                 | Update `order` via `mark_enabled` for affected mods                      |
| Replace / swap VPK files     | `mark_enabled` or `mark_disabled` depending on final state               |

## Existing Patterns to Follow

Look at the current call sites for reference:

- `manager.rs` — `enable_mod`, `disable_mod`, `uninstall_mod`, `reorder_mods`, `replace_vpk_files`
- `mods.rs` — `persist_analyzed_mod`, `swap_mod_options`, `switch_download_variant`
- `profiles.rs` — `import_profile`

Every one of these loads the manifest, mutates it, and saves it atomically (write-to-tmp then rename). Follow the same pattern.

## Checklist for Code Review

When reviewing or writing code that touches VPK files:

- [ ] Manifest is loaded before disk mutations begin
- [ ] Every disk mutation has a matching manifest update
- [ ] `manifest.save()` is called after all mutations complete
- [ ] Error paths do not leave the manifest out of sync (save before early returns if partial work was done)
- [ ] No new VPK disk operations were added without manifest calls
