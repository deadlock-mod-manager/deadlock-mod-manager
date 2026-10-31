# External plugin runtime

Runtime-installed plugins for the desktop app, the first slice of
[RFC 003](../../rfcs/003-plugin-platform/proposal.md). A plugin is a ZIP
package with a manifest, a compiled UI and an optional Rust/WASM backend. It is
installed, updated and removed at runtime; nothing about a plugin is compiled
into the app, and the bundled plugin loader in `src/lib/plugins.ts` is never
used for it.

## Module interface

`dmm-plugin-runtime` has no Tauri, desktop or HTTP dependency. `PluginHost`
owns installation, grants, storage, staged snapshots, deployment recovery
records, request policy and supervised worker execution. Its implementation
modules remain private.

The application supplies a `HostAdapter` for profile validation and listing,
profile mods, installed snapshot lookup, deployment and source retention, game
detection and performing network requests. DMM's adapter lives in
`apps/desktop/src-tauri/src/external_plugins/profiles.rs` (network transport in
`network.rs`); tests supply a filesystem adapter. Game guards, profile
manifests, the mod manager and the HTTP client stay in the desktop adapter.

The desktop frame adapter uses `PluginHost::view` and `read_view_asset`. It
receives a view descriptor and authorized asset bytes, not registry records or
installed package directories. The protocol handler, CSP and response headers
remain desktop responsibilities.

## Package

```text
manifest.json
ui/index.html, ui/assets/*   # any layout; `ui` names the entry page
backend.wasm                 # optional
```

```json
{
  "schemaVersion": 2,
  "id": "example.creator-workspace-bridge",
  "name": "Creator Workspace Bridge",
  "version": "0.1.0",
  "sdkVersion": 2,
  "description": "optional, at most 500 characters",
  "author": "optional, at most 100 characters",
  "icon": "optional Phosphor icon name, e.g. wrench",
  "accent": "optional #RRGGBB color",
  "changelog": ["optional, what changed in this version"],
  "ui": "ui/index.html",
  "backend": "backend.wasm",
  "permissions": {
    "required": [
      { "id": "files", "kind": "file", "extensions": ["vpk"], "access": "read" },
      { "id": "mods", "access": ["install"], "profiles": "picked" },
      { "id": "storage" }
    ],
    "optional": []
  }
}
```

- Unknown fields, unknown permission IDs and unknown scope fields fail
  validation. `schemaVersion` and `sdkVersion` must both be 2. `id` is
  lowercase, namespaced (`publisher.name`), 3-64 characters. `version` is
  numeric `MAJOR.MINOR.PATCH`.
- `icon` matches `^[a-z0-9]+(-[a-z0-9]+)*$` and is at most 40 characters; the
  host decides how to render names it does not know. `accent` is `#RRGGBB`.
  `changelog` lists at most 10 entries of 1-200 printable characters.
- Archive limits: 64 MiB archive, 128 MiB expanded, 32 MiB per entry, 1024
  entries, 64 KiB manifest, 16 MiB backend. Sizes are enforced on the bytes
  actually decompressed. Entries must be safe relative `/` paths (no `..`,
  absolute paths, backslashes, drive letters, reserved Windows names, duplicate
  names ignoring case), and symlinks or encrypted entries are rejected.
- The backend is validated against the guest ABI at install time.
- `optional` permissions are validated but never granted yet.

### Permission catalog

Each ID appears at most once across `required` and `optional`. List scopes are
sorted on parse, so a request is unchanged exactly when it is equal.

| ID              | Scope                                                                                                                          | Hostcalls                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `files`         | `kind`: `file` or `folder`; `extensions`: 0-10 names of 1-10 lowercase letters or digits, no dot, empty for any; `access`: `read` or `readWrite` | `files.info`, `files.list` (folders), `files.read`, `files.snapshot`, `files.snapshots`; `files.write` with `readWrite` |
| `mods`          | `access`: non-empty, duplicate-free set of `read` and `install`; `profiles`: `picked` or `all`; `install` needs `picked`        | `mods.list` with `read`; `mods.install`, `mods.installed` with `install`           |
| `network`       | `hosts`: 1-10 distinct lowercase DNS names with at least two labels; no scheme, port, wildcard, IP literal or `localhost`       | `http.fetch`                                                                       |
| `game`          | none                                                                                                                           | `game.state`                                                                       |
| `storage`       | none                                                                                                                           | `storage.get`, `storage.set`                                                       |
| `notifications` | none                                                                                                                           | `notifications.show`                                                               |

