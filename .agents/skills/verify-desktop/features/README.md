# Desktop verification map

This directory is the maintained source for verifying user-facing behavior of the Deadlock Mod Manager desktop app. Read this index, then drive the matching feature file. Every recipe runs through the tauri-mcp-server tools described in `../SKILL.md`.

## Baseline preconditions

- The user has started `pnpm desktop:dev` (and `pnpm api:dev` when `.env` points at `localhost:9000`).
- `node .agents/skills/verify-desktop/scripts/doctor.mjs` exits 0.
- `driver_session` is started and onboarding is finished, so the sidebar is visible.
- The instance holds the user's real data. Record each value before you change it, so Cleanup can put it back.

## Driving conventions

- Navigate through the sidebar links `a[href="/<route>"]`, as a user does.
- Prefer ARIA labels, ids and `data-*` attributes over coordinates and DOM position. Names in quotes are literal English UI text; they change if the user switched languages.
- Take an accessibility snapshot before acting on a page, so `ref=eN` handles are fresh.
- Wait with `webview_wait_for` on the expected selector or text.

## Proof and skip reporting

- Save artifacts under `.verify/desktop/<run-id>/` with the feature ID in each file name.
- Capture the action's start state and its resulting state (screenshot plus accessibility snapshot).
- Back every mutation with a second view: an `invoke` read through `webview_execute_js`, or the persisted value after navigating away and back.
- Report an entry point you did not drive as unverified, with the reason.

## Feature entry contract

Each feature file starts with an H1 and one paragraph on the user-visible behavior, then exactly these H2s in order: `Sub-features` (short IDs, one line each), `How to get to it (user POV)`, `Driving it with tauri-mcp` (starts with `Preconditions:`, then labeled action bullets with the tool call and the observable result), and `Gotchas`.

## Features

- [Library toggle](./library-toggle.md) covers enabling and disabling an installed mod from the Mods Library, and the VPKs that move with it. E2E: `local-mod-lifecycle`, `library-groups-toggle`.
- [Catalog browse](./catalog-browse.md) covers searching the mod catalog and opening a mod's detail page. E2E: `catalog-refresh`, `gamebanana-single`.
- [Profiles](./profiles.md) covers switching the active profile from the topbar. E2E: `profiles-pointer`, `profiles-keyboard`.
- [Settings persistence](./settings.md) covers changing a setting and seeing it survive navigation and the stored state. E2E: `settings-backups-presence`.
