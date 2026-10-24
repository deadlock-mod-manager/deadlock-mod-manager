# Profiles

A user switches the active profile from the topbar. The topbar label, the library contents and the enabled VPKs follow the profile that was activated.

## Sub-features

- `profile-switch` activates another existing profile.
- `profile-switch-back` returns to the original profile and its mods.

## How to get to it (user POV)

- Topbar `Active Profile` button, then the `Activate <name> profile` switch in the profile manager.

## Driving it with tauri-mcp

Preconditions:

- At least two profiles exist. Note the active one as `<original>` and the target as `<other>`. If only one exists, report this feature unverified; creating a profile is a separate journey.
- Doctor passes and `driver_session` is started.

- **Record before.** Screenshot the topbar, and click `a[href="/my-mods"]` to snapshot the library.
- **Open the manager.** Click `button[aria-label="Active Profile"]`. A dialog opens listing profiles.
- **Switch.** Click `[role="switch"][aria-label="Activate <other> profile"]`. Its `aria-checked` becomes `true`.
- **Close and confirm.** `webview_keyboard` `press` `Escape`. `button[aria-label="Active Profile"]` text contains `<other>`, and My Mods shows `<other>`'s mods.
- **Switch back.** Repeat with `Activate <original> profile`. The topbar and library match the starting snapshot.
- **Proof.** Topbar and library screenshots for each state.

## Gotchas

- Switching profiles moves VPKs on disk and is refused while Deadlock runs.
- A Radix dialog keeps `body` pointer-events off during its exit animation. Wait for the dialog to disappear before clicking the next trigger.
- Always end on `<original>`.
