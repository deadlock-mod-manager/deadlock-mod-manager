# Deadlock Playground port

Reference clone: `/home/gabriel/Coding/deadlock-playground.reference`.
Inspected revision: `181521b2ef4e62d2584f82ce706df124275c6d87`.
Upstream: https://github.com/juliancz-a/deadlock-playground

The application is Godot 4.7.2 / C# / .NET 10, with ValveResourceFormat 20.1.7467. Its Godot UI, resource types and Vulkan compute dispatch are not directly usable in the Tauri webview. DMM retains its Rust asset/installation ownership and Three.js viewport.

## Implemented first slice

- Native paint documents: named layers with stable identities, visibility, opacity, Normal/Multiply/Screen/Overlay compositing, brush radius/hardness/opacity, replayable UV strokes and erasing.
- Rust owns authoritative rasterization and compositing. Stroke coverage uses a maximum mask to avoid darkening caused solely by denser input samples. Color compositing uses linear light; original packed alpha is preserved.
- The Workbench UV canvas records normalized points and draws a temporary stroke guide. Debounced Tauri previews return a 256×256 RGBA texture for the canvas and model. Pointer moves do not serialize a model history snapshot or invoke Rust on every frame.
- Documents are persisted in the existing reversible material recipe. Save generates a separate VTEX variant and redirects its VMAT binding; it does not rebuild model geometry, skeletons or animations. Existing originals, incremental signatures, restore and Pack & Test behavior remain the owning pipeline.
- Playground's half-Lambert/two-tone light, shadow tint, rim and roughness-dependent specular math is adapted to Three.js's direct-light interface. Explicit NPR edits use this preview; translucent/additive materials retain their current path. This does not reproduce Valve's full engine shader or gameplay status proxies.

## Upstream references and notices

- `src/tools/scripts/painter/SkinLayer.cs` and `SkinLayerManager.cs`: layer data and immutable base concept.
- `src/assets/shaders/painter/layer_composite.gdshader`: blend equations.
- `src/addons/gpu_texture_painter/brush/brush_compute.glsl`: reference brush projection, masks and depth rejection. The first Rust port is UV painting, not that Vulkan compute shader.
- `src/assets/shaders/toon_shader.gdshader`: adapted preview lighting equations.
- `src/tools/scripts/painter/SkinExporter.cs`: texture interception without model recompilation. DMM uses its existing transactional native export rather than upstream's direct installation into game addons.

Root code is MIT, copyright 2026 Julián Caceres. Full notices are retained beside the native painting and frontend shader code as `LICENSE.deadlock-playground`. The GPU painter addon has its own MIT notice, copyright 2025 Anton Hörig; it has not been copied into DMM. No Vecteezy textures or game assets are imported by this port.

## Remaining slices

1. Paint directly on the animated model with UV-space projection and depth/seam isolation.
2. UV wireframe, selection masks, feathering, decals and text projection.
3. Tile-based stroke history and GPU compositing for larger documents; the first slice uses bounded CPU replay and the existing material undo history.
4. Broader native parameter-to-preview mapping and comparisons against the actual game. Playground's custom shader is a reference, not an accuracy oracle.

The first slice limits documents to 8 layers, 128 strokes, 4096 input points and 32768 interpolated stamps. The model recipe retains its existing 1 MB manifest limit. These are bounded initial authoring limits rather than unlimited Photoshop-style documents.

## Viewport performance pass

Playground's `UserSettings.cs` defaults to a 60 FPS cap and exposes MSAA/shadow quality. `SkinLayer.cs` requests one-shot redraws for changed paint layers, while its compute painter keeps working buffers on the GPU. Those are useful techniques, but its Godot `SubViewport`, scene objects and `RenderingDevice` are not reusable WebGL/Tauri components. No comparative Godot runtime benchmark has been performed.

DMM already skips drawing unchanged model scenes and hidden viewports. This pass adds:

- Auto render resolution bounded to 2,073,600 physical pixels, with Full and Half options in View. CSS size, camera aspect and editor controls remain independent of framebuffer resolution. Full retains the existing device-pixel-ratio cap of 2.
- A 60 Hz render budget on high-refresh displays. Accepted frames use elapsed wall time for the existing fixed-step animation/cloth clock; explicit changes can request an immediate frame.
- Lazy post-processing allocation and a direct-render path when Bloom and post-process anti-aliasing are both off. HDR and SMAA targets are released when unused. Stencil buffers remain available for NPR outlines.
- Physical-pixel sizing avoids resizing every composer target twice per viewport resize.

In the live Haze editor, post-effects-off draw submissions fell from 9 to 8 per frame. The scene remained near 60 FPS before and after, so this is reduced work rather than a demonstrated FPS increase. The default anti-aliasing path remains unchanged visually. Fullscreen checks at a 2560×1440 CSS viewport produced 1920×1080 in Auto, 2560×1440 in Full, and 1280×720 in Half, with the same model framing. The six focused render-budget, clock and idle tests pass, as do desktop type checks and scoped formatting/lint checks. Evidence is in `.verify/desktop/20261028-viewport-budget/`; use `viewport-*-rendered.png` captures taken immediately after drawing, since an idle WebGL canvas capture may be cleared.

