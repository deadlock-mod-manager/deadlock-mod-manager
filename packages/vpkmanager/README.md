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
(MIT). The full license text is in [LICENSE-vpkmerge](LICENSE-vpkmerge).

Only the container, texture, KV3 and sound codecs were taken. The model
exporter, material compiler and VFX expression compiler were not. Keep that
subtree close to upstream so a future `morphic` release can be re-vendored;
new behavior belongs in the modules beside it.
