# Reset-to-enable and gameinfo findings

Issue: [Reproduce the reset-enable native crash and gameinfo corruption sequence](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/643)

Evidence sources: [reset-enable crash report](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/613)
and [mixed line-ending report](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/527).
Neither evidence issue was modified.

## Disposition

Confirmed two deterministic current defects on checksummed stable and main:

1. A vanilla reset leaves `GameConfigManager.game_setup` true. The immediate
   enable retry skips setup, cannot find the markers that reset just removed,
   returns `GameConfigParse`, and leaves the game configured for vanilla.
2. Enabling mods injects LF replacement text into the CRLF vanilla file,
   producing mixed line endings.

The reported delayed `free(): corrupted unsorted chunks` crash was not
reproduced. Both artifacts remained alive for 20 seconds after the exact retry
failure, and the host recorded no coredump. Main also survived with the game
presence watcher enabled, matching the adjacent subsystem visible in the
reporter's log. That allocator symptom remains explicitly deferred as
Fedora/RPM or dependency-sensitive; it is not required to explain the confirmed
persistent-vanilla failure.

## Environment and artifacts

- Physical Linux host: CachyOS, KDE Plasma Wayland
- CPU/GPU: AMD Ryzen 7 5800X3D / Radeon RX 7900 XT
- Memory: 62 GiB; WebKitGTK 2.52.6
- Stable: 1.1.0 Debian package SHA-256
  `18a1eb0e68d794365ff67be2e9a733b93de0902246d956b17b73cc6430205009`;
  binary SHA-256
  `71c6e44010a9ed3b5e7d29a328933f4ef2476d224b0ef852241e3492ab04e78c`
- Main: commit `db775912eb2ced35ab94c38082c1fa374f243e18`, version
  `1.2.0-nightly.20260825.db775912`, Debian package SHA-256
  `14e887792248128a6be0e5336628dc8c4c70ac257704c74b65c950ca530fdbf0`;
  binary SHA-256
  `75bd68b1460075f4bbe2ba9f5aef13f5d4a8a99c6a1e6e56a13f4f5c6fd8381`
- Fixed API vanilla fixture: 14,903 bytes, 589 CRLF, zero bare LF,
  SHA-256 `c1b27311c5243126314b29c3dc782425e11fd351f185eb48e68275db8996cd2e`
- Measurement date: 2026-08-26 EDT / 2026-08-27 UTC

Main and the tested nightly are the same commit. The fake game tree was under
the ignored result directory; no operation touched the installed game or
launched Steam.

## Fixed transition results

Stable and main produced the same byte states and command outcome:

| Stage                  | SHA-256 prefix | CRLF | Bare LF | Markers | Addons path | Result   |
| :--------------------- | :------------- | ---: | ------: | :-----: | :---------: | :------- |
| Initial vanilla        | `c1b27311`     |  589 |       0 |   no    |     no      | valid    |
| Initial enable         | `664cce22`     |  578 |      15 |   yes   |     yes     | succeeds |
| API vanilla reset      | `c1b27311`     |  589 |       0 |   no    |     no      | succeeds |
| Immediate enable retry | `c1b27311`     |  589 |       0 |   no    |     no      | fails    |

The renderer receives this structured error:

```json
{
  "kind": "gameConfigParse",
  "matchSyncKind": null,
  "message": "Failed to parse game configuration. Try resetting the gameinfo.gi to Vanilla in Settings → Game and restart the mod manager."
}
```

Calling `String(error)` yields only `[object Object]`, which explains the
reporter's empty/unhelpful renderer log. Restarting the signed main artifact on
the exact final vanilla file and enabling again succeeds, returns the
`664cce22` modded hash, and restores markers/addons. This isolates the failure
to in-memory manager state.

No VPK manifest transition occurs in this launch-preparation path. The failure
happens while rewriting `gameinfo.gi`, before Steam launch and independently of
the number or content of installed VPKs.

## Root cause

`apply_vanilla_gameinfo` replaces and validates the file but does not invalidate
`game_setup`. The next `update_mod_path_multi` sees `game_setup == true`, skips
`setup_game_for_mods`, and enters its marker-only replacement branch. Vanilla
content has no mod-manager markers, so it returns `GameConfigParse` without
changing the file.

The reset and retry are ordered, not concurrent: `start_game` awaits
`reset_to_vanilla_internal`, each mutation holds the global manager mutex, and
the retry begins only after reset returns. The measured snapshots show the same
ordered hashes. A reset/enable write race is therefore not required to produce
the deterministic failure, though the 10 ms watcher cannot exclude a transient
partial state between samples.

The mixed endings come from LF literals in the replacement templates and
marker wrapper being inserted into the unnormalized CRLF source. Existing
syntax validation accepts the mixed result.

## Remaining uncertainty

- The reporter's Fedora 43 RPM environment used WebKitGTK 2.52.5 and a
  secondary Steam mount. This pass used the checksummed Debian payload on CachyOS
  with WebKitGTK 2.52.6.
- The real game was deliberately not launched, so `FATAL ERROR: Failed to read
16 bytes` was not reproduced and cannot yet be attributed to mixed endings.
- A Fedora/RPM reproduction should preserve the coredump and collect a native
  backtrace or ASan build before assigning the allocator failure to app code.

## Remediation and regression coverage

1. Invalidate configuration setup state after every successful vanilla reset.
   More robustly, derive readiness from current validated markers instead of a
   process-local boolean that can drift from disk.
2. Make enable self-healing: if markers are absent, run idempotent setup rather
   than returning an error that instructs the user to repeat the same reset.
3. Detect the source newline convention and normalize all generated replacement
   lines to it before the atomic write.
4. Present structured IPC errors through their `message` field.
5. Add a Rust regression test for setup → vanilla reset → immediate enable and
   assert markers/addons are restored without restart. Add byte tests for pure
   CRLF and pure LF fixtures, including repeated enable/reset cycles.
6. Keep the signed-artifact script as the release-level transition and delayed
   crash check. If the Fedora crash reproduces, add the allocator backtrace as a
   separate root-cause branch rather than conflating it with the marker error.

The existing focused Rust suite passed 13/13 game-config tests but contains no
reset-to-retry or newline-preservation case.
