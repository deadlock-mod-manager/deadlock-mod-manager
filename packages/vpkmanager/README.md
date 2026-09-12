# vpkmanager

The shared **write** half of the mod manager's VPK work: recoloring and
replacing compiled textures, swapping sounds, and packing a directory tree back
into a loadable VPK. The read/render half — decoding models to glTF for the 3D
preview — lives in `source2-model`.

Each VPK the manager takes responsibility for is stamped with a fingerprint
stored *inside* it, at `.dmm/fingerprint.dmm`. Stamping is additive: the entry
is appended to the VPK's directory tree and its bytes to the end of the data
section. VPK entry offsets are relative to the data section, so every existing
file keeps its offset, and entries in `_NNN.vpk` companions are not touched at
all. A stamped VPK loads exactly as the unstamped one did.

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