A native Rust GPU viewport would require its own surface integration, scene/resource ownership, material shaders, skinning/animation and UI input boundary. That is a separate renderer project; this pass does not embed Godot or claim that WebGL is replaced.

### Bebop interaction regression

The subsequent Bebop check reproduced an intermittent 11 FPS stall during camera interaction while Idle was playing. Stationary idle alone sampled near 60 FPS. The SVG axis gizmo's per-frame attribute mutations and child reordering caused browser layout/compositing stalls. Hiding it or substituting a bitmap restored near 60 FPS; caching layout reads and CSS containment did not fix it. The production gizmo now uses a small 2D canvas with quaternion tolerance, preserving depth ordering and picking. The same zoom probe improved from 10.96 to 59.76 FPS; orbiting measured 59.39 FPS. A browser regression observed 4296 DOM mutations in the cached SVG implementation versus zero for 180 updates of the bitmap implementation. Evidence and rerunnable browser scripts are in `.verify/desktop/20261028-bebop-gizmo/`. These checks cover the reproduced Wry interaction stall, not all CEF or idle-only scenarios.

### Model loading cache

Native artifact caching did not prevent foreground viewports from re-reading and re-parsing GLB/FBX files. The loader now retains immutable parsed scene templates, bounded to four entries/256 MiB estimated decoded resources with 60-second idle expiry. Viewers receive independent geometry, skeletons, materials and texture settings; image lifetime is held by a template lease. Pending loads coalesce, cancellation is per reader, failures can retry, oversized entries bypass retention, and new immutable artifact identities force misses. Background thumbnails do not populate the parsed-scene cache. Cloth, clip-choice and ability metadata now remain cached across short model switches.

Source preview bundles also share repeated named compiled-material image sources across their component meshes/LODs. This reduced Bebop's estimated retained resources from ~534 to ~113 MiB. The warm source preview measured 38 ms for assembly and 344 ms from click to readiness, compared with 2732 ms cold assembly; Haze measured 37/222 ms warm. Native artifact decoding and GPU upload/shader setup are outside the assembly comparison. Twenty focused tests, desktop type checks and scoped lint/format pass. The compiled Bebop editor also reported a cache hit: 371 ms scene assembly and 2242 ms until the visible animated viewport was ready with two editors mounted. Comparison playback paused independently of the primary editor. No model edits were saved or discarded during verification. Evidence and limitations are in `.verify/desktop/20261028-model-cache/`.

### Multiple active viewports

The two-editor Bebop case reproduced a Wry compositor stall at 1.70 FPS despite low animation and draw-call CPU time. Viewports now share a fair browser-frame draw budget; deferred model frames retain elapsed simulation time, and hidden/paused/disposed views release their pending turn. Particle and thumbnail stages use the same budget. Floating controls use nearly opaque surfaces instead of filtering live render layers. The final two-editor Idle sample measured 60.01 UI FPS with p95 18 ms; two busy viewports divide those draw opportunities. No texture or resolution setting was reduced. Thirteen focused tests and desktop type/lint/format checks pass. Cold inspection/shader setup remains separate, and this is a Wry measurement rather than a CEF guarantee. Evidence, unsuccessful clock experiments, and the development hot-reload draft-loss incident are documented in `.verify/desktop/20261028-dual-viewport/`.

## Verification

- Native model-edit suite: 27 passed, one external-fixture test ignored. Painting tests cover interpolation, immutable base alpha, erasing, layer visibility/opacity, linear blend equations, validation budgets, and save/reapply/restore with unchanged model bytes.
- Native VPK material-edit suite: 6 passed. Desktop Clippy passed with existing warnings.
- Desktop TypeScript checks passed. Eight focused frontend tests passed; scoped Oxlint and Oxfmt checks passed.
- Running Tauri app: painted Haze's body material, confirmed the native preview returned the brush color and the model showed it, then undid it. Applied the existing Beyonx preset through the new lighting path with no console errors, then undid it. No addon edits were saved and no game/profile mutations were performed.
- Short focused-window RAF samples measured 55.2 FPS with the toon preset and 59.7 FPS after Undo. These are observations for this Haze scene, not a general benchmark.
- Evidence: `.verify/desktop/20261027-model-editor/rpc-1072.json` through `rpc-1085.json`, `playground-painted-haze-visible.png` and `playground-toon-haze.png`. The paint stroke used synthetic pointer events through the actual React handlers with pointer-capture temporarily shimmed; physical pointer capture remains a manual check. The first paint capture selected an offscreen thumbnail and is not evidence of model output; use the `-visible` image.