## Lifecycle

State lives in `<app local data>/external-plugins/`: `registry.json` (installs,
grants, generations, pending updates; schema 2), `packages/<id>/<version>-<hash>/`
(the installed package and any pending one) and `data/<id>/` (`storage.json`,
staged snapshots, deploy state, `activity.json`).

- **Registry migration.** A schema 1 registry (the first permission catalog)
  is renamed to `registry.v1.json.bak`, `packages/` is deleted and the
  registry starts empty, with a warning in the log. Those plugins must be
  installed again. A schema newer than 2 is an error.
- **Install** leaves the plugin disabled with no grant.
- **Grant** records consent for every required request, with the resources
  the user picks in trusted host UI:
  - a file or folder, exactly when `files` is required. It must be absolute
    and is stored canonicalised. A folder must exist; a file may not exist
    yet, but its folder must, and it must pass the extension filter. It must
    be outside plugin storage, and a folder must not contain it.
  - a profile folder, exactly when `mods` has `profiles: "picked"`. The
    adapter checks it exists; `"default"` names the default profile and is
    refused when `access` includes `install`.

  Passing a resource the manifest does not ask for is an error. Granting does
  not enable.
- **Needs consent** while any required request is not in the grant exactly, or
  a resource it needs is not picked.
- **Enable** requires full consent and clears a quarantine.
- **Update** is installing the same `id` with a newer version. Same version and
  identical archive is a no-op; anything else at or below the installed version
  is refused. When the grant holds every request the new version requires, or
  there is no grant yet, the update installs at once. Approvals for requests
  the new manifest no longer makes are dropped, so a request removed and later
  reintroduced needs consent again, and a picked resource the new scopes no
  longer allow is cleared.
- **Pending update**: when a granted plugin's new version requires a request
  the grant does not hold exactly (new, or with a changed scope), the package
  is unpacked and kept as the pending update. The installed version keeps
  running with the same generation, grant and enabled state. Installing another
  newer archive replaces the pending one; installing the same archive again is
  a no-op. **Apply** installs it, sets the grant's approvals to its required
  requests, clears a picked file or profile the new scopes no longer allow
  (the plugin then needs consent and is disabled), keeps the enabled state
  otherwise and moves to a new generation. **Discard** deletes it. An update
  that installs at once also drops a pending update that is not newer.
- **Clear data** deletes `storage.json` and moves to a new generation, so the
  worker restarts with empty storage. Staged snapshots and deploy records stay.
- **Revoke** drops the grant and disables. **Remove** deletes the package, any
  pending update, the grant, storage, staged snapshots and activity. Mods it
  installed stay in their profile as ordinary local mods.

Every lifecycle change moves the plugin to a new **generation**. Workers carry
the generation they started with, and the broker checks the current one on
every UI call, hostcall and asset request, so stale work is refused even before
its worker is killed. The desktop app emits `external-plugins-changed` with the
plugin id after every lifecycle change and whenever the pending update is
staged, replaced or discarded, and the app page refreshes that plugin.

## Host administration IPC

| Command                           | Arguments                               | Returns                    |
| --------------------------------- | --------------------------------------- | -------------------------- |
| `external_plugins_list`           | none                                    | `ExternalPluginSummary[]`  |
| `external_plugins_install`        | `{ archivePath }`                       | `ExternalPluginSummary`    |
| `external_plugins_install_url`    | `{ url, sha256 }`                       | `ExternalPluginSummary`    |
| `external_plugins_apply_update`   | `{ pluginId }`                          | `ExternalPluginSummary`    |
| `external_plugins_discard_update` | `{ pluginId }`                          | nothing                    |
| `external_plugins_grant`          | `{ pluginId, filePath?, profileFolder? }` | nothing                  |
| `external_plugins_revoke`         | `{ pluginId }`                          | nothing                    |
| `external_plugins_enable`         | `{ pluginId, enabled }`                 | nothing                    |
| `external_plugins_clear_data`     | `{ pluginId }`                          | nothing                    |
| `external_plugins_activity`       | `{ pluginId, limit? }`                  | `ExternalPluginActivity[]` |
| `external_plugins_remove`         | `{ pluginId }`                          | nothing                    |

