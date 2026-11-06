# vpkmanager

The shared **write** half of the mod manager's VPK work: recoloring and
replacing compiled textures, swapping sounds, and packing a directory tree back
into a loadable VPK. The read/render half — decoding models to glTF for the 3D
preview — lives in `source2-model`.

## Third-party code

`src/source2/` is vendored from the `morphic` crate of
[vpkmerge](https://github.com/Slush97/vpkmerge) (MIT, © 2026 esoc), whose
algorithms are in turn adapted from
[ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat)
(MIT, © 2015 ValveResourceFormat Contributors).

The subtree was taken from vpkmerge commit
[`142373c2`](https://github.com/Slush97/vpkmerge/commit/142373c2cfcac522624519dcb64e616c8d58998e)
(2026-08-08), which was upstream `main` when this crate was added on 2026-08-12.
It has been modified from upstream: the KV3 re-wrap is stricter than morphic's
reader so files the engine rejects are refused at pack time rather than accepted
here and broken in-game.

The full license texts are in [LICENSE-vpkmerge](LICENSE-vpkmerge) and
[LICENSE-ValveResourceFormat](LICENSE-ValveResourceFormat).

Only the container, texture, KV3 and sound codecs were taken. The model
exporter, material compiler and VFX expression compiler were not. Keep that
subtree close to upstream so a future `morphic` release can be re-vendored;
new behavior belongs in the modules beside it.

## Audit sticker exports after a game update

Run this from the repository root with the installed game's directory VPK:

```sh
cargo run --manifest-path apps/desktop/Cargo.toml \
  --package deadlock-mod-manager --example audit_model_patches \
  --no-default-features --features tauri-wry -- \
  --archive /path/to/Deadlock/game/citadel/pak01_dir.vpk \
  --report /tmp/model-patch-audit.json --decode
```

The command discovers models under `models/heroes/`, `models/heroes_wip/`, and
`models/heroes_staging/`. It reads the archive without changing game files or
addons. Add `--filter /haze/` to restrict the check to matching model paths.

For each model, it enumerates material and bone bindings and exports one
representative per distinct target-mesh and 8-bit/16-bit bone-index combination.
It checks that each sticker has one independent mesh, covers the material's LODs,
uses the correct palette-local bone, and preserves the original mesh, animation,
and physics blocks. `--decode` also runs one successful export per
model through the preview decoder. This checks binary exports and decoding;
it does not replace animation and appearance checks in the game.

The JSON report lists unsupported legacy/external models separately from export
failures. `lodGaps` lists original bindings absent from some material LODs. The
exporter retains those bones for its independent sticker mesh, including cloth
and eye bones, and extends their LOD usage flags without replacing animations.
The audit verifies that these placements export with complete LOD coverage.
