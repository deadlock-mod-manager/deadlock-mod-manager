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

## Linux

The harness also runs on Linux/WebKitGTK through the same embedded provider. The E2E build redirects `TMPDIR` and the XDG data, config, cache and state directories into the world's `webview-data` root, so WebKitGTK, GTK and Mesa stay inside the disposable world. Scenarios declare their supported platforms; the native-input cases (`local-mod-lifecycle`, `profiles-pointer`, `profiles-keyboard`) and `filesystem-lock` (Windows `FileShare.None`) are Windows-only, and suites skip them elsewhere.

Install the Tauri build prerequisites (WebKitGTK 4.1, librsvg, appindicator, protobuf) plus Xvfb, then run headless:

```bash
pnpm --filter @deadlock-mods/desktop e2e:build
xvfb-run -a pnpm --filter @deadlock-mods/desktop e2e:doctor
xvfb-run -a -s "-screen 0 1920x1080x24" dbus-run-session -- pnpm --filter @deadlock-mods/desktop e2e:test -- --suite smoke --keep
```

On Arch, set `SHARP_IGNORE_GLOBAL_LIBVIPS=1` before `pnpm install` if a system libvips is present.

## Writing scenarios

The `updater` family checks the real app's update controls against a loopback
nightly manifest. `app-update-download` requires the backend-selected URL to
reach the frontend, downloads exactly the advertised payload, and verifies an
unsigned fixture is rejected before installation. `app-update-check-failure`
requires a manifest 404 to show a check error instead of claiming the app is
current. Both run in the Windows and Linux E2E matrices with no host update.

`onboarding-skip-analysis` starts setup with a synthetic existing VPK. It verifies Skip for Now advances before analysis, after closing analysis results, and after navigating back; Next still advances and the VPK bytes remain intact. Saved telemetry consent starts enabled and must persist as disabled after opting out. `onboarding-telemetry-default` repeats the flow with an unseen prompt and stored consent disabled, verifying that first-run consent initially defaults to enabled.

`analyze-known-files` starts with two hand-installed VPKs the identification service doesn't know, both named `pak01_dir.vpk`: one in `addons` and one in the `addons2` overflow shard. Analyze offers to add both; once one is added from the results list, its row shows Added to Library while the other stays addable, and a new analysis offers neither. Each file must have exactly one library mod and one manifest owner in its own shard, both right away and after a restart, Analyze must still recognize both after the restart, and both files keep their bytes.

`gamebanana-detected-files` starts with a manually installed VPK and an empty DMM library. It identifies the mod through the analysis API, checks that Manage Files marks its matched archive enabled, adds an optional archive, and removes that optional archive after restart. The original VPK bytes and manifest ownership must survive, and only the optional archive may be downloaded.

`gamebanana-file-toggle` installs two of the three VPKs in a single download, then changes the selection from the Installed Files list. Apply must stay disabled with nothing checked or after Reset. Enabling the never-installed VPK extracts it from one new download and parks the one it replaces; switching back reuses the parked file without downloading. Every step checks the manifest, exact addon bytes and parked files, before and after a restart.

`gamebanana-delete-parked` installs `common.vpk` and `blue.vpk` from one archive, unticks blue in the Installed Files list so it is parked as `900001_blue.vpk`, and deletes the mod. The parked copy is not in the mod's manifest entry, yet the addons folder must end with no VPKs. `gamebanana-delete-parked-disabled` disables the mod before deleting it. A fresh process must still find nothing, and downloading the mod again must install exactly common and blue with no parked file picked back up.

`gamebanana-variant-names` downloads three variant archives that each ship `pak01_dir.vpk`, and enabling installs all three under their own names (`pak01-red-skin_dir.vpk`, `pak01-blue_dir.vpk`, `pak01-green_dir.vpk`) with distinct bytes. Unticking blue in the Installed Files list parks it; Update All then replaces red and green with v2, leaves blue unselected and drops its stale parked copy, so ticking blue again fetches its v2 archive. A fresh process must see the same names, bytes and parked files.

`gamebanana-renamed-packs` installs two mods whose v2 archives are re-uploaded under a new GameBanana `_xxxxx` suffix. One has two downloads, `pack-a.zip` and `pack-b_1a2b3.zip`, with one VPK unticked after install; its `pack-a.zip` v2 transfer fails once. The other installs only `blue.vpk`, which its re-upload drops. Update All must ask for the second mod's VPKs with nothing pre-ticked, and the pick must re-run both mods: the renamed pack stays in the update, keeps its pick and leaves out the VPK it gained, and the picked pack installs only `green.vpk`. The picked pack downloads twice.

`gamebanana-update-routing` installs a multipak mod with Default download routing, switches Settings → Network to Automatic, and updates it through Update All. A fresh process then downloads a second mod with Automatic routing. Only Automatic routing fetches GameBanana's fileserver directory, once per process, so the network assertion requires that fetch before the update's transfer and before the second download, and none before the first install.

`gamebanana-update-broken-profile` adds an inactive Beta profile whose manifest has two mods claiming the same `pak01_dir.vpk`, a layout found in user installs. Update All on the two multipak mods in the default profile must still back up and update, the backup must carry Beta byte for byte, and restoring that backup from Settings must bring back the v1 addons. Beta stays byte-identical throughout and after exit.

`deep-link-other-file` installs `base.zip` from a GameBanana 1-click link, then sends a link for the same mod's `effects.zip`. The second link must add `effects.vpk` beside `base.vpk` in the author's order, and a repeat link for `base.zip` must only report it as already installed. Each archive downloads exactly once. E2E builds skip the OS deep-link plugin, so the case emits `deep-link-received` through Tauri's event IPC, the event the Rust handler emits after validating a link.