- `external_plugins_install` records the source `file`.
  `external_plugins_install_url` takes an `https` URL (redirects must stay on
  https) and a lowercase hex SHA-256. The desktop app downloads the archive
  with the 64 MiB cap enforced while streaming; the runtime refuses an archive
  whose hash differs before unpacking it, and records the source `catalog`.
- `external_plugins_grant` takes `filePath` exactly when the manifest requires
  `files` and `profileFolder` (`"default"` for the default profile) exactly
  when it requires `mods` with `profiles: "picked"`; `null` otherwise.
- `external_plugins_enable({ enabled: true })` also restarts a quarantined
  plugin: it clears the quarantine, the error and the crash window that leads
  to quarantine. It does not reset `restartsToday`.
- `external_plugins_activity` returns entries newest first; `limit` is clamped
  to 1-100 and defaults to 100.

Types are generated into `apps/desktop/src/types/generated/`:
`ExternalPluginSummary`, `ExternalPluginGrant`, `ExternalPluginGrantedFile`,
`ExternalPluginStatus` (`disabled`, `needsConsent`, `enabled`, `quarantined`),
`ExternalPluginPermission` (a union tagged on `id`),
`ExternalPluginPermissionId`, `ExternalPluginFileKind`,
`ExternalPluginFileAccess`, `ExternalPluginModAccess`,
`ExternalPluginProfileScope`, `ExternalPluginSource` (`file`, `catalog`),
`ExternalPluginPendingUpdate`, `ExternalPluginActivity`,
`ExternalPluginActivityKind`, `ExternalPluginBlockedEvent` and
`ExternalPluginNotificationEvent`.

Besides the manifest fields, `ExternalPluginSummary` reports:

