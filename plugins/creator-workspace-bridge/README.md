# Creator Workspace Bridge

An external Deadlock Mod Manager plugin. It stages each stable VPK your creator tools export and deploys the build you pick to a testing profile. DMM installs, updates and removes it from a ZIP archive at runtime, so changing the plugin never requires rebuilding DMM.

## What runs where

| Part                         | Source                                                       | Runs in                                                                     |
| ---------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Backend (`backend.wasm`)     | `backend/` (Rust, `wasm32-unknown-unknown`, guest ABI v1)    | DMM's supervised plugin worker, a fresh instance per call, no WASI          |
| UI (`ui/index.html` + assets) | `ui/` (React, i18next, React Query, bundled with Vite)       | A sandboxed frame on the plugin's page in DMM, with no IPC or network      |
| Guest SDK                    | [`packages/plugin-sdk-rust`](../../packages/plugin-sdk-rust) | Linked into the backend                                                     |
| UI SDK                       | [`packages/plugin-sdk`](../../packages/plugin-sdk)           | Bundled into the UI                                                         |

Embedded in DMM, the UI takes DMM's theme and language from the page (`onHostContext`), lets DMM's backdrop show through, and hides its own header because DMM shows the plugin's name above the frame.

DMM owns file access: it watches the granted file, waits for it to settle, validates the VPK, hashes it, stages a snapshot and installs snapshots in the picked profile. The plugin owns the workflow: which builds stay in its eight-entry history, what was deployed, recovery from an interrupted deployment, and its own settings and view state, all persisted through plugin storage.

The watched file and the target profile are picked in DMM's trusted Access UI. The plugin only sees display values (the file's name and the profile folder) and never sends a path or profile to the host.

### Permissions

Manifest schema 1, SDK 1. All three are required:

| Permission | Scope                                                  | Used for                                                        |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `files`    | one picked `.vpk` file, read only                      | `files.snapshot` on each tick, `files.snapshots` to list builds |
| `mods`     | `install` into a picked profile (never the default)    | `mods.install` to deploy, `mods.installed` to reconcile         |
| `storage`  | the plugin's own storage                               | build history, settings and view state                          |

### Commands

| Command      | Payload                          | Caller                          | Does                                                                                                   |
| ------------ | -------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `tick`       | `{}`                             | DMM supervisor, every 2 seconds | `files.snapshot`; records a ready build at the front of history and the watch state                    |
| `status`     | `{}`                             | UI                              | Reconciles history with `files.snapshots` and `mods.installed`, returns grants, builds, deployed hash, errors, settings, view state |
| `deploy`     | `{ "hash": "<sha256>" }`         | UI                              | Checks the hash is in history and still staged, then `mods.install`; returns `status`                  |
| `configure`  | `{ "requireReadyMarker": bool }` | UI                              | Plugin setting: only stage once `<file>.ready` is newer than the file                                    |
| `setUiState` | `{ "historyExpanded": bool }`    | UI                              | Persists view state                                                                                    |

Hostcalls used: `grants.get`, `files.snapshot`, `files.snapshots`, `mods.install`, `mods.installed`, `storage.get`, `storage.set`. The plugin keeps everything under one storage key, `workflow`.

The plugin relies on DMM running one call per plugin at a time. A deployment that stops midway (worker crash, timeout) leaves a pending marker in storage; the next call compares it with the hash DMM reports as installed and either records the deployment or asks the user to deploy again.

## Build

Requirements: Rust with the `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`), Bun, and pnpm.

This directory is its own install root and Cargo workspace, outside the DMM pnpm and Cargo workspaces, with its own `pnpm-lock.yaml`, `Cargo.lock` and `target/`.

```bash
cd plugins/creator-workspace-bridge
pnpm install
pnpm build
```

`pnpm build` runs `scripts/build.ts`, which:

1. compiles `backend/` with `cargo build --release --locked --target wasm32-unknown-unknown` and checks that the module imports only `dmm.host_call` and exports `memory`, `alloc` and `call`,
2. bundles the UI with Vite into `dist/package/ui/` (no CDN or remote scripts),
3. copies `manifest.json` and `backend.wasm` into `dist/package/`,
4. writes `dist/example.creator-workspace-bridge-<version>.zip` and its `.sha256`.

The archive is reproducible: entries are stored uncompressed in path order with a fixed 1980-01-01 timestamp, and machine-specific paths are remapped out of the WASM. Rebuilding with the same toolchain on the same OS produces the same bytes.

`dist/` is build output and is ignored by git.

## Install, update and remove

1. In DMM, turn on **Plugins** under **Settings → Experimental**.
2. Open **Manage plugins**.
3. Choose **Install from file** and pick the ZIP from `dist/`.
4. Choose **Set up**: pick the VPK your tool exports and a testing profile (the default profile is never offered).
5. Enable the plugin. It appears under **Plugins** in the sidebar.

To update, bump `version` in `manifest.json` (and `package.json`), rebuild, and install the new archive the same way. To remove it, use **Remove** in the same list.

## Test

```bash
pnpm test         # guest and SDK unit tests, a build, then the WASM ABI tests in tests/
pnpm check-types
pnpm lint         # clippy for the native and wasm32 targets
```

`tests/backend.test.ts` loads the built `dist/package/backend.wasm`. It instantiates the module per call the way DMM does and covers storage persistence across instances, the hostcall buffer retry, denied hostcalls and malformed requests.

The guest unit tests in `backend/src/tests.rs` run the command handlers against an in-memory host covering: staging and deduplication, the eight-build limit that keeps the deployed build, denied and missing grants, unreadable stored state, and deployments interrupted before and after DMM committed them.