`network-diagnostics` runs Settings → Tools → Diagnose connection with every service on the fixture origin, including Cloudflare's trace probes through the `connectivity` endpoint, so every check except TCP auto-tuning must pass. On Windows the world injects a `Disabled` TCP auto-tuning level instead of reading the host's, and the row must warn and show the command to turn it back on; on Linux that row must not exist. `network-diagnostics-internet-down` cuts every trace probe off before it gets a response, and the internet row must name the host it couldn't reach.

`catalog-refresh` checks that manual refresh finds a new sound during the automatic sync cooldown, disables duplicate clicks while syncing, preserves saved entries, and fetches no unchanged details on a repeated refresh. Its network assertions require only the latest index pages and one new sound hydration.

`library-author-navigation` downloads a catalog mod into the library, opens its author from grid and list layouts, and verifies Back returns to Mods Library. It also checks the nested author → mod → author path, the author link in library mod details, and that Store author navigation still returns to Mods Store.

`library-author-legacy` runs the library navigation paths starting with an installed remote mod whose persisted author ID is null and whose metadata is absent from the Store cache. Clicking its author resolves the mod once before opening the profile; later visits reuse cached data. A custom local mod without a known author remains plain text.

`shards-library` starts a profile with 101 mods, so the last two overflow into `citadel/addons2`. Through the library it empties and refills the overflow shard, disables a base-shard mod so the next enable pulls an overflow mod into its hole, re-enables it in its old place so the overflow mod crosses back, checks the ordering dialog against the engine order, deletes an overflow mod, and finds and deletes a stray `addons2` file that shares its name with a managed base-shard VPK. Shard status must report stale `gameinfo.gi` search paths until Resync or Launch modded rewrites them. Every step checks the engine load order (shard, then pak number), per-shard limits, exact bytes in every shard and the persisted library; a fresh process must see the same layout.

`profiles-file-order` starts with a two-file mod in `pak01`/`pak02` and a one-file mod in `pak03`. In the ordering dialog it moves the first file below the second with the keyboard and the one-file mod to the top, then saves. Every VPK must hold the bytes of the file the manifest names, the engine must load the solo mod, then the second file, then the first, and the library's VPKs and file tree must match. Disabling and re-enabling the mod, a fresh process and the reopened dialog must all keep that order.

`shards-conflicts` gives the first mod in `addons` and the first in `addons2` the same model. Both are `pak01_dir.vpk`, so only the shard decides that the base mod wins. Load first on the overflow mod must move it into shard 1, push the 99th mod across the boundary, and survive a restart in both the conflicts list and the ordering dialog.

The `stats` family pins a Stats account and serves deadlock-api from fixtures with exact values (`support/stats-dashboard-fixtures.ts`), so the cases assert what widgets compute, not only that they render:

- `stats-default-layout`: the five built-in tabs and overview sections appear in their original order with values computed from the history; Cancel without changes asks nothing, Cancel after a removal asks and restores it; nothing is persisted.
- `stats-arrange-widgets`: adds a preset as a titled half-width table (checked in the preview and the grid), adds a second preset, reorders, widens, duplicates and removes, edits the title. After a restart order, widths, title, chart type and table values are unchanged; Reset to default stores no layout.
- `stats-custom-tabs`: a tab from the Meta template with every widget loaded, an empty tab renamed and given an icon, a section moved there from Overview, and a tab deleted after confirmation. Tabs and moved sections survive a restart.
- `stats-custom-queries`: own match queries whose winrate, match count and KDA per hero and per result are checked against the fixture history; an API query whose `{since_30d}` placeholder must reach the server resolved while the template stays saved; a path off deadlock-api is refused before any request.
- `stats-broken-endpoints`: a saved layout meets a 404 that recovers on Try again (exactly one failing and one retried request), a renamed response field, a field the view no longer finds, and a preset this version no longer has. Each widget states its reason and endpoint, the tab is marked, a healthy widget beside them is unaffected, the editor re-fits the vanished field, and removing the rest clears the tab marker.

`support/scenarios.ts` is the scenario registry. Each definition owns its spec, phases, fixture setup, HTTP routes, network assertions, native-input requirement, and expected exit mode. `--suite` selects `all`, a family such as `gamebanana` or `downloads`, or a coverage category (`ui` / `ipc-recovery`). Cases run serially with a separate world per case; restart phases share that case's world. Failures retain their world and the runner continues to report the remaining cases.

Native input requires explicit `--allow-native-input`. This applies to the local-picker, profile-ordering, and library-group dragging scenarios, including `--suite all`. Those cases control the desktop and require exclusive mouse/keyboard use; never enable the option while someone is working on that desktop. Other cases still launch application windows but do not use the physical input helper. The native executable also checks the supervisor's opt-in environment variable.

Use these modules when adding a flow:

| Module | Responsibility |
| --- | --- |
| `application.ts`, `application-exit.ts` | Verify the real application identity, dismiss release notes, record phase startup, and close normally after the scenario finishes |
| `ui.ts` | Navigate, open ordering through keyboard input, activate profiles, select downloads/install files, and locate installed-file sections |
| `native-input.ts`, `native-picker.ts` | Owned Windows/X11 input for drag sensors and Windows native file selection; the picker accepts any fixture path beneath the world's fixtures directory |
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

The `local-large` family imports a 1 GiB VPK and a ZIP containing it through each Add Local Mod source. `local-mod-large-picker-{vpk,zip}` choose the fixture in the real file picker and need `--allow-native-input`. `local-mod-large-drop-{vpk,zip}` dispatch a DOM drop carrying a `File` that the page reads from app data; the app stages it in `dropped-mods` and must remove it after the import. `local-mod-large-drop-path-{vpk,zip}` drop only a `file://` path, which takes the same route as a picked file without native input. Each case requires the mod to reach the library with its VPK stored at full size, and appends timings and heap usage to `artifacts/local-mod-large.log`. A picked file used to come back to the renderer as a JSON number array, which crashed the webview from about 100 MB. The family runs as its own Windows CI job; each world holds about 2 GiB of fixtures until it is deleted.

