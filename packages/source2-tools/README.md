# Source 2 tools

DMM Workbench uses an extracted CSDK installation directly. CSDK13 has been
verified on Linux through Proton Experimental. Select the extracted SDK root in
Workbench and run **Set up tools**. DMM also installs the Source 2 Viewer CLI for
asset extraction when needed.

Setup copies Deadlock's non-shader VPKs and its `cfg`, `maps`, `panorama`, and
`resource` folders into the separate SDK installation. It enables the vendor's
asset index and creates the default `dmm_workbench` addon if absent. It does not
modify the installed game or replace SDK DLLs. Allow space for the game data;
unchanged files are skipped on subsequent setup runs.

Existing addons remain in their original folders. DMM remembers previous SDK
roots for addon discovery when the active SDK changes, and mounts those addons
when launching or compiling with the selected SDK. Legacy patched SDK paths are
retained for discovery, but are not automatically selected as the active SDK.

## Compatibility and launch

Installation checks use the shared executable/content layout rather than a
release name or fixed binary hashes. A future SDK with the same layout can be
selected without adding another release profile. This checks file availability;
new engine versions still need runtime verification.

The regular `game/bin/win64` tools are used, with `-clientonly`. The server tools
are not selected. On Linux, GUI tools run through the configured Proton with a
managed prefix and `QT_AUTO_SCREEN_SCALE_FACTOR=0` for readable Qt controls.
Compiler launches initialize a fresh Proton prefix automatically.

CSDK13's native ModelDoc successfully opened, compiled, and played Mina's
`vampirebat_ability_ult_loop.vnmclip` in the November 2026 verification. The frame
and cycle indicators advance, although the generic seconds display remains
`0.00/0.00s`. No clock patch is applied to this vendor runtime. This verification
does not establish parity for every hero, animation, or particle effect.

The live DMM check also launched the existing `artist_mods` addon from its
original CSDK12 folders in CSDK13's Asset Browser. One separate compatibility
issue remains: beeskulls' `soundevents/hero/necro.vsndevts_c` override makes native
startup exit with status 5. Removing that override temporarily allows startup;
recompiling its source with CSDK13 produces identical bytes and does not repair
the failure. Setup does not remove addon resources to work around this issue.

## CLI

```sh
cargo run --manifest-path packages/source2-tools/Cargo.toml -- inspect-installation /path/to/CSDK
cargo run --manifest-path packages/source2-tools/Cargo.toml -- prepare-installation /path/to/CSDK /path/to/Deadlock
```

The old `prepare`, `inspect`, and `patch-clock` commands are retained for historical
CSDK12 investigation. DMM setup no longer invokes them or downloads Dota editor
depots.

Run unit tests with `cargo test --manifest-path packages/source2-tools/Cargo.toml`.
The ignored real-compiler test in `tests/incremental_compile.rs` documents its
environment variables and exercises initial, incremental, dependency, missing
output, and full rebuild cases against an installed SDK.
