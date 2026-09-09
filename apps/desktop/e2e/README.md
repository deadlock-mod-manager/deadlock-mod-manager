# Desktop E2E harness

This harness launches the compiled Tauri application in a disposable, owned test world. Every filesystem root exposed to DMM is redirected beneath `.e2e/worlds`, production builds reject the E2E configuration variable, and E2E builds refuse to start without a validated configuration.

The default and required provider is WDIO's embedded server. The external `tauri-driver` provider remains available for transport comparison when the host supports it. This follows [Tauri's current recommendation](https://v2.tauri.app/develop/tests/webdriver/): use `@wdio/tauri-service`, whose embedded provider works without a separate platform driver.

```powershell
pnpm --filter @deadlock-mods/desktop e2e:build
pnpm --filter @deadlock-mods/desktop e2e:doctor
pnpm --filter @deadlock-mods/desktop e2e:test
pnpm --filter @deadlock-mods/desktop exec tsx e2e/cli.ts list
pnpm --filter @deadlock-mods/desktop e2e:test -- --suite gamebanana --keep
pnpm --filter @deadlock-mods/desktop e2e:qualify -- --provider embedded
pnpm --filter @deadlock-mods/desktop e2e:qualify -- --provider external
```

## Writing scenarios

`support/scenarios.ts` is the scenario registry. Each definition owns its spec, phases, fixture setup, HTTP routes, network assertions, native-input requirement, and expected exit mode. `--suite` selects `all`, a family such as `gamebanana` or `downloads`, or a coverage category (`ui` / `ipc-recovery`). Cases run serially with a separate world per case; restart phases share that case's world. Failures retain their world and the runner continues to report the remaining cases.

Native input requires explicit `--allow-native-input`. This applies to the local-picker and profile-ordering scenarios, including `--suite all`. Those cases control the Windows desktop and require exclusive mouse/keyboard use; never enable the option while someone is working on that desktop. Other cases still launch application windows but do not use the physical input helper. The native executable also checks the supervisor's opt-in environment variable.

Use these modules when adding a flow:

| Module | Responsibility |
| --- | --- |
| `application.ts`, `application-exit.ts` | Verify the real application identity, dismiss release notes, record phase startup, and close normally after the scenario finishes |
| `ui.ts` | Navigate, open ordering through keyboard input, activate profiles, select downloads/install files, and locate installed-file sections |
| `native-input.ts`, `native-picker.ts` | Owned Windows input for drag/keyboard sensors and native file selection; the picker accepts any fixture path beneath the world's fixtures directory |
| `observations.ts` | Decode persisted state, hash bytes, compare exact inventory changes, and poll a read-only observation with the last value in timeout errors |
| `mod-fixtures.ts`, `profile-fixtures.ts` | Build mod records and arbitrary installed profile layouts; the Alpha/Beta recipe is a convenience wrapper |
| `vpk.ts`, `archive-fixtures.ts`, `fixture-server.ts` | Compose synthetic VPKs, deterministic ZIPs, and strict HTTP responses, including transfer failures |
| `evidence.ts` | Name meaningful steps and capture independent diagnostics even when another capture fails |

A scenario should read like its user workflow, with domain assertions kept in its oracle:

```typescript
const runtime = await startApplication();
await navigate("my-mods");
await step("enable the imported mod", async () => {
  await $('[role="switch"]').click();
  await observeUntil("Installed mod", () => readLifecycleState(runtime.roots.world),
    (state) => state.localMods[0]?.status === "installed");
});
await assertLifecycleDisk(runtime.roots.world, "enabled", modId, "installed");
await closeApplication(runtime.roots.world, runtime.processId);
await assertLifecycleDisk(runtime.roots.world, "closed", modId, "installed");
```

Always verify scenario-specific state and bytes after normal close: a valid store file alone cannot prove that exit-time saving preserved the installed mods. Normal phases require a completion marker and a dead application PID. Interrupted phases verify the started process has exited; transaction crash phases require their explicit crash evidence. Recovery checks observe startup before UI reconciliation and must not invoke a recovery command to make the assertion pass.

Seed only prerequisites for the behavior under test. For example, download retry cases seed a failed transfer, while GameBanana install cases begin with an empty library and obtain mod records through the real catalog. Keep expected payloads and file selections explicit. Use stable semantic selectors or focused `data-*` attributes rather than CSS typography classes; keep native interaction limited to controls that require it.

Run `e2e:check-types` and `e2e:test:world` for harness changes, then the affected native families. `e2e:qualify` checks ten fresh application runs plus WebDriver timeout reporting, retaining the intentional timeout world. Separate process-control tests exercise actual hung-process termination and interruption. The Windows supervisor bounds `taskkill` and its own output wait; if a launcher exits while inherited output handles remain open, it fails with a diagnostic instead of waiting forever or killing a possibly reused PID. It cannot recover arbitrary orphan ownership after the launcher exits.

Step events go to `steps.ndjson`; screenshots and DOM captures include the phase in their filenames. `result.json`, final inventories, filesystem events, and HTTP journals are retained on failures, including launch and oracle failures. Individual capture errors are recorded separately so a dead webview does not prevent disk evidence from being collected.

The local-mod lifecycle uses a .NET 10 Windows helper with locked FlaUI dependencies to operate the real file picker:

```powershell
pnpm --filter @deadlock-mods/desktop e2e:build:picker
pnpm --filter @deadlock-mods/desktop e2e:doctor -- --case local-mod-lifecycle
pnpm --filter @deadlock-mods/desktop e2e:test -- --case local-mod-lifecycle --keep --allow-native-input
```

The first process imports a synthetic VPK, verifies the real Rust parser, then enables, disables, and re-enables the mod. A second process opens the same world, verifies persisted enabled state, and deletes the mod through the UI. Each step checks the store, `.dmm.json`, exact addon file inventory, and SHA-256 payload hashes. Steam files and a protected game sentinel must remain unchanged. The helper only selects the fixed fixture for the PID returned by the E2E backend; it never substitutes a dialog response or core IPC command. `--case` also works with `e2e:qualify`.

Retained worlds contain `wdio-<phase>.log`, `native-picker.log`, per-step `lifecycle-*.json` evidence, and screenshots plus DOM HTML on failure. Without `--keep`, successful worlds and their artifacts are deleted.

Profile ordering has separate pointer and keyboard scenarios, each with two preinstalled profile recipes and a fresh-process restart:

```powershell
pnpm --filter @deadlock-mods/desktop e2e:build:picker
pnpm --filter @deadlock-mods/desktop e2e:doctor -- --case profiles-pointer
pnpm --filter @deadlock-mods/desktop e2e:test -- --case profiles-pointer --keep
pnpm --filter @deadlock-mods/desktop e2e:test -- --case profiles-keyboard --keep
```

Each scenario moves Alpha's first mod to last through the ordering dialog, saves through the real Rust command, switches to Beta, restarts with Beta active, and switches back to Alpha. The oracle checks persisted profile and library state, manifest slots, exact file inventories, distinct VPK payload hashes, protected files, and active game search paths. Beta remains byte-identical to its initial fixture; Alpha remains byte-identical after its reorder while switching and restarting. Artifacts include `profiles-*.json` checkpoints and `native-input.log`.

The pinned embedded driver's Windows pointer implementation dispatches mouse events, which do not activate Radix's pointer menu or dnd-kit's pointer sensor. These scenarios use the existing FlaUI helper for native clicks and dragging, and scan-code keyboard input for Space/Down/Down/Space. WebDriver focuses the keyboard handle and verifies DOM state. No core IPC response or application state is substituted. The helper validates the owned world, executable and PID, converts viewport coordinates with per-monitor DPI awareness, and requires the owned window to have focus before sending input. Run native scenarios serially on an interactive Windows desktop; they bring the test window to the foreground.

Successful worlds are deleted after their artifacts and filesystem inventories are written. Failed worlds are retained and printed by the CLI. `--keep` retains a successful single run for inspection. Cleanup only operates on directories beneath `.e2e/worlds` whose manifest identifies the harness as owner. Each run records live changes in `artifacts/filesystem.ndjson` and writes complete before/after SHA-256 inventories for every managed root. Restoring a test means deleting its disposable world; a test never edits the developer's real installation.

The fixture server records all requests to `artifacts/network.ndjson`, returns a hard failure for any unregistered fixture, and is also installed as the child process HTTP(S) proxy. Absolute-form HTTP proxy requests and HTTPS `CONNECT` tunnels are blocked, recorded, and fail the run. Every application service origin is injected as a loopback fixture URL, and the E2E-only Tauri HTTP capability allows only those validated origins. A passing run therefore has a deterministic response for every observed request and no production-service traffic.

`support/vpk.ts` builds deterministic, structurally valid VPK v2 archives from small path/content recipes. Entries use the standard VPK header, CRC32 values, directory tree, and inline data section. The file-management milestone will feed these archives through DMM's real parser and Rust commands without committing large or copyrighted fixture archives.

The first smoke flow uses WebDriver clicks to open Settings and the About dialog, then invokes the compile-gated `e2e_status` command to prove the UI process is connected to the real Rust backend and isolated world. It also prepares a real Steam launch request through Rust, verifies that the `record` policy writes the redacted intent to `artifacts/game-launches.ndjson`, and proves that game liveness/stop operations cannot inspect or terminate a host game in the default E2E world.

## Download scenarios

M4 uses real Rust HTTP transfers against binary fixture responses. Run any case with `pnpm --filter @deadlock-mods/desktop e2e:test -- --case <case> --keep` after rebuilding the E2E application. These cases do not require the native input helper.

| Case | Behavior checked |
| --- | --- |
| `downloads-pause` | UI pause freezes a valid partial prefix; UI resume completes the payload |
| `downloads-range` | A connection cut after 65,536 bytes triggers an exact Range request and byte-correct completion |
| `downloads-cancel` | Cancel a paused transfer through the existing Rust command, verify partial cleanup, restart, and retry through the UI |
| `downloads-restart` | Restart while paused, verify stale status becomes failed while partial evidence remains, then retry from scratch |
| `downloads-auth` | A 401 response fails visibly; UI retry completes after the fixture permits it |
| `downloads-corrupt` | A same-length corrupt payload fails MD5 validation without publishing a file; UI retry succeeds |
| `downloads-redirect` | Reject a redirect to a production host without making an external request; UI retry succeeds |
| `downloads-variants` | Retry preserves a previously selected variant, including after a 401 and restart; the unselected URL has no registered fixture |

Each world starts with a failed download record and persisted file selection, so Retry exercises the real frontend purge/queue flow without depending on the remote catalog. Variant coverage here is persisted selection and retry, not the initial catalog file chooser. Cancellation uses real IPC because the current UI does not expose a cancel control. Successful transfers are checked again in a new application process. The oracle compares SHA-256 hashes, partial prefixes and metadata, exact cache contents, the empty addon manifest, and protected game/Steam files. `download-*.json` captures disk/state evidence; `network.ndjson` includes Range headers, response status and bytes sent. UI retries deliberately purge stale data; only interrupted transfers within a running process resume with Range.

The E2E-only download policy accepts exact configured fixture origins (including port and scheme) for initial requests and redirects. Ordinary builds retain the HTTPS trusted-host allowlist. The same downloader, checksum checks, staging files, pause gate, and cancellation logic run in both builds.

## GameBanana catalog installation scenarios

The lifecycle cases also exercise installed archive changes, cancelled and failed changes, disable/re-enable, force update, and reinstall. `gamebanana-combined` selects VPKs across two multi-file archives. `gamebanana-switch` adds, replaces, revisits, and removes archives while retaining exact inactive-file hashes. `gamebanana-switch-failure` requires a 503 to leave the existing installation unchanged before retry succeeds. `gamebanana-reselect` deletes and reinstalls a single archive with a different VPK selection: the current UI does not offer an installed per-VPK editor for a single download. `gamebanana-reinstall` restores an enabled selection, while `gamebanana-reinstall-disabled` remains downloaded and inactive. `gamebanana-force-update` checks that the update dialog retains the chosen downloads. Every case restarts the app and verifies its final state.

These cases start with an empty library and use the real catalog UI, GameBanana provider, downloader, archive extraction, and installation commands. Only HTTP responses are mocked. Run each with `pnpm --filter @deadlock-mods/desktop e2e:test -- --case <case> --keep` after `e2e:build`.

| Case | Behavior checked |
| --- | --- |
| `gamebanana-single` | Browse a synthetic GameBanana submission, download its ZIP, and enable its single VPK |
| `gamebanana-multifile` | Choose two of three downloads, install both VPKs, and show their respective source archives; the unselected download has no route |
| `gamebanana-variants` | Download an archive with common, blue, and red VPKs; deselect red and install only common and blue |

Every case checks the mod page's Installed Files list and Active Mod files section, closes the application normally, and repeats the rendering and disk checks in a new process. Installed filenames, archive groups, selected downloads, profile state, manifest entries, and exact VPK bytes must agree. Network assertions require the real provider metadata endpoints and exactly the selected payload requests, with no download repeated on restart. Screenshots, DOM snapshots, and `catalog-*.json` disk evidence are retained with `--keep`.

The variant scenario caught an Installed Files rendering bug: the stored file tree retains unselected options, and the page previously displayed all of them. The display now groups only selected files, including the per-archive file counts.

## Filesystem recovery scenarios

M5 runs with the same `e2e:test -- --case <case> --keep` command after `e2e:build`. Run these serially on Windows/Wry.

| Case | Behavior checked |
| --- | --- |
| `filesystem-backup-replace` | Create and restore through Settings; restore original VPK order, manifest, and overwritten sentinel; remove a file added after backup |
| `filesystem-backup-merge` | Restore the backup's colliding files and manifest while preserving a file added after backup |
| `filesystem-lock` | Hold the third VPK with Windows `FileShare.None`; fail after staging an earlier VPK, prove exact rollback, release the handle, and retry |
| `filesystem-collision` | A protected directory occupies the next destination filename; fail during placement, prove exact rollback, remove only the fixture obstruction, and retry |
| `filesystem-shards` | Rotate 100 distinct installed payloads across the 99-file boundary; verify ownership of identically named slots in different shards and both game search paths |
| `filesystem-crash-placed` | Abrupt exit after the first real placement, leaving two parked VPKs; a fresh process restores the original layout |
| `filesystem-crash-committed` | Abrupt exit after the manifest is saved but before staging cleanup; a fresh process retains the committed layout |

Backups use UI controls. Filesystem mutations use the existing `reorder_mods_by_remote_id` IPC command so each fault lands at a precise boundary; M3 covers the native ordering gestures. Restart uses the production snapshot/recovery path, then switches Beta → Alpha through the profile selector to exercise frontend reconciliation. The oracle checks persisted order, exact file inventories, distinct payload hashes, manifest slots and shards, protected Beta/Steam files, and game search paths. Backup sources must match the initial recipe and remain unchanged after restore and restart. Opening Settings normally creates an empty `cfg/autoexec.cfg`; this exact write is included in the backup cases' expected inventory.

The compile-gated `e2e_faults` module only accepts a PID-bound arm file for the matching crash case in its owned world. It writes and syncs a checkpoint marker, then exits without running destructors. The supervisor verifies the marker's PID/run/profile, the exact stage/place/manifest journal, and the payloads still on disk. There is no crash hook in an ordinary build, no mocked core IPC, and no harness rewrite of a failed transaction's files or manifest.

Ordinary M5 restarts close the main window through Tauri, wait for the process to exit, and verify the persisted profile store. WDIO's Windows teardown sends a terminating signal that can interrupt a store write during background hero detection; it is unsuitable for an ordinary restart. After proving process exit, the worker retires its dead WebDriver session so teardown does not send DELETE to the closed embedded server. Every phase still requires a zero WDIO exit status. Normal-exit evidence is checked again by the supervisor; timeouts, signals, missing markers, or failed assertions fail the run. Switching profiles creates `gameinfo.gi.bak`, which must match the initial gameinfo bytes exactly.

Artifacts include `filesystem-baseline.json`, per-step `filesystem-*.json`, `filesystem-rollback.json`, `phase-completed-*.json`, backup evidence, and crash marker/journal/disk evidence. Lock handles are released in `finally`; the helper also has a bounded lifetime. Worlds with failures remain available for diagnosis. Synthetic profile archives contain no hero assets and are seeded as already indexed, keeping unrelated background discovery out of these scenarios.

These cases cover reorder interruption at placement and manifest commit, rather than every possible write boundary. Interrupting a backup restore during its copy phase and simulating power-loss durability remain additional coverage opportunities.

## Qualification status

All seven M5 cases passed repeated retry-free Windows/Wry worlds, with a fresh process for recovery and independent disk/store evidence. The final backup replace and merge cases each passed two consecutive worlds; the 100-mod shard case passed three consecutive worlds after fixing normal shutdown and preindexing the synthetic fixtures. Successful M5 worlds took approximately 20–26 seconds and had no unmatched fixture requests. These cases exposed two production defects that are fixed here: completed rollbacks left their transaction journal behind, and reorder bypassed the journal-aware manifest commit method. The Rust mod-manager suite passes all 122 tests; the harness suite passes 19 tests, including checks that reject wrong payloads, false shard ownership, unexpected files, and foreign/live crash markers.

All eight M4 cases passed two consecutive retry-free Windows/Wry worlds each, including a new application process in every world. The final pass took approximately 20–30 seconds per world with no unmatched requests. Harness unit tests cover binary Range responses, truncated streams, wrong-variant bytes, and leftover partial files; Rust tests cover fixture-origin restrictions and the ordinary-build allowlist.

The profile pointer and keyboard scenarios each passed three consecutive retry-free Windows/Wry worlds, with two application processes per world. These six runs took 32.6–36.6 seconds and had no unmatched fixture requests.

The local-mod lifecycle passed 10 consecutive retry-free Windows/Wry runs in 24.5–27.2 seconds per world, with two application processes per run. A final verification after adding bounded inventory retries for transient Windows file locks passed both the lifecycle and the intentional-timeout cleanup probe. The inventory still fails if a file remains locked; it never skips a locked file.

The embedded provider passed 10 consecutive fresh-process runs on Windows/Wry with retries disabled, followed by an intentional timeout that was surfaced and torn down correctly. Fresh runs took 10.6–14.7 seconds (about 11.6 seconds on average), including world creation, application and driver startup, UI and Rust assertions, artifact capture, shutdown, and cleanup across every managed root.

The external provider currently cannot be required on Windows hosts with WebView2 Runtime 150 or newer when the application runs elevated. WebView2 ignores the remote-debugging switch used by `tauri-driver`, so session creation times out even with a matching EdgeDriver. This is tracked upstream in [webdriverio/desktop-mobile#542](https://github.com/webdriverio/desktop-mobile/issues/542) with the Tauri fix in `wry#1782`. Keep embedded as the required provider until that upstream fix reaches DMM's Wry version.

`@wdio/tauri-service` 1.3.0 also emits a non-fatal `sessionId is required` warning while clearing its mock store after an embedded session has already closed. It does not change the WDIO exit status or leave the application running. Treat it as service noise and remove this note when the package fixes its after-session cleanup.

Native Windows dialogs are outside the webview DOM and cannot be driven by WebDriver. The lifecycle scenario uses the narrowly scoped FlaUI helper for picker selection while keeping the app's real dialog plugin and Rust continuation in the flow.

## Roadmap

M6 runs the existing E2E harness in `.github/workflows/desktop-e2e.yml`. It runs nightly at 03:23 UTC, on manual dispatch, and on PRs carrying the `e2e-full` label. Regular PRs do not build or run the pipeline automatically. This PR carries the label for qualification before merge.

The pipeline builds the debug harness and native helper once, then shares their binaries with six independent Windows jobs covering all 29 scenarios. Each family runs serially with retries disabled. Native input is explicitly enabled only on disposable GitHub-hosted desktops. The CLI's `--report <path>` writes an incremental JSON summary; CI retains reports and diagnostic artifacts for 14 days without uploading control tokens. Missing prerequisites, unmatched requests, timeouts, and failed scenarios remain failures. No release builds, installer smoke tests, signing, or publication are part of this pipeline.

Use the six scenario jobs and their per-case reports to verify clean-runner qualification. The local pointer rerun remains skipped at the user's request; its normal scenario is included on the dedicated CI runner.

| Milestone | Status | Deliverable | Exit criterion |
| --- | --- | --- | --- |
| M1: safe harness foundation | Complete in PR #707 (replaces #706) | Compile-gated runtime configuration, owned worlds, root routing, fixture network, filesystem oracle, synthetic VPK builder, supervisor, doctor, and embedded-driver qualification | Ten retry-free fresh UI/IPC runs pass; intentional timeout cleanup succeeds; production cannot activate E2E mode |
| M2: complete local-mod lifecycle | Implemented and validated on Windows/Wry | Drive a synthetic VPK through a narrowly scoped FlaUI native-picker helper, the real Rust parser, import/install, enable/disable, delete, and application restart | UI state, VPK manifest, persisted store, and independent file hashes agree after every step; the final world matches its expected restored state |
| M3: profiles and ordering | Implemented and validated on Windows/Wry | Two-profile switching plus native pointer and keyboard reorder flows | Inactive profiles and protected files remain unchanged; order and profile state survive restart without mocked core IPC |
| M4: downloads and network failures | Implemented and validated on Windows/Wry | GameBanana catalog downloads and installation, multi-file and VPK variant selection, installed-file rendering, selected-variant retries, Range resume, pause, cancel, corrupt payloads, authentication failures, redirects, and interrupted-process recovery | Every request matches the strict journal; unexpected traffic fails; installed files and selections survive restart; partial files and state recover correctly |
| M5: recovery and hostile filesystem cases | Implemented and validated on Windows/Wry | Backup replace/merge, interrupted mutations, shard boundaries, collisions, Windows locks, and crash barriers | Restart recovers retained worlds and the independent oracle proves restoration without normalizing unexpected writes |
| M6: nightly E2E pipeline | Implemented; qualification tracked in CI | Nightly/manual Windows E2E matrix and opt-in execution on this PR | All 29 registered scenarios pass on clean runners with retained failure evidence |

Keep scenarios independent and small even when they share recipes. The final routine-development gate is a composed import/download → enable → profile switch → reorder → backup → modify → restore → restart journey, supported by focused tests for each operation and failure boundary.