Run one E2E invocation per machine at a time, even from separate checkouts. A concurrent run can attach to the other run's application and fail its run ID check.

Retained worlds contain `wdio-<phase>.log`, `native-picker.log`, per-step `lifecycle-*.json` evidence, and screenshots plus DOM HTML on failure. Without `--keep`, successful worlds and their artifacts are deleted.

Profile ordering has separate pointer and keyboard scenarios, each with two preinstalled profile recipes and a fresh-process restart:

```powershell
pnpm --filter @deadlock-mods/desktop e2e:build:picker
pnpm --filter @deadlock-mods/desktop e2e:doctor -- --case profiles-pointer
pnpm --filter @deadlock-mods/desktop e2e:test -- --case profiles-pointer --keep --allow-native-input
pnpm --filter @deadlock-mods/desktop e2e:test -- --case profiles-keyboard --keep --allow-native-input
```

Each scenario moves Alpha's first mod to last through the ordering dialog, saves through the real Rust command, switches to Beta, restarts with Beta active, and switches back to Alpha. The oracle checks persisted profile and library state, manifest slots, exact file inventories, distinct VPK payload hashes, protected files, and active game search paths. Beta remains byte-identical to its initial fixture; Alpha remains byte-identical after its reorder while switching and restarting. Artifacts include `profiles-*.json` checkpoints and `native-input.log`.

The pinned embedded driver's Windows pointer implementation dispatches mouse events, which do not activate Radix's pointer menu or dnd-kit's pointer sensor. These scenarios use the existing FlaUI helper for native clicks and dragging, and scan-code keyboard input for Space/Down/Down/Space. WebDriver focuses the keyboard handle and verifies DOM state. No core IPC response or application state is substituted. The helper validates the owned world, executable and PID, converts viewport coordinates with per-monitor DPI awareness, and requires the owned window to have focus before sending input. Run native scenarios serially on an interactive Windows desktop; they bring the test window to the foreground.

Successful worlds are deleted after their artifacts and filesystem inventories are written. Failed worlds are retained and printed by the CLI. `--keep` retains a successful single run for inspection. Cleanup only operates on directories beneath `.e2e/worlds` whose manifest identifies the harness as owner. Each run records live changes in `artifacts/filesystem.ndjson` and writes complete before/after SHA-256 inventories for every managed root. Restoring a test means deleting its disposable world; a test never edits the developer's real installation.

The fixture server records all requests to `artifacts/network.ndjson`, returns a hard failure for any unregistered fixture, and is also installed as the child process HTTP(S) proxy. Absolute-form HTTP proxy requests and HTTPS `CONNECT` tunnels are blocked, recorded, and fail the run. Every application service origin is injected as a loopback fixture URL, and the E2E-only Tauri HTTP capability allows only those validated origins. A passing run therefore has a deterministic response for every observed request and no production-service traffic.

`support/vpk.ts` builds deterministic, structurally valid VPK v2 archives from small path/content recipes. Entries use the standard VPK header, CRC32 values, directory tree, and inline data section. The file-management milestone will feed these archives through DMM's real parser and Rust commands without committing large or copyrighted fixture archives.

The first smoke flow uses WebDriver clicks to open Settings and the About dialog, then invokes the compile-gated `e2e_status` command to prove the UI process is connected to the real Rust backend and isolated world. It also prepares a real Steam launch request through Rust, verifies that the `record` policy writes the redacted intent to `artifacts/game-launches.ndjson`, and proves that game liveness/stop operations cannot inspect or terminate a host game in the default E2E world.

## Settings, content, and launch scenarios

Run `pnpm --filter @deadlock-mods/desktop e2e:test -- --suite settings --keep` to exercise eight scenarios through real settings controls and fresh application processes:

| Case | Behavior checked |
| --- | --- |
| `settings-application` | Application feature toggles, automatic reapply, pagination, hero conflict warnings, volume, theme, and update channel persist and render after restart |
| `settings-privacy` | Global hiding, likely-content preference, blur controls, per-item memory, and analytics preference persist |
| `settings-backups-presence` | Automatic backups, retained backup count, and game presence preference persist |
| `settings-language` | Language selection changes the interface and survives restart |
| `content-visibility` | Safe and synthetic adult fixtures across dashboard, catalog, library, skins, and direct mod links; global hiding survives restart without deleting installed mods |
| `content-author-visibility` | Global hiding removes the synthetic adult mod from its author's page and result count, and still does after restart |
| `content-blur` | Actual preview blur, remembered reveal after restart, ignoring per-item overrides, and disabling/re-enabling blur |
| `game-launch-modes` | Create and edit a custom launch option; modded/vanilla launch arguments, vanilla without arguments, profile gameinfo paths, and unchanged installed VPKs across restart |

Launch tests run the real launch preparation and record the resulting Steam request using the existing isolated runtime policy. They do not start Steam or the game. Presence tests seed the normal hero-data cache; they do not connect to Discord. Analytics and update-channel assertions cover preferences rather than external delivery or updater installation. Content images are plain synthetic rectangles.

## Download scenarios

M4 uses real Rust HTTP transfers against binary fixture responses. Run any case with `pnpm --filter @deadlock-mods/desktop e2e:test -- --case <case> --keep` after rebuilding the E2E application. These cases do not require the native input helper.

