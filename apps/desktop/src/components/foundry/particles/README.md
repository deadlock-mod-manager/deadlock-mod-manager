# Source 2 particle previews

The renderer consumes compiled VPCF definitions from the selected skin, with the installed game as a fallback. It does not bundle game assets or substitute procedural celebration effects.

- Rust expands child systems, finds texture/material/model dependencies, decodes PNGs and sprite-sheet metadata, and reads mesh attachments.
- `ParticleSimulation` evaluates the graph's emitters, initializers, operators, constraints, inputs and control points. Particle coordinates stay in Source units.
- `ParticleAttachments` converts the animated GLB skeleton into that coordinate frame, including local attachment transforms. `ModelSurface` samples the live skinned mesh for body effects.
- Renderers draw instanced textured sprites, trails, spline ribbons, particle models and lights. Texture layers retain their masks, blend modes, gradients and distortion controls.
- The Workbench viewer supplies the animation clock and cast/release timing. Ambient effects, animated material UVs and PBR vertex jitter share playback, pause and seek with the model.
- Hero ability slots come from the installed `heroes.vdata_c`, with addon overrides taking precedence. The online roster only enriches names and icons. Ability effect references are discovered recursively; field semantics select caster effects automatically, and the effects picker exposes target, projectile and unclassified references for explicit preview.
- Material discovery follows the model's visible external meshes as well as embedded meshes. Particle material dependencies are expanded recursively and engine-default sprite/trail textures are loaded when omitted from compiled definitions.

This is a preview renderer, not full Source 2 rendering parity. Projected particles, volumetric light beams, animation motion-vector interpolation and advanced PBR effect-material features are incomplete. Unsupported operations and unavailable assets are collected in the preview warning; unsupported model material features are skipped. Budgets cap each system at 512 particles and dependency graphs at 128 systems.

Tests cover inputs, deterministic emission, child control-point inheritance, attachment transforms, animated surface binding, material motion and disposal. Validate native previews against the selected addon and base-game assets without installing a mod or launching the game.

Operator semantics and texture-layer behavior were researched against [Source 2 Viewer](https://github.com/ValveResourceFormat/ValveResourceFormat). Its MIT notice is included in `LICENSE.source2-viewer`.