- `source`, and `packageSize`: the bytes of the installed archive.
- `grant`: `{ permissions, file: { path, name, kind } | null, profileFolder |
  null, grantedAt }`. `path` is shown the way the user picked it (no `\\?\`
  prefix).
- `storageBytes`: the size of `storage.json`, 0 when nothing is stored.
- `lastTickAt`: when a `tick` last returned a guest result (an `ok: false`
  envelope counts; traps and worker failures do not). Kept in memory, so it is
  `null` after the app starts until the first tick.
- `restartsToday`: worker failures since local midnight. Each one kills the
  worker, which restarts on the next call: crashes, timeouts, protocol
  violations and failed starts. Traps do not. Kept in memory.
- `lastErrorAt`: when `lastError` was recorded.
- `pendingUpdate`: `{ version, packageHash, packageSize, newPermissions,
  changelog, source }`. `newPermissions` are the requests the update requires
  that the grant does not hold exactly.

## Activity

Each plugin keeps an activity log in `data/<id>/activity.json`, newest first,
at most 100 entries, written atomically. An entry is `{ at, kind, permission,
method, hash, size, resources, fileName, profileFolder, host, reason }`;
`permission` is a permission ID, and fields a kind does not use are `null`.

| `kind`        | Recorded when                                                  | Fields                                                                     |
| ------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `staged`      | `files.snapshot` staged a file the store did not hold          | `permission` `files`, `hash`, `size`, `resources` (VPKs), `fileName`       |
| `deployed`    | `mods.install` succeeded                                       | `permission` `mods`, `hash`, `profileFolder`                               |
| `wrote`       | `files.write` replaced a file                                  | `permission` `files`, `fileName`, `size`                                   |
| `fetched`     | `http.fetch` got a response                                    | `permission` `network`, `host`                                             |
| `notified`    | `notifications.show` showed a notification                     | `permission` `notifications`, `reason`: the title                          |
| `blocked`     | a hostcall failed with `permission_denied` or `unknown_method` | `method`, the `permission` it needed if any, `host` for fetches, `reason`: the code |
| `granted`     | the user granted permissions                                   |                                                                            |
| `revoked`     | the user revoked the grant                                     |                                                                            |
| `updated`     | an update was installed or applied                             | `reason`: the new version                                                  |
| `dataCleared` | the user cleared the plugin's storage                          |                                                                            |
| `stopped`     | the plugin was quarantined                                     | `reason`: the message shown as `lastError`                                 |

Routine reads (`grants.get`, `files.info`/`list`/`read`, `storage.*`,
snapshots that stage nothing, `mods.list`, `game.state`) are not recorded. A
`blocked`, `wrote` or `fetched` entry that repeats the newest entry (same
kind, method, permission, file name, host and reason) within 60 s is dropped,
so a plugin repeating a call on every tick logs it once a minute.

Each recorded `blocked` entry also goes to the host's blocked hook. The desktop
app emits it as `external-plugins-blocked` with an `ExternalPluginBlockedEvent`
payload, `{ pluginId, activity }`.

## Plugin view transport

A plugin frame has no IPC. It posts JSON strings to the app page
(`dmm-plugin-frame/1`, see `@deadlock-mods/plugin-sdk`), and the page relays
each call with `external_plugins_frame_call({ pluginId, command, payloadJson })
-> string`.

- The page names the plugin from the frame element it created and only accepts
  messages whose `source` is that frame's window. Nothing in a message names a
  plugin.
- `command` matches `[a-z][A-Za-z0-9_.-]{0,63}` and is not `tick`; `payloadJson`
  is at most 64 KiB of JSON. The backend receives
  `{"command": ..., "payload": ...}`.
- A plugin that is not enabled rejects with `invalidInput`. Session failures
  reject with error kind `externalPluginSession` and a message prefixed
  `session_revoked`, `plugin_disabled`, `consent_required` or `plugin_removed`. Everything else resolves with an
  envelope string: the plugin's own `{ok, value}` / `{ok:false, error}` or a host
  error with code `invalid_command`, `payload_too_large`, `invalid_payload`,
  `no_backend`, `worker_failed`, `fuel_exhausted`, `guest_trap` or
  `abi_violation`.

## Guest ABI v1

The module must export `memory` (32-bit, unshared), `alloc(len: i32) -> i32`
and `call(ptr: i32, len: i32) -> i64`, and may import only
`dmm.host_call(in_ptr, in_len, out_ptr, out_cap: i32) -> i32`. Anything else,
including any WASI import, fails validation. Features are WebAssembly 2.0.

Each call runs in a fresh instance: the host `alloc`s the input, writes the JSON
`{command, payload}`, calls `call`, and reads the result from
`(ptr << 32) | len`. The result must be exactly `{"ok":true,"value":...}` or
`{"ok":false,"error":{"code":"...","message":"..."}}`. State survives only
through `storage.*`.

`host_call` takes a JSON request `{method, params}` and writes a JSON envelope
of the same shape. It returns:

- `n >= 0`: bytes written.
- `-1`: request longer than 6 MiB.
- `-2`: more than 256 hostcalls in this call.
- `n <= -16`: the buffer is too small; `-n` bytes are needed. The response is
  kept, and calling again with **identical request bytes** and a large enough
  buffer returns it without running the hostcall again. Any other request
  discards it.

Pointers out of bounds trap the guest.


### Hostcalls

Every method re-checks the session, the permission and the request's scope.
Refusals return `permission_denied`. `path` is a relative `/`-separated path
inside a granted folder; file grants take none.

| Method               | Needs                        | Params                                                       | Value                                                            |
| -------------------- | ---------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `grants.get`         | nothing                      | none                                                         | `{permissions, file: {name, kind} \| null, profile: {folder} \| null}` |
| `files.info`         | `files`                      | `{path?}`                                                    | `{exists, kind, size, modifiedAt}` (`null` when absent)          |
| `files.list`         | `files`, folder              | `{path?}`                                                    | `{entries: [{name, kind, size, modifiedAt}], truncated}`        |
| `files.read`         | `files`                      | `{path?, offset?, length?, encoding: "utf8" \| "base64"}`    | `{data, size, eof}`                                              |
| `files.write`        | `files` with `readWrite`     | `{path?, data, encoding}`                                    | `{size}`                                                         |
| `files.snapshot`     | `files`                      | `{path?, requireReadyMarker?}`                               | `{state, fileName, snapshot?, message?}`                         |
| `files.snapshots`    | `files`                      | none                                                         | `{snapshots: Snapshot[]}`                                        |
| `mods.list`          | `mods` with `read`           | none                                                         | `{profiles: [{folder, mods: [{id, name?, enabled, files}]}]}`    |
| `mods.install`       | `mods` with `install`        | `{hash}`                                                     | `{hash}`                                                         |
| `mods.installed`     | `mods` with `install`        | none                                                         | `{hash}` (`null` when none)                                      |
| `http.fetch`         | `network`                    | `{url, method, headers?, body?, bodyEncoding?}`              | `{status, headers, body, bodyEncoding}`                          |
| `game.state`         | `game`                       | none                                                         | `{running}`                                                      |
| `storage.get`        | `storage`                    | `{key}`                                                      | `{value}` (`null` when unset)                                    |
| `storage.set`        | `storage`                    | `{key, value}`; `null` deletes                               | `null`                                                           |
| `notifications.show` | `notifications`              | `{title, body?}`                                             | `null`                                                           |

- **Paths.** Plugins see file names, never full paths. A `path` with `..`, a
  leading `/` or `\`, or a component that is a symlink, junction or other
  reparse point is refused; so is an existing entry whose canonical path
  leaves the folder. Malformed names (empty components, `.`, `:`, `\`,
  `*?"<>|`, control characters, trailing dots or spaces, reserved device
  names) are `invalid_params`. Files must pass the extension filter;
  `files.list` leaves out redirects and filtered files, sorts by name and
  stops at 1000 entries. A granted path that is gone is `not_found`; one that
  now redirects is refused.