| Case | Behavior checked |
| --- | --- |
| `downloads-pause` | UI pause freezes a valid partial prefix; UI resume continues it with a Range request and completes the payload |
| `downloads-range` | A connection cut after 65,536 bytes triggers an exact Range request and byte-correct completion |
| `downloads-cancel` | Cancel a paused transfer through the existing Rust command, verify partial cleanup, restart, and retry through the UI |
| `downloads-cancel-connecting` | Cancel through the UI while the server withholds response headers; the UI retry must reach the server within 10 seconds and complete |
| `downloads-cancel-queued` | Cancel through the UI a second mod still queued behind a slow download; it settles as failed, never reaches the server, and the first download completes |
| `downloads-reload-queued` | Reload the window while a second mod is queued behind a slow download; both settle as failed, the queued mod never reaches the server, and Retry completes the first |
| `downloads-delete-queued` | Delete from My Mods a second mod queued behind a running download; no toast names it, it never reaches the server or leaves files, and the first download completes |
| `downloads-restart` | Restart while paused, verify stale status becomes failed while partial evidence remains, then retry from scratch |
| `downloads-auth` | A 401 response fails visibly; UI retry completes after the fixture permits it |
| `downloads-corrupt` | A same-length corrupt payload fails MD5 validation without publishing a file; UI retry succeeds |
| `downloads-redirect` | Reject a redirect to a production host without making an external request; UI retry succeeds |
| `downloads-variants` | Retry preserves a previously selected variant, including after a 401 and restart; the unselected URL has no registered fixture |
| `downloads-queued-retry` | After a 401, retry the download while another throttled download holds the queue; the waiting card shows no health notice, and the retry completes once the queue frees up |
| `downloads-queued-waiting` | A download waiting behind another throttled download reads "Waiting" with no speed, percentage or shimmer, and the page header and bottom bar count it as waiting; paused, it reads "Paused" with Resume and counts as paused; resumed, it waits again; once it starts it shows its speed and counts as downloading; paused after it started and resumed behind another download, it waits again and then continues with a Range request |
| `downloads-pause-queue` | Pausing a download lets the one queued behind it start within 5 seconds; Resume waits for it without a health notice, then continues from the exact partial offset |
| `downloads-pause-queue-cancel` | Cancel a paused download that gave up the queue: its partial files are removed and the other download completes |
| `downloads-pause-queue-reload` | Reload with one download paused and another running: both settle as failed, the backend keeps neither, and the paused one's partial files are removed |
| `downloads-pause-queue-restart` | Restart with one download paused and another running: both come back failed with Retry, the paused partial remains, and both retries complete |
| `downloads-wrong-range` | A cut connection's Range request is answered from byte 0 under a 206; the download restarts from scratch instead of appending, and completes |
| `downloads-segmented` | Turn on Faster downloads in Settings; a 16 MiB file arrives as four overlapping 206 responses on four connections, under 60% of the time one throttled connection needs |
| `downloads-segmented-off` | The same throttled file with the setting off: one ordinary request, no faster than one connection allows |
| `downloads-segmented-no-range` | The server answers the first segment with 200; the download falls back to one ordinary request and completes |
| `downloads-segmented-range-error` | The server fails the first segment's request with 400 but serves an ordinary request; the download falls back to it and completes |
| `downloads-segmented-wrong-range` | The third segment comes back one byte late; every segment stops, the staging is removed, and one ordinary request completes the file |
| `downloads-segmented-corrupt` | One segment carries a flipped byte; the whole-file MD5 fails without publishing a file or leaving staging behind; UI retry succeeds |
| `downloads-segmented-pause` / `-cancel` / `-restart` | The pause, cancel and restart flows above with segments; paused and interrupted parts are exact prefixes of their own spans |
| `downloads-segmented-budget` | A mod with three large files on one server never has more than four requests open at once |

Each world starts with a failed download record and persisted file selection, so Retry exercises the real frontend purge/queue flow without depending on the remote catalog. Variant coverage here is persisted selection and retry, not the initial catalog file chooser. `downloads-cancel` cancels its paused transfer through the real `cancel_download` IPC command; `downloads-cancel-connecting` and `downloads-cancel-queued` press the card's Cancel button. Successful transfers are checked again in a new application process. The oracle compares SHA-256 hashes, partial prefixes and metadata, exact cache contents, the empty addon manifest, and protected game/Steam files. `download-*.json` captures disk/state evidence; `network.ndjson` includes Range headers, response status, bytes sent, the client port and when each response ended, which is how the segmented cases count connections and time transfers. Every fixture response is throttled on its own, like a server limiting each connection. UI retries deliberately purge stale data; only interrupted transfers within a running process resume with Range.

`downloads-queue-error-toast` starts with an empty library and the synthetic GameBanana catalog instead. The mod page lists its single file, and GameBanana has removed it by the time Download is clicked, so `queue_download` refuses the request. Exactly one error toast must name the mod and the reason, the mod must end up failed, and its archive is never requested. `downloads-queue-error-model-tab` makes the same checks for the 3D tab's download button.

The E2E-only download policy accepts exact configured fixture origins (including port and scheme) for initial requests and redirects. Ordinary builds retain the HTTPS trusted-host allowlist. The same downloader, checksum checks, staging files, pause gate, and cancellation logic run in both builds.

## GameBanana catalog installation scenarios

`gamebanana-legacy-catalog` starts with a populated SQLite catalog containing
`audio_url` and the legacy author migration, but no metadata migration record.
It verifies migration without replacing the database, catalog availability,
syncing and displaying cached/new records, and migration history after a fresh
app process. Run it with `pnpm --filter @deadlock-mods/desktop e2e:test -- --case gamebanana-legacy-catalog --keep`.

The lifecycle cases also exercise installed archive changes, cancelled and failed changes, disable/re-enable, force update, and reinstall. `gamebanana-remembered` chooses two multi-file archives at download, and enabling installs every VPK in them without asking again. `gamebanana-unremembered` downloads a single multi-file archive, so enabling opens the per-VPK chooser, which rejects an empty selection before a subset is installed. `gamebanana-switch` adds, replaces, revisits, and removes archives while retaining exact inactive-file hashes. `gamebanana-switch-failure` requires a 503 to leave the existing installation unchanged before retry succeeds. `gamebanana-reselect` deletes and reinstalls a single archive with a different VPK selection: the current UI does not offer an installed per-VPK editor for a single download. `gamebanana-reinstall` restores an enabled selection, while `gamebanana-reinstall-disabled` remains downloaded and inactive. `gamebanana-force-update` checks that the update dialog retains the chosen downloads. Every case restarts the app and verifies its final state.

