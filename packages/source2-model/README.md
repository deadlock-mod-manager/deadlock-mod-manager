# source2-model

The shared **read** half of the mod manager's VPK work: decoding compiled
Source 2 character models (`.vmdl_c` / `.vmesh_c`), materials, textures,
animations, particle definitions, and cloth setups for the local 3D preview.
Models and materials export to glTF; animation, particle, and cloth data feed
the preview runtime. The write half — recoloring, replacing, packing — lives
in `vpkmanager`.

## Third-party

Decode and export behavior is adapted from
[ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat)
(MIT, © 2015 ValveResourceFormat Contributors). The full license text is in
[LICENSE-ValveResourceFormat](LICENSE-ValveResourceFormat).
