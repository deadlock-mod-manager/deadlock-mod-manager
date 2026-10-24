# Settings persistence

A user changes a setting, leaves the page, and finds it as they left it. The value is also written to the persisted store.

## Sub-features

- `settings-backup-toggle` flips automatic addons backups on the Backups tab.
- `settings-persist` survives navigation and appears in `state.json`.

## How to get to it (user POV)

- Sidebar `Settings`, then the `Backups` tab, then the automatic backup switch.

## Driving it with tauri-mcp

Preconditions:

- Doctor passes and `driver_session` is started.

- **Open the tab.** Click `a[href="/settings"]`, then `[data-settings-tab="backups"]`. Its `aria-selected` becomes `true`.
- **Record before.** Read `aria-checked` on `#toggle-auto-backup` (with `webview_find_element`). Call it `<before>`.
- **Flip.** Click `#toggle-auto-backup`. `aria-checked` becomes the opposite of `<before>`.
- **Survive navigation.** Click `a[href="/my-mods"]`, then return to Settings > Backups. `#toggle-auto-backup` still shows the flipped value.
- **Stored value.** In Bash, `grep -o '"backupEnabled":[a-z]*' "$APPDATA/dev.stormix.deadlock-mod-manager/state.json"` shows the flipped value. Save the output.
- **Restore.** Click the switch again and confirm `aria-checked` equals `<before>`, both in the UI and in `state.json`.
- **Proof.** Screenshots of the flipped switch before and after navigation, and both grep outputs.

## Gotchas

- The store writes asynchronously. Re-read `state.json` in a short bounded loop instead of once.
- The settings page has a search box (`Search settings`) that hides tabs while it holds text. Clear it first.