- **Reads** return at most 1 MiB (`length` defaults to 1 MiB) from `offset`;
  `size` is the whole file's. A UTF-8 chunk ends on a character boundary, so
  the next offset is the previous one plus the chunk's byte length; bytes that
  are not UTF-8 fail with `invalid_encoding`.
- **Writes** take at most 4 MiB once decoded, need an existing parent folder
  and replace the file through a temporary file in the same folder and a
  rename.
- **Snapshots.** `files.snapshot` states: `missing`, `changing` (size or mtime
  changed, or stable for less than 3 s), `waitingForMarker` (`<file>.ready`
  missing or older than the file), `invalid` (with `message`; the same file
  version is not re-validated) and `ready` (with `snapshot`). Staging copies
  the file, verifies a `.vpk`'s header, tree and every resource CRC (other
  files are only checked for size and stability), hashes the copy, and
  re-checks the source stamp and hash before keeping the copy under its
  SHA-256. `Snapshot` is `{hash, size, resources?, stagedAt}`; `resources` is
  the VPK resource count. Files are limited to 512 MiB; the host keeps at most
  12 snapshots and 3 GiB per plugin, evicting the oldest that is neither
  installed nor mid-install.
- **Installs.** `mods.install` re-validates and re-hashes the staged VPK,
  applies the running-game guard, records a pending marker, then installs
  through `ModManager::update_mod_from_prepared` as local mod
  `local-ext-<sha256(pluginId, profile)>` in the picked profile, and keeps a
  copy in the mods store. An interrupted install is reconciled from the
  profile's VPK manifest on the next `mods.installed` or install.
  `mods.list` reads each profile's VPK manifest: the picked profile, or the
  default profile (`"default"`) and every `profile_*` folder with `all`.
  `name` is present for local mods.
- **Network.** `url` must be `https://` followed by exactly a granted host
  (no credentials, port or IP), at most 2048 characters without spaces,
  control characters or backslashes. `method` is `GET`, `POST`, `PUT`,
  `PATCH` or `DELETE`. `headers` is an object of at most 32 entries; `Cookie`,
  `Cookie2`, `Host`, `Content-Length`, proxy and hop-by-hop headers are
  refused. `body` is decoded per `bodyEncoding` (default `utf8`) and limited to
  1 MiB. The desktop adapter connects only to public addresses (private,
  loopback, link-local, CGNAT and similar ranges are `destination_refused`),
  ignores proxies, follows no redirects, and stops after 15 s
  (`network_error`) or 4 MiB (`response_too_large`). Response header names are
  lowercase, repeated headers are joined with `, ` and `set-cookie` is
  removed; the body is `utf8` when it is UTF-8 and `base64` otherwise.
- **Notifications.** `title` is 1-60 printable characters, `body` at most 200.
  Each plugin may show three a minute; more fail with `rate_limited`. The
  desktop app emits `external-plugins-notification` with an
  `ExternalPluginNotificationEvent`, `{ pluginId, title, body }`, and shows it
  as a toast attributed to the plugin.
- Storage keys match `[A-Za-z0-9._:-]{1,64}`; at most 256 keys and 1 MiB.
- Other codes: `invalid_request`, `invalid_params`, `unknown_method`,
  `not_found`, `invalid_encoding`, `invalid_snapshot`, `quota_exceeded`,
  `game_running`, `rate_limited`, `network_error`, `destination_refused`,
  `host_error`, `request_too_large`, `response_too_large`.

## Worker processes

