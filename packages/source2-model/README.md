# source2-model

The shared **read** half of the mod manager's VPK work: decoding compiled
Source 2 character models (`.vmdl_c` / `.vmesh_c`) and the materials and
textures they reference, then exporting them to glTF for the 3D preview.
The write half — recoloring, replacing, packing — lives in `vpkmanager`.

## Third-party

Decode and export behavior is adapted from
[ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat)
(MIT, © 2015 ValveResourceFormat Contributors). The full license text is in
[LICENSE-ValveResourceFormat](LICENSE-ValveResourceFormat).
