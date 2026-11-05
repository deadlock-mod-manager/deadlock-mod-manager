# Source 2 model material previews

Compiled model previews use DMM's Rust exporter and shared Three.js viewer. The
exporter retains standard glTF PBR maps and adds `material.extras.source2` with
`schemaVersion: 1`. This is DMM's contract, separate from Grimoire's
`extras.morphic` schema. Standalone DMX previews remain untextured.

Source VMDL previews retain each DMX face set's material path and UVs. Default
ModelDoc material remaps are applied before resolving compiled VMAT/VTEX resources
from the addon's Game overlay and its base archive. The geometry comes from the
source DMX; no compiled VMDL, compiler, or Blender process is needed. Referenced
materials are decoded once per model through the same material pipeline as
compiled models. Missing materials remain untextured and are reported rather
than replaced with another face's texture. Source VMAT edits still need compiling
and are disclosed in the preview's diagnostics. FBX embedded textures keep their
existing path; ModelDoc remaps for FBX are not evaluated.

Each source mesh's extra tint-mask indices are rebased before its scene is joined
to the model, including unresolved masks, so independent GLBs cannot accidentally
share another mesh's mask. Loading failures dispose partially loaded geometry,
materials and extra masks. Source animations, body-group choices, import filters,
and LOD selection are still not evaluated by this static source preview.

The first integration supports static `pbr.vfx` albedo correction, tint modes
0/1/2, tint masks, and the authored ordering/masking of vertex color. Authored
sRGB tint is converted once in Rust; contrast pivots use the VTEX header's linear
RGB reflectivity. Color correction remains unclamped on the GPU. Optional tint
masks are embedded in the GLB and resolved as linear data while the glTF parser
is available. The viewer owns and disposes these textures alongside the model.

Additive materials remain depth-tested, disable depth writes, and sort after
translucent bodies. Source 2 translucency retains depth writes. Alpha cutouts
retain their glTF alpha test, backface flags retain `doubleSided`, and unlit
materials use `KHR_materials_unlit`. Static opacity scale travels in the glTF
base-color alpha. Live Foundry paint runs on the sampled albedo before authored
color correction and tint; shader hooks and program cache keys compose.

The viewer accepts only the current metadata schema and removes a glTF fallback
tint only when its value matches the exporter-owned linear tint. Missing masks,
invalid reflectivity, unsupported tint modes, dynamic color parameters, and
other shader families keep the fallback color path. Old GLBs retain their normal
glTF behavior. Materials with no decodable albedo still use the exporter's
existing fallback. Texture scrolling/transforms, full NPR lighting, glass/sheen,
and dynamic material evaluation remain outside this integration. Particle model
material overrides have their own renderer and are unchanged.

The color math and draw-state behavior follow the research in
[Grimoire preview research](../../../../../.research/grimoire-preview-recolor.md),
[Grimoire color correction](https://github.com/Slush97/grimoire/blob/1722ba9ec337b8de9e755645710c2e3fbc506e4c/src/lib/source2ColorCorrection.ts),
and the local ValveResourceFormat renderer reference. Grimoire's MIT notice is
retained in [LICENSE.grimoire](./LICENSE.grimoire); the Rust crate retains VRF's
notice. Preview lighting remains an approximation, with no claim of game parity.

Validation covers color math, tint ownership/fallback guards, draw state, texture
lifetime, and Rust-to-GLB metadata/texture indices. The implementation was also
checked against a fresh Haze export from the installed game and eight expanded
Basic/Standard shader variants with and without masks and alternate vertex-color
ordering. These checks establish data/shader validity, not visual parity in a
packaged Tauri build.

Performance paths skip masks that cannot affect the material (white multiplicative
tint with no masked vertex color) and skip the color shader for uncolored,
identity-tint, identity-correction materials. Vertex-colored and tinted materials
retain their masks. The hero effect adapter advances particle simulation at each
fixed step but builds render buffers only in the viewer's final zero-delta draw
update; camera-only and paused frames still refresh billboards.

Asset grid thumbnails use a separate compiled-model cache and decode texture mips
at a maximum side of 256 pixels, keeping foreground previews at 1024 pixels.
Model geometry and material metadata remain unchanged. Background model parsing
yields to input, and thumbnail PNG capture uses the asynchronous canvas encoder.
Captures from a replaced or closed stage are discarded.

Thumbnail images fill an absolutely positioned layer inside their existing 4:3
frames. Keeping loaded image dimensions out of the grid's intrinsic sizing avoids
repeated layout stalls as thumbnails arrive in WebKit. Removing that positioning
reproduces progressively longer frames during generation, even for tiny models;
shader compilation and GLB parsing do not account for those pauses.

## Workbench material editing

Workbench's **Edit model** uses the latest compiled VMDL and its exact material
identities (`extras.sourceMaterial`). A new source model needs one compile first;
source geometry changes must be compiled before editing parts. Visibility affects
all embedded draw calls for the chosen material, including their outlines in the
preview. It preserves animation and geometry buffers.

Tint multiplies albedo in linear RGB. Recolor sets an absolute hue and scales
saturation/brightness in linear RGB HSV; neutral pixels retain their hue. Both
operate before authored Source 2 color correction. Roughness and metalness replace
their packed texture channels with uniform values while preserving the other
channels, including transparency alpha. Opaque PBR metalness lives in color alpha;
translucent/cutout materials require a dedicated metalness map. Shader/dynamic
bindings and texture formats determine which controls are available. HDR, YCoCg,
padded textures, cubemaps and textures above 16 megapixels are not editable.

Save writes compiled overrides into the addon's Game tree, cloning textures per
material so shared masks stay intact. Original model/material bytes and a versioned
recipe live under Content's `.dmm-model-editor/`. Restore all originals is a draft
operation until Save; it restores original local files and removes overrides that
originally came from the game VPK. Compile reapplies recipes before packing, adopting
new compiler outputs as baselines. Cached edited textures avoid repeated BCn
encoding when inputs and edits are unchanged. BCn bakes use lossy compression. Changes to shared materials affect
other models using those materials in the addon, including their saved recipes.

This is DMM-managed editing: source VMAT/DMX files are unchanged, and the hidden
recipe directory must travel with the addon to preserve edits through future DMM
compiles. Compilation outside DMM does not reapply recipes. External output changes
and stale editor fingerprints block saves. The editor supports embedded material
groups, not arbitrary vertex selection, mesh sculpting, or source animation editing.

## Compiled model cloth

Some recompiled game models retain the cloth bones but lose their embedded FE
simulation. The preview can borrow the original setup, so a working preview alone
does not establish that the packed model contains runtime cloth.

DMM's Compile and Pack & Test paths restore missing FE data from the same model
in the base-game archive. Restoration requires the complete skeleton, hierarchy
and model-space bind pose to match; changed rigs fail with a model-specific
diagnostic. Existing authored FE data is retained. Only the FE field, canonical
cloth bone names and cloth-related bone flags are restored. Target collision,
mesh and animation blocks are preserved, as are saved material/visibility edits.
The pre-restoration model is backed up under
`Content/.dmm-model-editor/runtime-cloth-originals/`. Repeated builds leave
unchanged outputs and their timestamps alone. This restores an existing rig's
simulation; it does not author cloth for a new rig or changed clothing geometry.
