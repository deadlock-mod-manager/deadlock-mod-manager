# Desktop E2E harness

This harness launches the compiled Tauri application in a disposable, owned test world. Every filesystem root exposed to DMM is redirected beneath `.e2e/worlds`, production builds reject the E2E configuration variable, and E2E builds refuse to start without a validated configuration.

The default and required provider is WDIO's embedded server. The external `tauri-driver` provider remains available for transport comparison when the host supports it. This follows [Tauri's current recommendation](https://v2.tauri.app/develop/tests/webdriver/): use `@wdio/tauri-service`, whose embedded provider works without a separate platform driver.

```powershell
pnpm --filter @deadlock-mods/desktop e2e:build
pnpm --filter @deadlock-mods/desktop e2e:doctor
pnpm --filter @deadlock-mods/desktop e2e:test
pnpm --filter @deadlock-mods/desktop e2e:qualify -- --provider embedded
pnpm --filter @deadlock-mods/desktop e2e:qualify -- --provider external
```

The local-mod lifecycle uses a .NET 10 Windows helper with locked FlaUI dependencies to operate the real file picker:

```powershell
pnpm --filter @deadlock-mods/desktop e2e:build:picker
pnpm --filter @deadlock-mods/desktop e2e:doctor -- --case local-mod-lifecycle
pnpm --filter @deadlock-mods/desktop e2e:test -- --case local-mod-lifecycle --keep
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

## Qualification status

The profile pointer and keyboard scenarios each passed three consecutive retry-free Windows/Wry worlds, with two application processes per world. These six runs took 32.6–36.6 seconds and had no unmatched fixture requests.

The local-mod lifecycle passed 10 consecutive retry-free Windows/Wry runs in 24.5–27.2 seconds per world, with two application processes per run. A final verification after adding bounded inventory retries for transient Windows file locks passed both the lifecycle and the intentional-timeout cleanup probe. The inventory still fails if a file remains locked; it never skips a locked file.

The embedded provider passed 10 consecutive fresh-process runs on Windows/Wry with retries disabled, followed by an intentional timeout that was surfaced and torn down correctly. Fresh runs took 10.6–14.7 seconds (about 11.6 seconds on average), including world creation, application and driver startup, UI and Rust assertions, artifact capture, shutdown, and cleanup across every managed root.

The external provider currently cannot be required on Windows hosts with WebView2 Runtime 150 or newer when the application runs elevated. WebView2 ignores the remote-debugging switch used by `tauri-driver`, so session creation times out even with a matching EdgeDriver. This is tracked upstream in [webdriverio/desktop-mobile#542](https://github.com/webdriverio/desktop-mobile/issues/542) with the Tauri fix in `wry#1782`. Keep embedded as the required provider until that upstream fix reaches DMM's Wry version.

`@wdio/tauri-service` 1.3.0 also emits a non-fatal `sessionId is required` warning while clearing its mock store after an embedded session has already closed. It does not change the WDIO exit status or leave the application running. Treat it as service noise and remove this note when the package fixes its after-session cleanup.

Native Windows dialogs are outside the webview DOM and cannot be driven by WebDriver. The lifecycle scenario uses the narrowly scoped FlaUI helper for picker selection while keeping the app's real dialog plugin and Rust continuation in the flow.

## Roadmap

| Milestone | Status | Deliverable | Exit criterion |
| --- | --- | --- | --- |
| M1: safe harness foundation | Complete in PR #707 (replaces #706) | Compile-gated runtime configuration, owned worlds, root routing, fixture network, filesystem oracle, synthetic VPK builder, supervisor, doctor, and embedded-driver qualification | Ten retry-free fresh UI/IPC runs pass; intentional timeout cleanup succeeds; production cannot activate E2E mode |
| M2: complete local-mod lifecycle | Implemented and validated on Windows/Wry | Drive a synthetic VPK through a narrowly scoped FlaUI native-picker helper, the real Rust parser, import/install, enable/disable, delete, and application restart | UI state, VPK manifest, persisted store, and independent file hashes agree after every step; the final world matches its expected restored state |
| M3: profiles and ordering | Implemented and validated on Windows/Wry | Two-profile switching plus native pointer and keyboard reorder flows | Inactive profiles and protected files remain unchanged; order and profile state survive restart without mocked core IPC |
| M4: downloads and network failures | Planned; transport foundation exists | Exercise actual Rust downloads against fixture endpoints, including variants, Range resume, pause, cancel, malformed responses, and authentication failures | Every request matches the strict journal; unexpected traffic fails; partial files and state recover correctly |
| M5: recovery and hostile filesystem cases | Planned | Backup replace/merge, interrupted mutations, shard boundaries, collisions, Windows locks, and crash barriers | Restart recovers retained worlds and the independent oracle proves restoration without normalizing unexpected writes |
| M6: CI and release coverage | Planned | Serial Windows PR lane, broader nightly matrix, packaged-app/native smoke, and ordinary-release exclusion checks | Clean runners reproduce required flows and ordinary builds contain no harness server, capability, control channel, or fixture policy |

Keep scenarios independent and small even when they share recipes. The final routine-development gate is a composed import/download → enable → profile switch → reorder → backup → modify → restore → restart journey, supported by focused tests for each operation and failure boundary.
