# Workbench material authoring

This extends the addon-local native appearance recipes. It does not rebuild model geometry, skeletons, AG2 clips or cloth. Shader parameters and dynamic expressions are patched in compiled VMAT resources; patterns and constant-mask overrides get separate VTEX variants. Originals and the complete recipe remain available for restore and subsequent builds.

References inspected on 2026-10-27:

- [Grimoire paint guide](https://www.grimoiremods.com/docs/locker-effects/): body/gun patterns are baked into textures and animated through material scrolling, rather than freehand geometry painting.
- [vpkmerge material styling](https://github.com/Slush97/vpkmerge/blob/d70672e96a433cfcc507eab3b2808cc4d74dc693/vpkmerge-core/src/vmat_style.rs): static shader parameters, native expressions and render-attribute registration.
- [vpkmerge expression codec](https://github.com/Slush97/vpkmerge/blob/d70672e96a433cfcc507eab3b2808cc4d74dc693/morphic/src/vfx_expr.rs): bytecode compiler/decompiler, adapted under MIT into DMM.
- [vpkmerge compressed KV3 writer](https://github.com/Slush97/vpkmerge/blob/d70672e96a433cfcc507eab3b2808cc4d74dc693/morphic/src/kv3/wire.rs): native compressed v5 encoding. DMM bridges its existing encoding metadata to this writer when numeric literal promotion or a v4 expression insertion requires a structural rewrite. RERL and other resource blocks stay intact.
- [Shader survey](https://github.com/Slush97/vpkmerge/blob/d70672e96a433cfcc507eab3b2808cc4d74dc693/docs/spike-npr-toon-shading.md): distinguish material parameters from speculative engine/global attributes. This editor does not inject the speculative global NPR controls.

The installed Deadlock client contains `$ent_health` and `$ent_age` string tokens. Their presence does not establish universal values or availability on every renderable. Custom ability attribute names must come from the game's actual material/entity bindings. Expressions register their read attributes in `m_renderAttributesUsed`; that registration alone cannot make an engine input exist.

The preview evaluates a bounded subset of the native expression grammar without JavaScript evaluation. It exposes simulated inputs, not live-match integration. Unsupported preview expressions retain the compiled native export path and report that the preview grammar is limited. Health/ability behavior and status-effects proxy/veil interactions require an in-game check.

The toon starting point follows the user's Beyonx screenshots: NPR enabled, Unlit disabled, status-effects proxy enabled, flat normal constant, roughness 1, metalness 0, white AO/emission masks, self-illumination scale 10, Fresnel exponent .001 and albedo brightness .1. Only supported bindings are included. This is a starting recipe, not a guarantee of identical appearance on every material. NPR highlight, Fresnel, mask and proxy behavior are approximate in the Three.js preview.

A 1×1 material constant cannot hold a detailed procedural pattern. Pattern variants for stored images smaller than 128px are expanded to a separate 256×256 PNG-backed VTEX; the original is unchanged. Other edits keep original dimensions/mips and packed alpha. Expanded variants currently have one mip; original large textures retain their existing mip chains.
