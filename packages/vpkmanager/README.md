# vpkmanager

Everything the mod manager does to a VPK, and the record of where every VPK is.

Nothing outside this crate may rename, copy or delete a file inside a
`citadel/addonsN` folder. Callers say what they want — install this mod, disable
that one, reorder all of them — and the crate performs it and writes down what
happened. That is what lets the app answer "where is this mod right now?" without
guessing.

## The two halves

**Operations** (`ops`, `staging`, `naming`, `profile`) — enabling, disabling,
reordering across shard folders, clearing a profile. Every one of them is
transactional: it finishes, or it puts the profile back the way it found it, and
a crash mid-operation is recovered on the next load.

**Bookkeeping** (`fingerprint`, `ledger`, `scan`, `reconcile`, `backfill`) —
each VPK the manager takes responsibility for is stamped with a fingerprint
stored *inside* it, at `.dmm/fingerprint.dmm`. The profile's `.dmm.json` ledger
records where every fingerprint was last seen. When the user renames a pak file,
drags one between `addons` folders, restores a backup or deletes something in
Explorer, reconciliation reads the fingerprints back and follows the files
instead of losing them.

Stamping is additive: the entry is appended to the VPK's directory tree and its
bytes to the end of the data section. VPK entry offsets are relative to the data
section, so every existing file keeps its offset, and entries in `_NNN.vpk`
companions are not touched at all. A stamped VPK loads exactly as the unstamped
one did.

Editing the assets inside a VPK — recoloring and replacing compiled textures,
swapping sounds, packing a directory tree into a loadable VPK — lives here too
(`pack`, `texture_edit`, `sound_edit`, `particle_edit`, `pattern`). The
read/render half, decoding models to glTF for the 3D preview, lives in
`source2-model`.

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
