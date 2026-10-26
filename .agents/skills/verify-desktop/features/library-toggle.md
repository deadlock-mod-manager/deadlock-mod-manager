# Library toggle

A user disables a mod in the Mods Library (`/my-mods`) and its VPKs leave the active profile's addons; enabling it puts them back. The switch, the mod's status and the files on disk agree after each flip.

## Sub-features

- `toggle-disable` turns off an installed mod and removes its enabled VPKs.
- `toggle-enable` turns the mod back on and restores the same VPKs.
- `toggle-search` finds the mod through the My Mods search box before toggling.

## How to get to it (user POV)

- Sidebar `Mods Library`, then the switch on the mod's card.
- Sidebar `Mods Library`, type in the search box, then the switch on the filtered card.

## Driving it with tauri-mcp

Preconditions:

- The default profile is active (topbar `Active Profile` shows it) and holds at least one enabled mod. Note its name as `<name>`.
- Doctor passes and `driver_session` is started.

- **Open the library.** Click `a[href="/my-mods"]`. `webview_wait_for` selector `[data-library-mod]` appears.
- **Record files before.** `webview_execute_js` `(async () => await window.__TAURI__.core.invoke("get_profile_installed_vpks", { profileFolder: null }))()`. Save the result as `toggle-before.json`.
- **Find the mod.** `webview_keyboard` `type` into `#search` the text `<name>`. The card for `<name>` is the first result.
- **Disable.** Snapshot and screenshot, then click `[aria-label="Enable mod <name>"]`. The switch's `aria-checked` becomes `false`.
- **Confirm disable on disk.** Run the same `invoke` and save `toggle-after-disable.json`. The VPKs that belonged to `<name>` are gone from the list; every other entry is unchanged.
- **Enable.** Click the same switch. `aria-checked` returns to `true`.
- **Confirm restore.** Run the `invoke` again and save `toggle-after-enable.json`. Its file set matches `toggle-before.json`.
- **Proof.** Screenshot and accessibility snapshot after each flip, plus the three JSON files.

## Gotchas

- The switch is disabled while an action or analysis runs. Wait for it to become enabled before clicking.
- If the game is running, mod commands refuse to touch files (the game guard). Ask the user to close Deadlock.
- Filenames can shift between `pakNN_dir.vpk` slots on re-enable. Compare by mod, not only by filename.
- Leave the mod enabled at the end; that was its starting state.
