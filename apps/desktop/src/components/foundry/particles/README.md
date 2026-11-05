# Source 2 particle previews

The renderer consumes compiled VPCF definitions from the selected skin, with the installed game as a fallback. It does not bundle game assets or substitute procedural celebration effects.

- Rust expands child systems, finds texture/material/model dependencies, decodes PNGs and sprite-sheet metadata, and reads mesh attachments.
- `ParticleSimulation` evaluates the graph's emitters, initializers, operators, constraints, inputs and control points. Particle coordinates stay in Source units.
- `ParticleAttachments` converts the animated GLB skeleton into that coordinate frame, including local attachment transforms. `ModelSurface` samples the live skinned mesh for body effects.
- Renderers draw instanced textured sprites, trails, spline ribbons, particle models and lights. Texture layers retain their masks, blend modes, gradients and distortion controls.
- The Workbench viewer supplies the animation clock and cast/release timing. Ambient effects, animated material UVs and PBR vertex jitter share playback, pause and seek with the model.
- Hero ability slots come from the installed `heroes.vdata_c`, with addon overrides taking precedence. The online roster only enriches names and icons. Ability effect references are discovered recursively; field semantics select caster effects automatically, and the effects picker exposes target and unclassified references for explicit preview. Primary projectile definitions load their model/texture dependencies and play timed emissions with authored speed/count/rate, source attachment, spawn radius and impact roots. First-person/local effects stay in the picker instead of overlapping world effects.
- Material discovery follows the model's visible external meshes as well as embedded meshes. Particle material dependencies are expanded recursively and engine-default sprite/trail textures are loaded when omitted from compiled definitions.

Animated model particles can use independently sampled skeletal clips or embedded legacy float/flex animation. Native morph decoding preserves compacted vertex remaps, decodes position/normal atlas deltas and exports glTF morph tracks. Direct flex-controller fetch rules are supported; complex flex expressions and multiple embedded morph meshes are reported as unavailable.

This is a preview renderer, not full Source 2 rendering parity. Projected particles currently use a floor receiver rather than scene-depth decals. Beam tube lights use two bounded point-light samples, without adding invented beam geometry. Projectile flight uses a straight preview trajectory rather than gameplay homing/collision; situational gain/hit events require explicit playback. Animation motion-vector interpolation, screen-space refraction and advanced PBR effect-material features remain incomplete. Unsupported operations and unavailable assets are collected in the preview warning; unsupported model material features are skipped. Budgets cap each system at 512 particles and dependency graphs at 128 systems.

Tests cover projectile scheduling/readiness, isolated morph poses, Source orientation offsets, impact lifecycle, inputs, deterministic emission, child control-point inheritance, attachment transforms, animated surface binding, material motion and disposal. Validate native previews against the selected addon and base-game assets without installing a mod or launching the game.

Operator semantics and texture-layer behavior were researched against [Source 2 Viewer](https://github.com/ValveResourceFormat/ValveResourceFormat). Its MIT notice is included in `LICENSE.source2-viewer`.
