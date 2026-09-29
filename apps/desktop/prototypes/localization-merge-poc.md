# Shared mod-data merge POC

This throwaway prototype asks whether DMM can bake the localization-preservation behavior of
[Unstoppable](https://gamebanana.com/mods/657724) into profile application while still allowing
independent mods to edit different strings and rows in shared singleton files.

## Result

The core pipeline works:

1. Read every `resource/localization/**/*.txt` file from enabled mod VPKs in priority order.
2. Compare each token with the current loose vanilla file under `game/citadel`.
3. Ignore tokens that are identical to vanilla. This makes a current Unstoppable-style full-file
   snapshot a no-op instead of a lock that blocks every later mod.
4. Lock the first intentional value for each `(localization file, token)` pair.
5. Keep independent replacements and new tokens from lower-priority mods.
6. Report competing values and use load order or an explicit mod choice as the winner.
7. Apply the winners to a fresh copy of the current vanilla token set.
8. Discover compiled KV3 tables under `scripts/**/*.vdata_c` that also exist in the base game,
   ignore unchanged vanilla rows and non-runtime `_editor` metadata, then apply the same row-level
   locking rules.
9. Re-encode every supported table and pack it with localization into one overlay VPK. Unique or
   opaque assets continue to use normal VPK load order.

The Calico, Dio, and ability-test VPKs exposed shared-file collisions in heroes, abilities, bot
difficulty, and localization. The generated overlay now contains all three compiled tables plus the
three English localization files. On the live engine, one launch logged both
`Loaded hero 280/hero_aa` and `Loaded hero 280/hero_dio`.

## Run the VPK spike

Pass the local `game/citadel` directory. The demo builds three temporary full-file mod VPKs: an
Unstoppable-style vanilla guard, a high-priority Graves rename, and a lower-priority mod containing
one conflicting rename plus unrelated changes.

```bash
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --example localization_overlay_poc -- demo \
  --game-citadel "/path/to/Deadlock/game/citadel" \
  --output /tmp/dmm-localization-poc/pak01_dir.vpk
```

To simulate a manual conflict choice:

```bash
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --example localization_overlay_poc -- demo \
  --game-citadel "/path/to/Deadlock/game/citadel" \
  --output /tmp/dmm-localization-poc/manual-choice_dir.vpk \
  --prefer-mod lower-priority-graves
```

Real VPKs can be supplied from highest to lowest priority:

```bash
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --example localization_overlay_poc -- merge \
  --game-citadel "/path/to/Deadlock/game/citadel" \
  --mod-vpk "First mod=/path/to/pak01_dir.vpk" \
  --mod-vpk "Second mod=/path/to/pak02_dir.vpk" \
  --output /tmp/dmm-localization-poc/pak01_dir.vpk
```

Compiled VData can be inspected and merged independently:

```bash
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --example localization_overlay_poc -- vdata-merge \
  --base-vpk "/path/to/Deadlock/game/citadel/pak01_dir.vpk" \
  --mod-vpk "Calico=/path/to/killthecatlady.vpk" \
  --mod-vpk "Dio=/path/to/dio.vpk" \
  --entry scripts/heroes.vdata_c \
  --output /tmp/dmm-vdata-poc/scripts/heroes.vdata_c
```

The example refuses to write inside `game/citadel/addons`. It does not install the generated VPK or
edit `gameinfo.gi`.

## Exercise the state model

Open `localization-merge-poc.html` directly in a browser. It supports:

- an Unstoppable-style vanilla snapshot;
- compatible edits and new strings;
- a conflicting Graves token;
- load-order changes;
- disabling mods;
- choosing either mod or vanilla for a conflict.

## Open questions before production

- An old full-file snapshot differs from current vanilla even when the author did not intend those
  differences. Content alone cannot distinguish stale vanilla from intentional edits. DMM needs a
  stale-snapshot warning or explicit mod metadata before silently accepting thousands of deltas.
- The POC keys a string by localization file and token. We still need an engine test for duplicate
  token names spread across different localization files.
- The existing VPK extractor does not return preload bytes. The POC rejects affected localization
  entries instead of creating corrupt text.
- Generated files are normalized and sorted; comments and original token order are not retained.
- Compiled data is merged only when it lives under `scripts`, has a `.vdata_c` suffix, exists in the
  base game, and decodes as a top-level KV3 object. Other binaries retain normal load-order behavior.
- The overlay intentionally lives outside `citadel/addons`, takes priority over addons in
  `gameinfo.gi`, and is not owned by the addons `.dmm.json` manifest.

The implementation does not rewrite third-party VPKs. They remain the source of truth while DMM
owns one regenerable, profile-specific overlay and applies load order or explicit conflict choices.