The worker is the app executable itself started as
`<exe> --dmm-plugin-worker` (`main.rs` dispatches before any app setup), so dev builds and every bundle ship it without a sidecar. The
supervisor starts one worker per plugin with a cleared environment (only
`SystemRoot` on Windows), no console window, and stdio pipes as the only
channel. It writes `\0DMM-PLUGIN-WORKER/1\n`, then length-prefixed frames: the
backend bytes first (hash-checked against the install), then JSON messages.

- Wasmtime with Cranelift only: no WASI, no component model, no threads or
  memory64. 2,000,000,000 fuel and 64 MiB of memory per call, 512 KiB of wasm
  stack, 1 MiB results, 16 MiB frames.
- 20 s of guest wall time per call (hostcall time excluded), 10 s to start,
  60 s to compile. A timeout, exit, or protocol violation kills the worker and
  the next call starts a fresh one. Three failures within 10 minutes quarantine
  the plugin until the user re-enables it. Traps and fuel exhaustion fail only
  that call.
- `tick` runs every 2 s for each enabled plugin with a backend, skipped while
  that plugin's previous call is still running. Tick failures show up as the
  summary's `lastError`.
- Workers exit when the app closes their stdin, including when the app dies.

The worker process gives crash containment, not an OS sandbox: the native
worker code is ours, and Wasmtime's isolation is the boundary for guest code.

## Plugin views

The app shows a plugin's interface inside its own window, on the `/ext/<id>`
page, as `<iframe sandbox="allow-scripts">` loading
`dmm-plugin://localhost/frame/<id>/` (`http://dmm-plugin.localhost/` on
Windows). The empty path serves the manifest's `ui` entry page.

- Without `allow-same-origin` the frame's origin is opaque. WebView2 still
  injects `__TAURI_INTERNALS__` into it, but Tauri rejects its IPC requests
  (`Origin: null`), and its `postMessage` IPC fallback never reaches the
  backend. It cannot read the app document, navigate the app, or open popups.
- Assets come only from that plugin's `ui` directory, for enabled plugins, with
  `default-src 'none'; script-src <plugin origin>; connect-src 'none'` and the
  rest of the policy in `frames.rs`, plus `nosniff` and `no-store`.
  `frame-ancestors` admits only the app's own origins.
- The frame element gets the same `color-scheme` the page sends the plugin, so
  the app's backdrop shows through the frame.

## Platform support

- **Wry on Windows (WebView2)** is the only verified target. The isolation
  above was checked in the running app with a probe page served like a plugin.
- **Wry on Linux and macOS** fail closed for installation, activation and
  frame calls until the same checks pass on WebKit. Revoke, remove and
  disabling remain available, and no background ticks run.
- **CEF builds** fail closed the same way, and the `dmm-plugin` protocol is not
  registered.

## Residual risks

- Frame isolation rests on the browser's sandbox and Tauri's origin check, and
  must be re-verified when Tauri, Wry or WebView2 change how they inject or
  route IPC.
- A plugin frame shares the app's renderer process; a hung frame is not
  detected yet.
- The worker runs native host code with the user's OS rights; a Wasmtime escape
  would have them too. No OS-level sandbox is applied.
- File paths are checked component by component before each operation, not
  opened through handles, so another process that swaps a folder for a
  junction between the check and the open could redirect one operation. The
  plugin itself cannot create links.
- Plugin fetches ignore the app's proxy setting, so they fail on networks that
  only allow traffic through a proxy.
- Permissions authorize real access: a plugin granted both `files` (or
  `mods`) and `network` can send what it reads to its approved hosts.

## Tests

`cargo test --manifest-path packages/plugin-runtime/Cargo.toml` covers manifests
and every permission scope (including unknown scope fields), archive attacks,
ABI shape, fuel and memory limits, the retry-without-repeat rule, path
resolution (traversal, junctions, the extension filter), chunked reads and
atomic writes, fetch policy, the notification rate limit, snapshots and quota,
installs and reconciliation, grant validation, session revocation on
disable/revoke/update/remove, pending updates (staging, replacing, applying,
discarding, carrying approvals over and clearing resources), the schema 1
registry migration, catalog hash checks, the activity log and blocked hook,
clearing data, crash containment and quarantine, and deployment recovery.
Desktop adapter tests cover actual profile manifests, profile listing, source
retention and the address check of the network transport. Worker tests start
real worker processes by re-running the test binary. To run a real package:

```sh
DMM_EXAMPLE_PLUGIN_ZIP=<path to zip> cargo test --manifest-path packages/plugin-runtime/Cargo.toml --lib -- --ignored tests::runs_an_external_package
```
