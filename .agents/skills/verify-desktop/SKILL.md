---
name: verify-desktop
description: Drive the running Deadlock Mod Manager desktop app (Tauri dev build) through tauri-mcp-server and capture proof that a UI, IPC, or mod-file change works the way a user sees it. Use when verifying a desktop change before a PR, reproducing a desktop bug in the real app, or when asked to "verify in the app" or "prove it works".
---

# Verify the desktop app

You drive the user's own dev instance of the Tauri app (`apps/desktop`) through the `tauri-mcp-server` tools, the same way a user clicks through it, and leave screenshots, DOM snapshots and IPC reads as proof. Feature recipes live in [`features/README.md`](features/README.md); read the index, then the file for the feature you are proving.

## Launch

The user starts the app; you never start or restart it. Ask them to run, from the repo root:

- `pnpm desktop:dev`: Vite on `http://localhost:1420`, then a debug wry build with the MCP bridge on `127.0.0.1:9223`. The first Rust compile takes minutes.
- `pnpm api:dev` too, when the root `.env` sets `VITE_API_URL=http://localhost:9000` (it needs Postgres and Redis from `env.example`). Without a local API, the user can override `VITE_API_URL=https://api.deadlockmods.app` before `desktop:dev`.

Ready means the doctor passes: the window is open and the bridge upgrades. While waiting, poll the doctor in a bounded loop (for example 48 tries, 5 s apart) instead of sleeping.

This instance runs on the user's real data: `%APPDATA%\dev.stormix.deadlock-mod-manager\state.json`, their real Deadlock install, and their real library. There is one instance only (single-instance plugin, Vite `strictPort`), so two agents never drive it at once. Saving desktop source files while the app runs hot-reloads it, so finish edits before driving, and never save while the user runs a long operation.

Isolated runs from an empty data dir exist only in the WebdriverIO E2E harness (`apps/desktop/e2e`, `DMM_E2E_CONFIG` worlds), which has no MCP bridge. It is the regression suite, not this skill's driver; see Regression coverage.

## Regression coverage

This skill proves a change once, on live data. The E2E suite keeps it proven, but the full suite is slow, so run only the case you are working on and ask before running any other. Each feature in [`features/README.md`](features/README.md) names its E2E case; the scenario ids live in `apps/desktop/e2e/support/scenarios.ts`. A fix for a real bug adds or extends one case. Run it in CI through the `Desktop E2E` workflow (`workflow_dispatch` with a `suites` list), or locally:

```bash
pnpm --filter @deadlock-mods/desktop e2e:build   # once per code change; a separate debug binary, no bridge
pnpm --filter @deadlock-mods/desktop e2e:test -- --case <case-id>
```

`e2e:build` and a running `desktop:dev` both compile `src-tauri`; build while the user is not mid-run in the dev app.

## Doctor

Run before the first `driver_session` and whenever anything looks off:

```bash
node .agents/skills/verify-desktop/scripts/doctor.mjs
```

It checks Vite on 1420, a bounded WebSocket handshake on the bridge (must answer `101`), and the API's `/health/live`, then prints the log path. Exit code 0 means drive. On any `FAIL`, report the line to the user; `driver_session start` hangs on a stale bridge port, so never call it after a failed bridge check.

## Drive

1. `driver_session` with `action: "start"` (default port 9223). Confirm with `ipc_get_backend_state`; the identifier is `dev.stormix.deadlock-mod-manager`.
2. Look before acting: `webview_screenshot` and `webview_dom_snapshot` (`type: "accessibility"` for `ref=eN` handles, `"structure"` for CSS).
3. Navigate with the sidebar links: `webview_interact` `action: "click"`, `selector: 'a[href="/my-mods"]'` (also `/mods`, `/downloads`, `/settings`, `/skins`, `/crosshairs`, `/servers`).
4. Act through `webview_interact` and `webview_keyboard` on stable handles: ARIA labels (`button[aria-label="Active Profile"]`, `[aria-label="Enable mod <name>"]`), ids (`#search`, `#settings-language`, `#toggle-auto-backup`), and `data-testid` / `data-*` attributes (`[data-testid="installed-files"]`, `[data-library-mod]`, `[data-sonner-toast]`). Radix menus open more reliably with a click followed by `webview_keyboard` `press` `ArrowDown`.
5. Wait on a state, not a clock: `webview_wait_for` with `type: "selector"` or `"text"`.
6. Read backend truth with `webview_execute_js` and an IIFE, since `ipc_execute_command` can return "Unsupported Tauri command":
   `(async () => await window.__TAURI__.core.invoke("get_profile_installed_vpks", { profileFolder: null }))()`
   (`profileFolder: null` is the default profile.) Other useful read-only commands: `get_all_downloads`, `get_download_status`, `get_profile_vpk_manifest`, `get_mod_health`, `get_log_info`.
7. Watch IPC with `ipc_monitor` `start`, then `ipc_get_captured`; read console errors with `read_logs` `source: "console"`.

## Evidence

Write every artifact under `.verify/desktop/<run-id>/` at the repo root (gitignored), where `<run-id>` is `<yyyymmdd-hhmm>-<feature-id>`. Pass absolute paths to `webview_screenshot` `filePath`, and save DOM snapshots and IPC results as `.txt`/`.json` with the Write tool.

A proof:

- exercises the real user path (sidebar, buttons, switches), not store setters or `invoke` calls that stand in for a click;
- captures before and after: a screenshot plus an accessibility snapshot of the action's starting state and of the resulting state;
- confirms the side effect through a second view: an `invoke` read of the VPK list or manifest, the Downloads page, or the persisted value after navigating away and back;
- names the feature ID and the entry point used, and lists any entry point it did not exercise.

Report a recipe you could not complete as unverified, with the step and the unmet precondition. A different entry point is a different proof.

## Cleanup

1. Undo every mutation: toggle mods back, reactivate the original profile, restore changed settings, delete anything the run added. Confirm with the same second view used for the proof.
2. Stop `ipc_monitor` if started, then `driver_session` `action: "stop"`.
3. Leave the app and dev server running; they belong to the user.
4. Keep `.verify/desktop/<run-id>/`. Check the files are still there before reporting.

## Gotchas

- CEF builds (`dev:cef`), E2E builds and release builds have no bridge. After a CEF build the user runs `pnpm --filter desktop cef:cleanup`.
- `webview_screenshot` captures the viewport only. Scroll the target into view first.
- The first launch on fresh data shows the onboarding wizard, which asks for the game path; finish it as the user would or ask them to.
- The rule `.cursor/rules/056-tauri-mcp-debugging.mdc` names `capabilities/default.json` for the bridge permission; it actually lives in `src-tauri/capabilities/wry/mcp-bridge.json`.