These cases start with an empty library and use the real catalog UI, GameBanana provider, downloader, archive extraction, and installation commands. Only HTTP responses are mocked. Run each with `pnpm --filter @deadlock-mods/desktop e2e:test -- --case <case> --keep` after `e2e:build`.

| Case | Behavior checked |
| --- | --- |
| `gamebanana-single` | Browse a synthetic GameBanana submission, download its ZIP, and enable its single VPK |
| `gamebanana-multifile` | Choose two of three downloads, install both VPKs, and show their respective source archives; the unselected download has no route |
| `gamebanana-variants` | Download an archive with common, blue, and red VPKs; deselect red and install only common and blue |

Every case checks the mod page's Installed Files list and Active Mod files section, closes the application normally, and repeats the rendering and disk checks in a new process. Installed filenames, archive groups, selected downloads, profile state, manifest entries, and exact VPK bytes must agree. Network assertions require the real provider metadata endpoints and exactly the selected payload requests, with no download repeated on restart. Screenshots, DOM snapshots, and `catalog-*.json` disk evidence are retained with `--keep`.

`gamebanana-update-skip` installs one archive and runs four processes against one world. The first update check sees a newer optional file the user never installed, and no update may appear. Then the installed file gets newer. The update shows in My Mods and on the mod page, **Skip this update** hides it, and `skippedUpdateAt` persists. The update stays hidden after a restart. A later change to the installed file brings it back. Update checks are cached for six hours, so the spec expires the catalog's `update_cache` row between processes. The bulk update route serves one snapshot per expired check, and the network assertion requires exactly three bulk update requests.

`collection-retry-failed` syncs a two-mod GameBanana collection and downloads it from the collection page. The second mod's first transfer returns 503, so the page must count only one mod as in the library and offer the failed one again; downloading the collection a second time fetches it and leaves both mods downloaded.

`mod-files-error` opens the mod page while GameBanana's file list returns 500. The Rust transport retries a 5xx three times, so the page's first load sees four failures. The Files tab must stay, say the list couldn't load, and offer **Try again**. The first retry fails the same way, and the error and **Try again** must stay. The second retry's response is held back three seconds, and the tab and its error must stay while it runs. Then the file list appears. The network assertion requires exactly eight failed file list requests followed by one successful one.

The variant scenario caught an Installed Files rendering bug: the stored file tree retains unselected options, and the page previously displayed all of them. The display now groups only selected files, including the per-archive file counts.

## Mod manager interchange scenario

`grimoire-import` seeds a Grimoire install inside the world (`foreign-apps/grimoire` userData with two profiles, a profile crosshair, autoexec commands and a crosshair preset, plus VPKs in the shared `citadel/addons`, the Grimoire overflow root `addons1`, and `.disabled`). It picks Grimoire from the **Import from other mod managers** menu and walks the whole wizard: choose mods, profiles and crosshairs, watch the progress, analyze the local mods (the hash lookup finds nothing), link one to its GameBanana page by hand and skip the other. The oracle checks the library (catalog enrichment, the stale-fingerprint fallback, the copied overflow mod, the failed catalog lookup), the imported profiles (the one named like DMM's default profile goes into it, a dangling entry is dropped), the linked identity in every profile, the mod store and the import ledger, the crosshair history, exact addon inventories and bytes, and that Grimoire's own data stays byte-identical. A second import must offer nothing new, and a fresh process must show the same state. A third phase lets Grimoire swap two slots, move DMM's parked file into `.disabled`, add a mod and rename a profile: the re-import offers only the new mod, adds it to the profile the renamed one went into before, and creates no duplicate mods or profiles.

Enabling mods requires that Deadlock is not running on the host: DMM refuses to enable while the game runs, and the import then parks mods disabled (the wizard warns about this).

```powershell
pnpm --filter @deadlock-mods/desktop e2e:test -- --case grimoire-import --keep
```

## Filesystem recovery scenarios

These cases run with the same `e2e:test -- --case <case> --keep` command after `e2e:build`. Run them serially on Windows/Wry.

| Case | Behavior checked |
| --- | --- |
| `filesystem-backup-replace` | Create and restore through Settings; restore original VPK order, manifest, and overwritten sentinel; remove a file added after backup |
| `filesystem-backup-merge` | Restore the backup's colliding files and manifest while preserving a file added after backup |
| `filesystem-lock` | Hold the third VPK with Windows `FileShare.None`; fail after staging an earlier VPK, prove exact rollback, release the handle, and retry |
| `filesystem-collision` | A protected directory occupies the next destination filename; fail during placement, prove exact rollback, remove only the fixture obstruction, and retry |
| `filesystem-shards` | Rotate 100 distinct installed payloads across the 99-file boundary; verify ownership of identically named slots in different shards and both game search paths |
| `filesystem-crash-placed` | Abrupt exit after the first real placement, leaving two parked VPKs; a fresh process restores the original layout |
| `filesystem-crash-committed` | Abrupt exit after the manifest is saved but before staging cleanup; a fresh process retains the committed layout |
| `filesystem-manifest-repair` | A migrated store claims unfinished downloads for mods the manifest still owns; startup restores their installed state and VPKs without touching a file |

The manifest repair case seeds the Alpha recipe and then degrades only the persisted store to what a library migrated from an older build looks like: the mods are still enabled in the profile, their VPKs are still on disk under `.dmm.json`, but their mirrored install state claims an unfinished download. It asserts the store alone is rewritten - both profile copies back to installed with the manifest's exact `currentVpks`, no queued transfer left on the Downloads navigation entry, and Alpha and Beta byte-identical to their recipe - in the first process and again after a restart.

Backups use UI controls. Filesystem mutations use the existing `reorder_mods_by_remote_id` IPC command so each fault lands at a precise boundary; M3 covers the native ordering gestures. Restart uses the production snapshot/recovery path, then switches Beta → Alpha through the profile selector to exercise frontend reconciliation. The oracle checks persisted order, exact file inventories, distinct payload hashes, manifest slots and shards, protected Beta/Steam files, and game search paths. Backup sources must match the initial recipe and remain unchanged after restore and restart. Opening Settings normally creates an empty `cfg/autoexec.cfg`; this exact write is included in the backup cases' expected inventory.

The compile-gated `e2e_faults` module only accepts a PID-bound arm file for the matching crash case in its owned world. It writes and syncs a checkpoint marker, then exits without running destructors. The supervisor verifies the marker's PID/run/profile, the exact stage/place/manifest journal, and the payloads still on disk. There is no crash hook in an ordinary build, no mocked core IPC, and no harness rewrite of a failed transaction's files or manifest.

Ordinary M5 restarts close the main window through Tauri, wait for the process to exit, and verify the persisted profile store. WDIO's Windows teardown sends a terminating signal that can interrupt a store write during background hero detection; it is unsuitable for an ordinary restart. After proving process exit, the worker retires its dead WebDriver session so teardown does not send DELETE to the closed embedded server. Every phase still requires a zero WDIO exit status. Normal-exit evidence is checked again by the supervisor; timeouts, signals, missing markers, or failed assertions fail the run. Switching profiles creates `gameinfo.gi.bak`, which must match the initial gameinfo bytes exactly.

Artifacts include `filesystem-baseline.json`, per-step `filesystem-*.json`, `filesystem-rollback.json`, `phase-completed-*.json`, backup evidence, and crash marker/journal/disk evidence. Lock handles are released in `finally`; the helper also has a bounded lifetime. Worlds with failures remain available for diagnosis. Synthetic profile archives contain no hero assets and are seeded as already indexed, keeping unrelated background discovery out of these scenarios.

These cases cover reorder interruption at placement and manifest commit, rather than every possible write boundary. Interrupting a backup restore during its copy phase and simulating power-loss durability remain additional coverage opportunities.

## Missing VPK scenarios

`addons-folder-wiped` starts with three enabled Alpha mods, closes normally,
and removes Alpha's entire addons folder including `.dmm.json`. The next
process records whether startup drops or flags the lost installs, clears them
through Settings → Tools, downloads and reinstalls a catalog mod, and checks
disk bytes, manifest ownership, both library copies and an empty download queue.
A third process checks that the recovered install survives restart. Beta and
Steam remain unchanged. Startup must not present missing files as healthy enabled
installs, even if Clear All Mods subsequently repairs the state.

`missing-vpks-launch` removes only three enabled mods' VPKs between processes,
keeping their manifest and restorable sources. It checks the library warnings,
then requires Launch modded to visibly refuse or request confirmation, or restore
every enabled payload before recording a Steam launch. A library badge alone
does not satisfy this pre-launch check. `gameinfo-reverted-launch` instead reverts
gameinfo to vanilla while preserving those enabled VPKs; a recorded modded launch
must have Alpha's addons search path restored. Both launch cases check a fresh
process again. These cases need no native input and retain `broken-state-*.json`
observations with disk, manifest, store, gameinfo, launches and UI text.

A user can delete VPKs from the addons folder behind DMM's back. A mod whose every file is gone has nothing left to enable, so it has to leave the library and its manifest entry, or startup would restore it again. A mod that lost only some files, or that DMM can restore, stays in the library flagged as broken: its `missingVpks` lists the original names of the lost files, and My Mods shows a `missing-files-warning` for it. Both cases seed the same mixed Alpha library next to Beta, which is not the active profile:

| Mod | Seeded as | Deleted | Expected |
| --- | --- | --- | --- |
| `local-alpha-enabled` | Enabled, one VPK | Its VPK | Removed |
| `local-alpha-parked` | Disabled, one parked `{id}_` VPK | Its parked VPK | Removed |
| `local-alpha-intact` | Enabled, one VPK | Nothing | Installed and enabled, unchanged |
| `local-alpha-pair` | Enabled, two VPKs | The second VPK | Kept, flagged broken with `missingVpks: ["local-alpha-pair-second.vpk"]` |
| `local-alpha-stored` | Enabled local import, source kept in the mods store | Its VPK | Kept, flagged broken with `missingVpks: ["local-alpha-stored.vpk"]`; reinstalling restores it from the store |
| `local-beta-enabled` | Enabled in Beta | Its VPK (offline case only) | Removed from Beta |

| Case | Behavior checked |
| --- | --- |
| `missing-vpks-offline` | The files are deleted before DMM starts. Startup alone removes the orphaned mods from both profiles, and a restart keeps them gone |
| `missing-vpks-live` | DMM stays open in the foreground. A reorder through the real Rust command renames every enabled VPK without removing anything, then each deletion is detected without a restart or focus change, and the partial deletions are flagged rather than removed |

The oracle checks both copies of the active library and their broken flags, Beta's library, `enabledMods`, both manifests, and that the remaining payloads are exactly the seeded ones minus the deleted ones. Removing a mod from the library must never delete a file itself, and the mods store must stay byte-identical. My Mods must list exactly the kept mods, with one warning per broken mod. Artifacts are `missing-vpks-*.json`.

## Monkey scenario

`monkey` composes weighted random operations over the Alpha/Beta profile fixtures
and the real `gamebanana-multipak-update` downloads. Run it after `e2e:build`:

```powershell
pnpm --filter @deadlock-mods/desktop e2e:test -- --case monkey --keep
$env:DMM_E2E_SEED = "0"
$env:DMM_E2E_STEPS = "25"
pnpm --filter @deadlock-mods/desktop e2e:test -- --case monkey --keep
```

An unset seed defaults to `0`; the seed is always printed. Pass other seeds to
explore new sequences. `DMM_E2E_SEED` accepts an unsigned
32-bit integer (including zero); `DMM_E2E_STEPS` defaults to 25 (1–200). The seed,
planned choices, concrete executed steps, deterministic skips and outcomes are
written to `artifacts/monkey-steps.json` before and after each step. Replay a
failure with the printed seed and original step count. In a POSIX shell:

```bash
DMM_E2E_SEED=887 DMM_E2E_STEPS=25 pnpm --filter @deadlock-mods/desktop e2e:test -- --case monkey --keep
```

Updates/toggles have weight 6 each, profile switches 4, reorder/install/modded
launch/Repair 2 each, and uninstall/vanilla launch/external add/external delete/
Windows lock 1 each. Invalid operations are recorded as deterministic skips.
Updates apply v1 → v2 to enabled multipak mods; repeat updates skip once current.
Store reinstalls target removed Alpha remote mods. External deletion targets
updated remote mods (fresh fixture metadata serves v2), checks the
missing-files launch dialog, cancels without recording a launch, then reinstalls
from the library. Seeded HTTP 401 failures verify rollback before retry. Lock
faults release their handle in `finally` and skip outside Windows.

Every step checks both profiles' membership, exact payload hashes, unique manifest
ownership, disk/store enablement and locators, staging cleanup and unexpected
HTTP requests. Deliberately added external VPKs remain exempt from ownership
until Repair moves them to backup. Launch steps additionally check gameinfo
paths. Reorder uses the real Rust command followed by switching away and back
for normal frontend reconciliation. A final phase verifies the same state in a
fresh process and after normal close. Crash checkpoints remain in their dedicated
PID-armed filesystem scenarios; the monkey does not arm them.

Seeds `2` (step 17), `3` (step 12), and `887` (step 10), at 25 steps on Windows,
found #891: after an update, deleting one of a multipak mod's VPKs and reinstalling
it from the library left it downloaded with no manifest ownership. Reconciliation
had demoted it to downloaded, so the reinstall treated it as never installed. Seed
`4` found that retrying an update within the same second as a failed one hit a
backup name collision. Keep these seeds as regressions.

The `monkey` family is included by `--suite all` and needs no native input. CI
runs it with fixed seeds, each as its own job: `0`, `887` and `4` on Windows, and
`0` and `887` on Debian. To cover another seed, add a `{ suite: monkey, seed: "N" }`
entry to the matrix `include` in `.github/workflows/desktop-e2e.yml`. Failed
worlds and artifacts are uploaded, so a failing seed can be replayed locally.

## Qualification status

All seven M5 cases passed repeated retry-free Windows/Wry worlds, with a fresh process for recovery and independent disk/store evidence. The final backup replace and merge cases each passed two consecutive worlds; the 100-mod shard case passed three consecutive worlds after fixing normal shutdown and preindexing the synthetic fixtures. Successful M5 worlds took approximately 20–26 seconds and had no unmatched fixture requests. These cases exposed two production defects that are fixed here: completed rollbacks left their transaction journal behind, and reorder bypassed the journal-aware manifest commit method. The Rust mod-manager suite and the harness suite both pass, including checks that reject wrong payloads, false shard ownership, unexpected files, and foreign/live crash markers.

All eight M4 cases passed two consecutive retry-free Windows/Wry worlds each, including a new application process in every world. The final pass took approximately 20–30 seconds per world with no unmatched requests. Harness unit tests cover binary Range responses, truncated streams, wrong-variant bytes, and leftover partial files; Rust tests cover fixture-origin restrictions and the ordinary-build allowlist.

The profile pointer and keyboard scenarios each passed three consecutive retry-free Windows/Wry worlds, with two application processes per world. These six runs took 32.6–36.6 seconds and had no unmatched fixture requests.

The local-mod lifecycle passed 10 consecutive retry-free Windows/Wry runs in 24.5–27.2 seconds per world, with two application processes per run. A final verification after adding bounded inventory retries for transient Windows file locks passed both the lifecycle and the intentional-timeout cleanup probe. The inventory still fails if a file remains locked; it never skips a locked file.

The embedded provider passed 10 consecutive fresh-process runs on Windows/Wry with retries disabled, followed by an intentional timeout that was surfaced and torn down correctly. Fresh runs took 10.6–14.7 seconds (about 11.6 seconds on average), including world creation, application and driver startup, UI and Rust assertions, artifact capture, shutdown, and cleanup across every managed root.

The external provider currently cannot be required on Windows hosts with WebView2 Runtime 150 or newer when the application runs elevated. WebView2 ignores the remote-debugging switch used by `tauri-driver`, so session creation times out even with a matching EdgeDriver. This is tracked upstream in [webdriverio/desktop-mobile#542](https://github.com/webdriverio/desktop-mobile/issues/542) with the Tauri fix in `wry#1782`. Keep embedded as the required provider until that upstream fix reaches DMM's Wry version.

`@wdio/tauri-service` 1.3.0 also emits a non-fatal `sessionId is required` warning while clearing its mock store after an embedded session has already closed. It does not change the WDIO exit status or leave the application running. Treat it as service noise and remove this note when the package fixes its after-session cleanup.

Native Windows dialogs are outside the webview DOM and cannot be driven by WebDriver. The lifecycle scenario uses the narrowly scoped FlaUI helper for picker selection while keeping the app's real dialog plugin and Rust continuation in the flow.

## Roadmap

M6 runs the existing E2E harness in `.github/workflows/desktop-e2e.yml`. It runs nightly at 03:23 UTC, on manual dispatch, and on PRs carrying the `e2e-full` label. Regular PRs do not build or run the pipeline automatically.

The pipeline builds the debug harness and native helper once, then shares their binaries with seven independent Windows jobs covering all 37 scenarios. Each family runs serially with retries disabled. Native input is explicitly enabled only on disposable GitHub-hosted desktops. The CLI's `--report <path>` writes an incremental JSON summary; CI retains reports and diagnostic artifacts for 14 days without uploading control tokens. Linux coverage builds the harness inside `debian:trixie` and `archlinux:latest` containers and runs every Linux-supported family under Xvfb with a private D-Bus session on each distribution. Missing prerequisites, unmatched requests, timeouts, and failed scenarios remain failures. No release builds, installer smoke tests, signing, or publication are part of this pipeline.

Use the seven scenario jobs and their per-case reports to verify clean-runner qualification. Full local runs require explicit native-input authorization and the same strict network and filesystem checks as CI.

| Milestone | Status | Deliverable | Exit criterion |
| --- | --- | --- | --- |
| M1: safe harness foundation | Complete in PR #707 (replaces #706) | Compile-gated runtime configuration, owned worlds, root routing, fixture network, filesystem oracle, synthetic VPK builder, supervisor, doctor, and embedded-driver qualification | Ten retry-free fresh UI/IPC runs pass; intentional timeout cleanup succeeds; production cannot activate E2E mode |
| M2: complete local-mod lifecycle | Implemented and validated on Windows/Wry | Drive a synthetic VPK through a narrowly scoped FlaUI native-picker helper, the real Rust parser, import/install, enable/disable, delete, and application restart | UI state, VPK manifest, persisted store, and independent file hashes agree after every step; the final world matches its expected restored state |
| M3: profiles and ordering | Implemented and validated on Windows/Wry | Two-profile switching plus native pointer and keyboard reorder flows | Inactive profiles and protected files remain unchanged; order and profile state survive restart without mocked core IPC |
| M4: downloads and network failures | Implemented and validated on Windows/Wry | GameBanana catalog downloads and installation, multi-file and VPK variant selection, installed-file rendering, selected-variant retries, Range resume, pause, cancel, corrupt payloads, authentication failures, redirects, and interrupted-process recovery | Every request matches the strict journal; unexpected traffic fails; installed files and selections survive restart; partial files and state recover correctly |
| M5: recovery and hostile filesystem cases | Implemented and validated on Windows/Wry | Backup replace/merge, interrupted mutations, shard boundaries, collisions, Windows locks, and crash barriers | Restart recovers retained worlds and the independent oracle proves restoration without normalizing unexpected writes |
| M6: nightly E2E pipeline | Implemented; qualification tracked in CI | Nightly/manual Windows E2E matrix and opt-in execution on labelled PRs | All 37 registered scenarios pass on clean runners with retained failure evidence |

Keep scenarios independent and small even when they share recipes. The final routine-development gate is a composed import/download → enable → profile switch → reorder → backup → modify → restore → restart journey, supported by focused tests for each operation and failure boundary.

`conflicts-switch` enables a model replacement through the selected-mod workflow.
Keep current leaves the existing skin and VPK bytes unchanged; choosing the new
skin disables only its model conflict. The unrelated material mod stays enabled,
and the library state, manifests and archive hashes must agree after restart.


`bisect-conflicts` starts from two conflicting model replacements and an unrelated
mod. It verifies Stop restores every original mod and its load order, then starts
another search and restores after a fresh process. Persisted library/profile
state, manifest entries and exact VPK hashes must all agree.

## Library groups

Run `pnpm --filter @deadlock-mods/desktop e2e:test -- --suite library-groups --keep --allow-native-input` after rebuilding the E2E application. Six cases cover organization/copying, native dragging, group enablement, pagination/filtering, removal/Undo, and addon identification, each followed by a fresh-process restart. Assertions compare membership, collapse state, independent profile copies, enabled status, manifest order, exact file inventories, and VPK hashes.

The drag case uses native pointer down/move/up to exercise multi-selection, Undo, hover expansion, header and dotted drop targets, folder ordering, list/grid views, cancellation, and preview distance from the pointer. Windows uses the FlaUI helper. Linux requires `xdotool` and an X11 display; use Xvfb with a private D-Bus session as above. Input is restricted to the owned test window and requires explicit opt-in. Synthetic DOM pointer events are not a substitute for this case.

The surrounding `library-selection`, `conflicts-resolve`, and `bisect-conflicts` cases also create library groups through the UI. They check selection across profiles, conflict load-order changes, and bisection controls/restoration while preserving organization. Grouped addon identification replaces a placeholder ID with its catalog ID and verifies that membership, VPK bytes, load order, and enablement survive that transition and restart.

## Mod updates

`gamebanana-archived-files`, `gamebanana-update-choice` run in the existing `gamebanana` suite. Archived files do not trigger an update or any download. Ambiguous updates require an explicit variant choice and never download the unchosen archive. Each case restarts in a fresh process and checks exact VPK bytes, manifest and persisted state, and the absence of leftover partial files.

## Download fallback

`gamebanana-mirror-fallback` run in the existing `gamebanana` suite. An interrupted mirror transfer receives a failed retry before the canonical endpoint succeeds. The canonical request starts without a Range header, and the installed VPK bytes match the fixture. Each case restarts in a fresh process and checks exact VPK bytes, manifest and persisted state, and the absence of leftover partial files.

## Mod requirements

`gamebanana-requirements` run in the existing `gamebanana` suite. Requirements move from missing to downloaded-but-disabled to satisfied. Cancelling the warning preserves addon files; enabling prerequisites and disabling incompatible mods clears it. Load-order changes are verified against the manifest. Each case restarts in a fresh process and checks exact VPK bytes, manifest and persisted state, and the absence of leftover partial files.

## Crash attribution

`gamebanana-crash-cause` run in the existing `gamebanana` suite. Generic and resource-specific reports pass through the real `game-session-ended` event. Only the resource-specific report shows a cause and library badge. This covers presentation; Rust integration tests cover attribution because the harness records launches instead of starting Deadlock. Each case restarts in a fresh process and checks exact VPK bytes, manifest and persisted state, and the absence of leftover partial files.
