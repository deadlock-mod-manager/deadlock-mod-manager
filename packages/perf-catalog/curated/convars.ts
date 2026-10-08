/**
 * Human layer for the convars presets use most. Descriptions say what the
 * setting does and what changes on screen; they never promise frame rates or
 * call anything safe. Sources: Valve's help text, upstream configs' inline
 * comments (OptimizationLock, OptiLock), the OptimizationLock README FAQ and
 * DeadTune's curated notes (GPL-3.0, simulieren/deadtune).
 */
interface CuratedConvar {
  label: string;
  description: string;
  /** Visible consequences players report. */
  sideEffects?: string;
}

const UNDOCUMENTED = "Valve doesn't document this setting.";

export const CURATED_CONVARS = new Map(
  Object.entries({
    // Shadows
    lb_enable_shadow_casting: {
      label: "Light shadows",
      description:
        "Lets stationary and dynamic lights cast shadows. Off, lamps and ability lights light the scene without shadows.",
    },
    r_shadows: {
      label: "Shadows (master switch)",
      description: "Master switch for shadow rendering.",
    },
    r_citadel_shadow_quality: {
      label: "Shadow quality",
      description:
        "The in-game Shadow quality setting: 0 Low, 1 Med, 2 High, 3 Ultra. Your menu choice is saved in video.txt and wins over gameinfo.gi.",
    },
    lb_csm_draw_alpha_tested: {
      label: "Foliage and fence sun shadows",
      description:
        "Includes alpha-tested geometry (leaves, fences, grates) in sun shadows. Off, those objects stop casting sun shadows.",
    },
    lb_csm_draw_translucent: {
      label: "Translucent sun shadows",
      description:
        "Includes translucent objects in sun shadows. Off, glass-like and translucent surfaces stop casting them.",
    },
    sparseshadowtree_enable_rendering: {
      label: "Sparse shadow tree",
      description:
        "Renders static geometry into the sun shadow cascades through the sparse shadow tree (SST) instead of redrawing it every frame.",
    },
    sparseshadowtree_disable_for_viewmodel: {
      label: "No SST for first-person models",
      description:
        "Uses regular cascaded shadow rendering for first-person models instead of the sparse shadow tree. On by default.",
    },
    lb_enable_baked_shadows: {
      label: "Baked shadows",
      description:
        "Uses the map's precomputed (baked) shadows. Upstream notes the map looks brighter when this is off while stationary lights stay on.",
    },
    lb_enable_fog_mixed_shadows: {
      label: "Shadows in fog",
      description:
        "Lets mixed-light shadows affect volumetric fog. Off, fog is lit without those shadows.",
    },
    lb_mixed_shadows: {
      label: "Mixed light shadows",
      description:
        "Shadows from lights that combine baked and dynamic lighting. Off, those lights only use their baked contribution.",
    },
    lb_precomputed_shadowmap_enable: {
      label: "Precomputed shadow maps",
      description: "Uses precomputed shadow maps for static lights.",
    },
    lb_dynamic_shadow_penumbra: {
      label: "Soft shadow edges",
      description:
        "Widens shadow penumbras with the size of the light. Off, light shadows keep hard edges.",
    },
    lb_dynamic_shadow_resolution: {
      label: "Dynamic shadow resolution",
      description:
        "Lets the engine scale each light's shadow map resolution with its size on screen.",
    },
    lb_dynamic_shadow_resolution_quantization: {
      label: "Shadow size step",
      description:
        "Step size used when dynamically sizing shadow maps, in pixels.",
    },
    lb_dynamic_shadow_resolution_base: {
      label: "Dynamic shadow base resolution",
      description:
        "Shadow map size for a light that fills the screen; smaller lights scale down from it. Lower values make light shadows blockier.",
    },
    lb_barnlight_shadowmap_scale: {
      label: "Spotlight shadow resolution scale",
      description:
        "Scales the computed shadow map size of barn (spot) lights. Lower values make their shadows blockier; 0 leaves them without detail.",
    },
    lb_csm_cascade_size_override: {
      label: "Sun shadow cascade size",
      description:
        "Overrides the width and height of each sun shadow cascade. -1 uses the engine's size; tiny values make sun shadows unusable.",
    },
    lb_csm_override_staticgeo_cascades: {
      label: "Override static geometry cascades",
      description:
        "Picks which sun shadow cascades render static geometry, using lb_csm_override_staticgeo_cascades_value.",
    },
    lb_csm_override_staticgeo_cascades_value: {
      label: "Static geometry cascades",
      description:
        "Which cascades render static objects when lb_csm_override_staticgeo_cascades is on. -1 uses the engine default.",
    },
    lb_csm_cross_fade_override: {
      label: "Cascade cross-fade",
      description:
        "Overrides how far neighbouring sun shadow cascades blend into each other. -1 uses the engine default; 0 gives hard seams.",
    },
    lb_csm_distance_fade_override: {
      label: "Sun shadow distance fade",
      description:
        "Overrides how sun shadows fade out at the edge of their range. -1 uses the engine default.",
    },
    lb_csm_receiver_plane_depth_bias: {
      label: "Sun shadow depth bias",
      description:
        "Depth bias applied to surfaces receiving sun shadows. Too low causes shadow acne, too high detaches shadows from objects.",
    },
    lb_csm_receiver_plane_depth_bias_transmissive_backface: {
      label: "Sun shadow bias (transmissive)",
      description:
        "Depth bias for the back faces of transmissive geometry receiving sun shadows.",
    },
    lb_sun_csm_size_cull_threshold_texels: {
      label: "Sun shadow small-object cull",
      description:
        "Objects smaller than this many shadow-map texels don't cast sun shadows. Higher values drop shadows from more small objects.",
    },
    lb_shadow_map_cull_empty_mixed: {
      label: "Skip empty mixed shadow maps",
      description:
        "Skips rendering mixed-light shadow maps when no dynamic object is in view of the light.",
    },
    lb_shadow_texture_width_override: {
      label: "Shadow atlas width",
      description:
        "Width of the shadow atlas in pixels. -1 uses the engine default; small values make shadows blocky.",
    },
    lb_shadow_texture_height_override: {
      label: "Shadow atlas height",
      description:
        "Height of the shadow atlas in pixels. -1 uses the engine default; small values make shadows blocky.",
    },
    csm_max_num_cascades_override: {
      label: "Sun shadow cascades",
      description:
        "Number of sun shadow cascades. -1 uses the engine default; fewer cascades means less shadow detail at range and 0 means no sun shadows.",
    },
    csm_max_shadow_dist_override: {
      label: "Sun shadow distance",
      description: "How far sun shadows reach.",
    },
    csm_max_visible_dist: {
      label: "Sun shadow visible distance",
      description: "Distance beyond which sun shadows are not drawn.",
    },
    csm_max_dist_between_caster_and_receiver: {
      label: "Sun shadow caster pushback",
      description:
        'How far behind the receiver a shadow caster can be and still cast onto it (Valve: "default pushback"). 0 drops most long sun shadows.',
    },
    csm_res_override_0: {
      label: "Cascade 0 resolution",
      description:
        "Overrides the resolution of the nearest sun shadow cascade. 0 uses the engine default.",
    },
    csm_res_override_1: {
      label: "Cascade 1 resolution",
      description:
        "Overrides the resolution of the second sun shadow cascade. 0 uses the engine default.",
    },
    csm_res_override_2: {
      label: "Cascade 2 resolution",
      description:
        "Overrides the resolution of the third sun shadow cascade. 0 uses the engine default.",
    },
    csm_res_override_3: {
      label: "Cascade 3 resolution",
      description:
        "Overrides the resolution of the farthest sun shadow cascade. 0 uses the engine default.",
    },
    csm_cascade0_override_dist: {
      label: "Cascade 0 distance",
      description:
        "Overrides how far the nearest sun shadow cascade reaches. -1 uses the engine default.",
    },
    csm_cascade1_override_dist: {
      label: "Cascade 1 distance",
      description:
        "Overrides how far the second sun shadow cascade reaches. -1 uses the engine default.",
    },
    csm_cascade2_override_dist: {
      label: "Cascade 2 distance",
      description:
        "Overrides how far the third sun shadow cascade reaches. -1 uses the engine default.",
    },
    csm_cascade3_override_dist: {
      label: "Cascade 3 distance",
      description:
        "Overrides how far the farthest sun shadow cascade reaches. -1 uses the engine default.",
    },
    csm_viewmodel_shadows: {
      label: "First-person model shadows",
      description:
        "Sun shadows cast by first-person models (weapons and hands).",
    },
    csm_viewmodel_max_shadow_dist: {
      label: "First-person shadow distance",
      description: "How far first-person model shadows reach.",
    },
    csm_viewmodel_max_visible_dist: {
      label: "First-person shadow visible distance",
      description:
        "Distance beyond which first-person model shadows are not drawn.",
    },
    r_size_cull_threshold_shadow: {
      label: "Shadow small-object cull",
      description:
        "Objects smaller than this percentage of the shadow map are left out of it. Higher values drop shadows from more objects.",
    },
    sc_instanced_mesh_size_cull_bias_shadow: {
      label: "Instanced mesh shadow cull bias",
      description:
        "Bias for leaving small instanced meshes (foliage, clutter) out of shadow maps. Higher values drop more of their shadows.",
    },
    sc_instanced_mesh_lod_bias_shadow: {
      label: "Instanced mesh shadow LOD bias",
      description:
        "Level-of-detail bias for instanced meshes drawn into shadow maps. Higher values use simpler models for their shadows.",
    },
    sc_disable_spotlight_shadows: {
      label: "Disable spotlight shadows",
      description: "Skips spotlight shadow rendering.",
    },
    r_citadel_distancefield_shadows: {
      label: "Distance-field shadows",
      description: "Soft shadows ray-marched through distance fields.",
    },
    r_citadel_sun_shadow_slope_scale_depth_bias: {
      label: "Sun shadow slope bias",
      description:
        "Slope-scaled depth bias for sun shadows. Lower values can cause shadow acne on sloped surfaces.",
    },
    r_citadel_gpu_culling_shadows: {
      label: "GPU culling for shadows",
      description: "Culls shadow casters on the GPU.",
    },
    r_particle_cables_cast_shadows: {
      label: "Cable particle shadows",
      description: "Lets cable and rope particle effects cast shadows.",
    },
    r_hair_shadowtile: {
      label: "Hair shadow tiles",
      description:
        "Hair shadowing pass. Off, hero hair loses its self-shadowing.",
    },
    sc_disable_shadow_materials: {
      label: "Disable shadow materials",
      description:
        "Not in Valve's current convar dump; configs set it to skip special shadow materials.",
    },
    cl_globallight_shadow_mode: {
      label: "Global light shadow mode",
      description:
        "Not in Valve's current convar dump; configs set 0 to turn off sun shadows.",
    },
    mat_depthbias_shadowmap: {
      label: "Shadow map depth bias",
      description: "Not in Valve's current convar dump.",
    },
    mat_slopescaledepthbias_shadowmap: {
      label: "Shadow map slope bias",
      description: "Not in Valve's current convar dump.",
    },
    lb_allow_time_sliced_shadow_map_rendering: {
      label: "Time-sliced shadow maps",
      description:
        "Spreads shadow map rendering over several frames. Not in Valve's current convar dump.",
    },

    // Lighting & fog
    lb_enable_stationary_lights: {
      label: "Stationary lights",
      description:
        "Renders stationary (mixed) lights. Off, the map looks flatter.",
    },
    lb_enable_dynamic_lights: {
      label: "Dynamic lights",
      description:
        "Lights from abilities, effects, the shop and other moving sources.",
      sideEffects:
        "Upstream FAQ: off makes hero portraits dark in the shop and end screen.",
    },
    lb_enable_lights: {
      label: "Light binner lights",
      description: "Master switch for lights handled by the light binner.",
    },
    lb_enable_sunlight: {
      label: "Sunlight",
      description:
        "Direct light from the sun. Off, outdoor areas lose their main light source.",
    },
    lb_max_visible_barn_lights_override: {
      label: "Max visible spotlights",
      description:
        "Caps how many barn (spot) lights are visible at once. -1 means no cap.",
      sideEffects:
        "Upstream notes it affects lights in the hideout and hero silhouettes.",
    },
    lb_max_visible_envmaps_override: {
      label: "Max visible reflections",
      description:
        "Caps how many environment-map reflections are visible at once. -1 means no cap.",
    },
    lb_enable_envmaps: {
      label: "Environment maps",
      description:
        "Environment-map reflections. DeadTune notes characters render black without them.",
    },
    lb_cubemap_normalization_roughness_begin: {
      label: "Cubemap normalization roughness",
      description:
        "Roughness at which cubemap reflections start being normalized against lightmaps.",
    },
    lb_ssss_samples: {
      label: "Subsurface scattering samples",
      description:
        "Sample count for screen-space subsurface scattering on skin. The engine clamps it to 3..15.",
    },
    cl_retire_low_priority_lights: {
      label: "Drop low-priority lights",
      description:
        "Replaces low-priority dynamic lights with high-priority ones instead of rendering both.",
    },
    r_rendersun: {
      label: "Render sun",
      description: "Renders sun lighting.",
    },
    r_directlighting: {
      label: "Direct lighting",
      description: "Direct lighting pass.",
      sideEffects:
        "Upstream notes characters turn black in the shop when it's off.",
    },
    r_directional_lightmaps: {
      label: "Directional lightmaps",
      description:
        "Uses the directional part of lightmaps for normal-mapped lighting. Off, baked lighting looks flatter.",
    },
    r_lightmap_size: {
      label: "Max lightmap resolution",
      description:
        "Maximum lightmap resolution. Lower values make baked lighting blurrier.",
    },
    r_lightmap_size_directional_irradiance: {
      label: "Directional lightmap resolution",
      description:
        "Maximum resolution of the directional irradiance lightmap channel. -1 uses r_lightmap_size.",
    },
    r_lightmap_bicubic_filtering: {
      label: "Bicubic lightmap filtering",
      description: "Not in Valve's current convar dump.",
    },
    r_light_flickering_enabled: {
      label: "Flickering lights",
      description: "Flickering light effects where the map uses them.",
    },
    r_arealights: {
      label: "Area lights",
      description:
        "The in-game Area lights setting. Your menu choice is saved in video.txt and wins over gameinfo.gi.",
    },
    r_distancefield_enable: {
      label: "Distance fields",
      description:
        "Distance-field rendering, which several lighting, shadow and occlusion effects build on.",
    },
    r_citadel_distancefield_farfield_enable: {
      label: "Distance-field far field",
      description: "Distance-field effects at long range.",
    },
    r_citadel_distancefield_blur: {
      label: "Distance-field blur",
      description: "Blur pass on distance-field effects.",
    },
    r_citadel_distancefield_down_sample: {
      label: "Distance-field downsample",
      description: "Downsample factor for distance-field effects, 0 to 2.",
    },
    r_citadel_fog_quality: {
      label: "Fog quality",
      description:
        "The in-game Fog quality setting: 0 Low, 1 High. Your menu choice is saved in video.txt and wins over gameinfo.gi.",
    },
    fog_enable: {
      label: "Fog",
      description:
        "Master switch for fog. Removing fog changes how far you can see.",
    },
    fog_enableskybox: {
      label: "Skybox fog",
      description: "Not in Valve's current convar dump.",
    },
    r_enable_volume_fog: {
      label: "Volumetric fog",
      description: "Volumetric fog.",
    },
    r_enable_gradient_fog: {
      label: "Gradient fog",
      description: "Height and distance gradient fog.",
    },
    r_enable_cubemap_fog: {
      label: "Cubemap fog",
      description: "Fog colored from a cubemap.",
    },
    volume_fog_intermediate_textures_hdr: {
      label: "HDR fog buffers",
      description:
        "Stores volumetric fog's intermediate textures in HDR formats.",
    },
    volume_fog_enable_jitter: {
      label: "Fog jitter",
      description:
        "Jitters volumetric fog samples between frames to hide banding.",
    },
    r_async_compute_fog: {
      label: "Async compute fog",
      description: "Not in Valve's current convar dump.",
    },
    vis_sunlight_enable: {
      label: "Sunlight visibility set",
      description:
        "Uses the sunlight PVS for sunlight views instead of the sky PVS.",
    },
    mat_max_lighting_complexity: {
      label: "Max lighting complexity",
      description: "Cap on shader lighting complexity.",
    },
    sc_cache_envmap_lpv_lookup: {
      label: "Cache reflection probe lookups",
      description:
        "Caches which environment map and light probe each object samples.",
    },
    r_aoproxy_cull_dist: {
      label: "AO proxy cull distance",
      description:
        "Distance, as a factor of object size, beyond which ambient occlusion proxies are culled.",
    },
    r_multiscattering: {
      label: "Multiscattering",
      description: "Not in Valve's current convar dump.",
    },
    r_citadel_disable_npr_lighting: {
      label: "Disable stylized lighting",
      description: "Not in Valve's current convar dump.",
    },
    r_environment_map_roughness_range: {
      label: "Reflection roughness range",
      description:
        "Roughness range over which lightmapped surfaces fade from environment maps to lightmap-only lighting.",
    },

    // Post-processing
    r_ssao: {
      label: "Screen-space ambient occlusion",
      description: "Contact shadows in corners and creases.",
    },
    r_citadel_ssao_quality: {
      label: "SSAO quality",
      description:
        "The in-game Screen space AO setting: 0 Off to 4 Ultra. Your menu choice is saved in video.txt and wins over gameinfo.gi.",
    },
    r_ssao_strength: {
      label: "SSAO strength",
      description:
        "Strength of screen-space ambient occlusion. 0 removes its contribution.",
    },
    r_ssao_blur: {
      label: "SSAO blur",
      description:
        "Blur pass that smooths screen-space ambient occlusion. Off, AO looks noisier.",
    },
    r_hair_ao: {
      label: "Hair ambient occlusion",
      description: "Ambient occlusion pass for hair.",
    },
    r_citadel_ssao_thin_occluder_compensation: {
      label: "SSAO thin occluder compensation",
      description: "Not in Valve's current convar dump.",
    },
    r_citadel_ssao_bent_normals: {
      label: "SSAO bent normals",
      description: "Not in Valve's current convar dump.",
    },
    r_citadel_ssao_denoise_passes: {
      label: "SSAO denoise passes",
      description: "Not in Valve's current convar dump.",
    },
    r_citadel_ssao_radius: {
      label: "SSAO radius",
      description: "Not in Valve's current convar dump.",
    },
    r_citadel_distancefield_ao_quality: {
      label: "Distance-field AO quality",
      description: "Quality of ambient occlusion from distance fields.",
    },
    r_effects_bloom: {
      label: "Effects bloom",
      description:
        "The in-game Effects bloom setting: glow around abilities and particles. Your menu choice is saved in video.txt and wins over gameinfo.gi.",
    },
    r_post_bloom: {
      label: "Post-process bloom",
      description:
        "The in-game Post process bloom setting. Your menu choice is saved in video.txt and wins over gameinfo.gi.",
    },
    mat_tonemap_bloom_scale: {
      label: "Tonemap bloom scale",
      description:
        "Scale on bloom in tonemapping. -1 uses the map's value; 0 removes it.",
    },
    r_depth_of_field: {
      label: "Depth of field",
      description:
        "The in-game Depth of field setting. Your menu choice is saved in video.txt and wins over gameinfo.gi.",
    },
    r_citadel_depthoffield_enable: {
      label: "Depth of field (Citadel)",
      description: "Deadlock's depth-of-field pass.",
    },
    r_citadel_antialiasing: {
      label: "Anti-aliasing",
      description:
        "The in-game Anti-aliasing setting: 0 None, 1 FXAA. Your menu choice is saved in video.txt and wins over gameinfo.gi.",
    },
    mat_colorcorrection: {
      label: "Color correction",
      description:
        "The map's color grading. Off, the game looks less saturated.",
    },
    mat_colcorrection_disableentities: {
      label: "Disable color correction entities",
      description: "Ignores color-correction entities placed in the map.",
    },
    r_postprocess_enable: {
      label: "Post-processing",
      description: "Master switch for post-processing.",
      sideEffects: "Upstream notes the game looks grey without it.",
    },
    r_low_latency: {
      label: "NVIDIA Reflex / AMD Anti-Lag 2",
      description:
        "0 off, 1 on, 2 on with boost (NVIDIA only). Shown in the menu as NVIDIA Reflex.",
    },
    mat_viewportscale: {
      label: "Render scale",
      description:
        "Renders the 3D view at this fraction of the output resolution. The in-game Render quality slider writes it to video.txt, which wins over gameinfo.gi.",
    },
    sc_hdr_enabled_override: {
      label: "HDR rendering",
      description:
        "Overrides HDR rendering: -1 default, 0 no HDR, 1 to 3 HDR buffer formats. 0 changes how bright areas and colors look.",
    },
    r_light_sensitivity_mode: {
      label: "Reduce flashing effects",
      description: "The in-game Reduce flashing effects accessibility setting.",
    },
    panorama_disable_blur: {
      label: "Disable UI blur",
      description: "Turns off blur effects in the interface.",
    },
    r_citadel_enable_pano_world_blur: {
      label: "Shop world blur",
      description:
        "Blurs the world behind the shop. Not in Valve's current convar dump.",
      sideEffects:
        "Upstream notes visual issues with the pause menu on NVIDIA with Vulkan when it's off.",
    },

    // Particles & effects
    r_physics_particle_op_spawn_scale: {
      label: "Physics particle spawns",
      description:
        "Scale on particles spawned by physics operators. 0 stops those spawns.",
    },
    cl_particle_sim_fallback_threshold_ms: {
      label: "Particle fallback threshold",
      description:
        "Particle simulation time per frame, in milliseconds, after which new effects start using cheaper fallback versions. Lower values switch sooner.",
    },
    cl_particle_sim_fallback_base_multiplier: {
      label: "Particle fallback aggressiveness",
      description:
        "How aggressively effects switch to fallbacks the further simulation time goes over the threshold. Higher is more aggressive.",
    },
    cl_particle_fallback_base: {
      label: "Particle fallback base",
      description: "Base level for falling back to cheaper effects under load.",
    },
    cl_particle_fallback_multiplier: {
      label: "Particle fallback multiplier",
      description: "Multiplier for falling back to cheaper effects under load.",
    },
    cl_particle_batch_mode: {
      label: "Particle batch mode",
      description:
        "How particle systems are batched. Upstream notes 2 makes Celeste's auto rebound look wrong and 0 stops batching.",
    },
    cl_particle_max_count: {
      label: "Max particles",
      description:
        "Caps the number of particles alive at once. Low values make effects incomplete.",
    },
    r_particle_max_texture_layers: {
      label: "Particle texture layers",
      description:
        "Caps the texture layers a particle material uses. -1 means no cap.",
      sideEffects:
        "Upstream: below 4, Infernus' afterburn, Paige's fire and Drifter's passive look blocky.",
    },
    r_particle_max_size_cull: {
      label: "Particle cull size limit",
      description:
        "Particle systems larger than this in every dimension skip CPU culling and are drawn anyway.",
    },
    r_particle_max_detail_level: {
      label: "Particle detail level",
      description:
        "Highest particle detail level spawned; 0 spawns only the cheapest variants.",
    },
    r_particle_max_draw_distance: {
      label: "Particle draw distance",
      description: "Distance beyond which particles are not drawn.",
      sideEffects: "Upstream: too low and trooper health bars disappear.",
    },
    r_particle_min_timestep: {
      label: "Particle minimum timestep",
      description:
        "Particles simulated more often than this interpolate instead. Higher values make effects step visibly.",
    },
    r_particle_mixed_resolution_viewstart: {
      label: "Particle mixed resolution start",
      description:
        "Distance at which particles start rendering at reduced resolution.",
    },
    r_particle_model_per_thread_count: {
      label: "Particle models per thread",
      description: "How many particle models one worker thread handles.",
    },
    r_particle_skip_postsim: {
      label: "Skip particle post-simulation",
      description: `Skips the post-simulation step for particles. ${UNDOCUMENTED}`,
    },
    r_particle_model_new8: {
      label: "Particle model new8",
      description: UNDOCUMENTED,
    },
    r_particle_allowprerender: {
      label: "Particle prerender",
      description: "Allows particle systems to prerender.",
    },
    r_particle_batch_collections: {
      label: "Batch particle collections",
      description: "Batches collections of particles when rendering.",
    },
    r_particle_fixedrandomseeds: {
      label: "Fixed particle random seeds",
      description:
        "Uses fixed random seeds for particles (a debugging aid). Effects repeat the same pattern.",
    },
    r_particle_cables_render: {
      label: "Render cable particles",
      description: "Renders cable and rope particle effects.",
      sideEffects: "Upstream: off breaks Lash's ultimate.",
    },
    r_particle_timescale: {
      label: "Particle speed",
      description:
        "Speed of particle simulation. Above 1, effects play faster and visibly end before the ability does.",
      sideEffects:
        "Upstream: desyncs Infernus' ultimate visuals from its duration.",
    },
    r_limit_particle_job_duration: {
      label: "Limit particle job duration",
      description: "Limits how long particle jobs may run per frame.",
    },
    r_update_particles_on_render_only_frames: {
      label: "Update particles on render-only frames",
      description:
        "Updates particles on frames that render without a simulation tick.",
    },
    r_draw_particle_children_with_parents: {
      label: "Draw particle children with parents",
      description:
        "Draws child particle systems together with their parent: -1 uses gameinfo, 0 no, 1 yes.",
    },
    r_drawparticles: {
      label: "Draw particles",
      description:
        "Master switch for particle rendering. Off, ability effects are invisible.",
    },
    r_RainParticleDensity: {
      label: "Rain density",
      description: "Density of rain particles, 0 to 1.",
    },
    r_citadel_screenspace_particles_full_res: {
      label: "Full-resolution screen-space particles",
      description:
        "Renders screen-space particles at full resolution. Not in Valve's current convar dump.",
    },
    r_citadel_half_res_noisy_effects: {
      label: "Half-resolution noisy effects",
      description: "Renders noisy effects at half resolution.",
    },
    particle_cluster_nodraw: {
      label: "Hide particle clusters",
      description: "Skips drawing particle clusters.",
    },
    particle_cluster_use_collision_hulls: {
      label: "Particle cluster collision",
      description: "Uses collision hulls for particle clusters.",
    },
    r_particle_explicit_fetch: {
      label: "Explicit particle fetch",
      description: "Not in Valve's current convar dump.",
      sideEffects: "Upstream notes soul orbs get harder to see.",
    },
    cl_show_splashes: {
      label: "Splashes",
      description: "Water and impact splash effects.",
    },
    cl_show_bloodspray: {
      label: "Blood spray",
      description: "Blood spray effects on hits.",
    },
    cl_ejectbrass: {
      label: "Shell casings",
      description: "Ejected shell casing effects.",
    },
    cl_impacteffects: {
      label: "Impact effects",
      description: "Bullet impact effects.",
    },
    cl_aggregate_particles: {
      label: "Aggregate particles",
      description: "Aggregates particle systems for rendering.",
    },
    fx_drawmetalspark: {
      label: "Metal sparks",
      description: "Spark effects on metal impacts.",
    },
    citadel_per_weapon_per_surface_impact_effects: {
      label: "Per-surface impact effects",
      description: "Uses impact effects specific to each weapon and surface.",
    },
    violence_ablood: {
      label: "Blood (non-human)",
      description: "Blood effects for non-human units.",
    },
    violence_agibs: {
      label: "Gibs (non-human)",
      description: "Gib entities for non-human units.",
    },
    violence_hblood: {
      label: "Blood",
      description: "Blood effects.",
    },
    violence_hgibs: {
      label: "Gibs",
      description: "Gib entities.",
    },

    // Textures & detail
    r_texturefilteringquality: {
      label: "Texture filtering",
      description:
        "0 bilinear, 1 trilinear, 2 to 5 anisotropic 2x to 16x. Lower values blur textures at an angle.",
    },
    r_texture_stream_mip_bias: {
      label: "Texture quality (mip bias)",
      description:
        "Streams lower-resolution texture mips: the in-game Texture quality setting uses 0 High, 1 Med, 2 Low. Higher values are blurrier.",
      sideEffects:
        "Upstream: above 4, the Sinner's Sacrifice lights turn into small triangles unless the Sinner light fix addon is installed.",
    },
    r_texture_lod_scale: {
      label: "Texture size scale",
      description:
        "Scale on the texture size streaming requests. Higher values are blurrier.",
    },
    r_fallback_texture_lod_scale: {
      label: "Fallback texture size scale",
      description:
        "Texture size scale for geometry without precomputed UV density. Higher values are blurrier.",
    },
    r_texture_stream_max_resolution: {
      label: "Max texture resolution",
      description:
        "Caps the resolution of the top streamed mip level. The engine minimum is 512.",
    },
    r_texture_budget_threshold: {
      label: "Texture budget threshold",
      description:
        "Fraction of the texture budget at which the texture pool starts shrinking.",
    },
    r_texture_budget_update_period: {
      label: "Texture budget update period",
      description: "Seconds between texture memory budget updates.",
    },
    r_texture_budget_dynamic: {
      label: "Dynamic texture budget",
      description:
        "Adjusts the texture streaming budget to the GPU's memory use.",
    },
    r_texture_pool_size: {
      label: "Texture pool size",
      description:
        "Total size of the texture pool in MB. Smaller pools stream lower-resolution textures sooner.",
    },
    r_texture_pool_reduce_rate: {
      label: "Texture pool shrink rate",
      description:
        "MB per second the texture pool shrinks by when over budget.",
    },
    r_character_decal_resolution: {
      label: "Character decal resolution",
      description:
        "Resolution of the decal texture on characters. The engine minimum is 256.",
    },
    r_decals: {
      label: "Max decals",
      description:
        "Maximum number of decals such as bullet holes and impact marks.",
    },
    r_drawdecals: {
      label: "Draw decals",
      description: "Renders decals.",
      sideEffects:
        "Upstream FAQ: off makes Lash's ground slam and Warden's ultimate indicators hard to see.",
    },
    r_drawmodeldecals: {
      label: "Model decals",
      description: "Not in Valve's current convar dump.",
    },
    r_decals_max_on_deformables: {
      label: "Decals on deformable models",
      description: "Not in Valve's current convar dump.",
    },
    sc_force_materials_batchable: {
      label: "Force batchable materials",
      description: "Treats every material as batchable.",
    },
    mat_set_shader_quality: {
      label: "Shader quality",
      description: "A console command, not a convar: gameinfo.gi can't set it.",
    },
    gpu_level: {
      label: "GPU level",
      description: "Engine GPU detail level (default High).",
    },
    gpu_mem_level: {
      label: "GPU memory level",
      description: "Engine GPU memory level (default High).",
    },
    mem_level: {
      label: "Memory level",
      description: "Engine memory level.",
    },
    r_hair_indirect_transmittance: {
      label: "Hair light transmission",
      description: "Indirect light passing through hair.",
    },
    r_render_hair: {
      label: "Render hair",
      description: "Renders hair. Off, heroes with hair render without it.",
    },
    r_haircull_percent: {
      label: "Hair cull percent",
      description: UNDOCUMENTED,
    },
    r_renderdoc_auto_shader_pdbs: {
      label: "RenderDoc shader debug info",
      description:
        "Generates shader debug info when a RenderDoc capture is taken. Only matters with RenderDoc attached.",
    },
    citadel_in_world_item_panel_dpi: {
      label: "In-world text resolution",
      description:
        "Resolution scale of in-world text panels such as soul pickups, crates and statues.",
      sideEffects: "Upstream FAQ: low values make in-world text hard to read.",
    },
    r_displacement_mapping: {
      label: "Displacement mapping",
      description: "Displacement mapping on surfaces.",
    },

    // World & LOD
    r_farz: {
      label: "Far clip distance",
      description:
        "Overrides the far clipping plane. -1 uses the map's fog controller.",
      sideEffects: "Upstream FAQ: buildings and distant players pop in.",
    },
    r_mapextents: {
      label: "Map extents",
      description: "Maximum map dimension, which sets the far clipping plane.",
      sideEffects: "Upstream FAQ: buildings pop in and out.",
    },
    r_size_cull_threshold: {
      label: "Small-object culling",
      description:
        "Objects smaller than this percentage of the screen are not drawn. Higher values cull more.",
      sideEffects:
        "Upstream FAQ: high values hide crates and trooper health bars at a distance.",
    },
    sc_screen_size_lod_scale_override: {
      label: "Model LOD scale",
      description:
        "Scale on when models switch to lower levels of detail. -1 uses the engine default; lower values switch sooner.",
      sideEffects:
        "Upstream FAQ: holes appear in Victor and Paige at some angles and the Sinner's Sacrifice lights turn into triangles.",
    },
    sc_fade_distance_scale_override: {
      label: "Fade distance scale",
      description:
        "Scale on the distance at which objects fade in and out. -1 uses the engine default.",
      sideEffects:
        "Upstream FAQ: affects how far trooper health bars and jump pad wind are visible.",
    },
    sc_instanced_mesh_lod_bias: {
      label: "Instanced mesh LOD bias",
      description:
        "Level-of-detail bias for instanced meshes such as foliage and clutter. Higher values use simpler models.",
    },
    sc_instanced_mesh_size_cull_bias: {
      label: "Instanced mesh cull bias",
      description:
        "Bias for culling small instanced meshes. Higher values hide more of them.",
    },
    sc_instanced_mesh_motion_vectors: {
      label: "Instanced mesh motion vectors",
      description:
        "Motion vectors for instanced meshes, used by temporal effects such as TAA upscaling and motion blur.",
    },
    sc_instanced_mesh_opaque_fade: {
      label: "Instanced mesh fade",
      description: "Lets opaque instanced meshes fade in and out.",
    },
    sc_allow_dithered_lod: {
      label: "Dithered LOD transitions",
      description:
        "Dithers between levels of detail. Off, models switch detail in one step.",
    },
    sc_aggregate_bvh_threshold: {
      label: "Aggregate BVH threshold",
      description:
        "Threshold for building bounding volume hierarchies for aggregate meshes.",
    },
    sc_layer_batch_threshold: {
      label: "Layer batch threshold",
      description: "Object count threshold for batching a render layer.",
    },
    sc_layer_batch_threshold_fullsort: {
      label: "Layer full-sort threshold",
      description: "Object count threshold for fully sorting a render layer.",
    },
    sc_clutter_enable: {
      label: "Clutter",
      description: "Small clutter props.",
    },
    r_grass_quality: {
      label: "Grass quality",
      description: "0 Off, 1 Low, 2 Med, 3 High, 4 Ultra.",
    },
    r_grass_start_fade: {
      label: "Grass fade start",
      description: "Distance at which grass starts fading out.",
    },
    r_grass_end_fade: {
      label: "Grass fade end",
      description: "Distance at which grass is fully faded out.",
    },
    r_world_wind_strength: {
      label: "Wind strength",
      description:
        "Strength of world wind that sways grass and trees. 0 stops it.",
    },
    r_world_wind_frequency_grass: {
      label: "Grass wind frequency",
      description: "Frequency of wind animation on grass.",
    },
    r_world_wind_frequency_trees: {
      label: "Tree wind frequency",
      description: "Frequency of wind animation on trees.",
    },
    r_draw3dskybox: {
      label: "3D skybox",
      description: "Draws the 3D skybox layer of distant scenery.",
    },
    r_drawskybox: {
      label: "2D skybox",
      description: "Draws the 2D skybox.",
    },
    r_monitor_3dskybox: {
      label: "3D skybox in monitors",
      description: "Draws the 3D skybox in monitor views.",
    },
    r_drawropes: {
      label: "Ropes",
      description: "Draws ropes and cables.",
    },
    r_ropetranslucent: {
      label: "Translucent ropes",
      description: "Draws ropes with translucency.",
    },
    r_propsmaxdist: {
      label: "Prop draw distance",
      description: "Maximum distance at which client-side props are visible.",
    },
    r_drawtracers_firstperson: {
      label: "Your bullet tracers",
      description: "Tracers from your own weapon.",
    },
    r_max_portal_render_targets: {
      label: "Doorman door views",
      description: "Maximum number of Doorman doors rendered at once.",
      sideEffects:
        "Upstream: 1 causes visual bugs; use 2, or 0 to turn the doors' views off.",
    },
    citadel_portrait_world_renderer_off: {
      label: "Hide hero models in menus",
      description: "Stops rendering hero models in the shop and end screen.",
    },
    r_strip_invisible_during_sceneobject_update: {
      label: "Strip invisible scene objects",
      description: "Removes invisible objects while updating scene objects.",
    },
    r_lod: {
      label: "Model LOD",
      description: "Not in Valve's current convar dump.",
    },
    citadel_use_pvs_for_players: {
      label: "Use PVS for players",
      description:
        "Uses the potentially visible set to decide which players to process. Changes when players outside your view are updated.",
    },
    sv_waterdist: {
      label: "Water view fixup distance",
      description: "Vertical view fixup when the camera is near a water plane.",
    },
    sc_clutter_density_full_size: {
      label: "Clutter full-density size",
      description: "Screen size at which clutter is drawn at full density.",
    },
    sc_clutter_density_none_size: {
      label: "Clutter cutoff size",
      description: "Screen size below which clutter is not drawn.",
    },
    sc_dithered_lod_transition_amt: {
      label: "Dithered LOD transition amount",
      description:
        "Share of a level-of-detail transition that is dithered, 0 to 0.2.",
    },
    sc_max_framebuffer_copies_per_layer: {
      label: "Framebuffer copies per layer",
      description:
        "Maximum framebuffer copies per render layer, used by effects that sample the screen.",
    },
    sc_enable_discard: {
      label: "Alpha discard",
      description: "Allows alpha-tested materials to discard pixels.",
    },
    r_citadel_gpu_culling: {
      label: "GPU culling",
      description: "Culls objects on the GPU.",
    },
    r_translucent: {
      label: "Translucent geometry",
      description: "Renders translucent geometry.",
    },
    wind_system_default_resolution_xy: {
      label: "Wind field resolution",
      description: "Resolution of the wind simulation grid.",
    },
    wind_system_temporal_smoothing: {
      label: "Wind temporal smoothing",
      description: "Smooths the wind simulation over time.",
    },

    // Physics & animation
    cl_ragdoll_limit: {
      label: "Ragdoll limit",
      description:
        "Maximum number of ragdolls shown at once. -1 removes the limit.",
      sideEffects:
        "Upstream FAQ: low values hide Doorman's ultimate indicator; -1 restores it.",
    },
    cl_disable_ragdolls: {
      label: "Disable ragdolls",
      description: "Turns off client ragdolls.",
      sideEffects: "Upstream notes it can interfere with Doorman's ultimate.",
    },
    g_ragdoll_maxcount: {
      label: "Max ragdolls",
      description: "Maximum number of ragdolls.",
    },
    g_ragdoll_important_maxcount: {
      label: "Max important ragdolls",
      description: "Maximum number of ragdolls marked important.",
    },
    cl_ragdoll_default_scale: {
      label: "Ragdoll scale",
      description: "Default scale for ragdolls.",
    },
    ragdoll_parallel_pose_control: {
      label: "Parallel ragdoll poses",
      description: "Computes ragdoll pose control on worker threads.",
    },
    cloth_sim_on_tick: {
      label: "Cloth on simulation ticks",
      description: "Updates cloth simulation on simulation ticks.",
    },
    cloth_update: {
      label: "Cloth simulation",
      description: "Updates cloth (capes, coats). Off, cloth stops moving.",
    },
    presettle_cloth_iterations: {
      label: "Cloth presettle iterations",
      description:
        "Iterations used to settle cloth before it starts simulating.",
    },
    pred_cloth_pos_max: {
      label: "Cloth position prediction cap",
      description: "Cap on predicted cloth position correction.",
    },
    pred_cloth_pos_multiplier: {
      label: "Cloth position prediction",
      description: "Multiplier on predicted cloth position correction.",
    },
    pred_cloth_pos_strength: {
      label: "Cloth position prediction strength",
      description: "Strength of predicted cloth position correction.",
    },
    pred_cloth_rot_high: {
      label: "Cloth rotation prediction (high)",
      description: "Upper threshold for predicted cloth rotation correction.",
    },
    pred_cloth_rot_low: {
      label: "Cloth rotation prediction (low)",
      description: "Lower threshold for predicted cloth rotation correction.",
    },
    pred_cloth_rot_multiplier: {
      label: "Cloth rotation prediction",
      description: "Multiplier on predicted cloth rotation correction.",
    },
    enable_boneflex: {
      label: "Bone flexes",
      description: "Procedural flex drivers on faces and meshes.",
      sideEffects:
        "Upstream notes more melee mispredictions on Venator and others when it's off.",
    },
    ik_final_fixup_enable: {
      label: "IK final fixup",
      description:
        "Final inverse-kinematics correction pass on animated models.",
    },
    ik_enable: {
      label: "Inverse kinematics",
      description:
        "Inverse kinematics on animated models. Off, feet and hands stop adapting to the ground and targets.",
    },
    ik_fabrik_align_chain: {
      label: "IK chain alignment",
      description: "Aligns FABRIK inverse-kinematics chains.",
    },
    ik_constraints_enabled: {
      label: "IK constraints",
      description: "Joint constraints in inverse kinematics.",
    },
    ik_planetilt_enable: {
      label: "IK plane tilt",
      description: "Tilts IK targets to match the ground plane.",
    },
    animgraph_footlock_enabled: {
      label: "Foot locking",
      description:
        "Master switch for the animation graph's foot-lock node, which keeps feet planted on the ground.",
    },
    animgraph_slowdownonslopes_enabled: {
      label: "Slope slowdown animation",
      description: "Animation adjustment when moving on slopes.",
    },
    animgraph_enable_parallel_op_evaluation: {
      label: "Parallel animation operators",
      description: "Not in Valve's current convar dump.",
    },
    animgraph_enable_parallel_preupdate: {
      label: "Parallel animation pre-update",
      description: "Not in Valve's current convar dump.",
    },
    animgraph_enable_dirty_netvar_optimization: {
      label: "Skip unchanged animation graphs",
      description:
        "Only updates an animation graph when its networked variables changed.",
    },
    anim_decode_forcewritealltransforms: {
      label: "Write all bone transforms",
      description:
        "Forces batch animation decoding to write transforms for every bone.",
    },
    anim_disable: {
      label: "Disable animation",
      description: "Turns off animation.",
    },
    skeleton_instance_lod_optimization: {
      label: "Skeleton LOD optimization",
      description:
        "Computes the level-of-detail bone mask internally instead of updating every bone.",
    },
    r_morphing_enabled: {
      label: "Morph targets",
      description: "Vertex morph targets such as facial expressions.",
    },
    r_smooth_morph_normals: {
      label: "Smooth morph normals",
      description: "Smooths normals on morphed meshes.",
    },
    r_enable_rigid_animation: {
      label: "Rigid animation",
      description: UNDOCUMENTED,
    },
    cl_phys_enabled: {
      label: "Client physics",
      description:
        "All client physics simulation. Off, ragdolls freeze and boxes don't fall over.",
    },
    cl_phys_timescale: {
      label: "Physics speed",
      description: "Time scale for client physics. 1 is normal speed.",
    },
    cl_phys_sleep_enable: {
      label: "Physics sleeping",
      description: "Lets resting dynamic physics bodies sleep.",
    },
    cl_phys_props_enable: {
      label: "Client physics props",
      description: "Client-side physics props.",
    },
    cl_phys_props_max: {
      label: "Max physics props",
      description: "Maximum number of client-side physics props.",
    },
    cl_phys_networked_start_sleep: {
      label: "Networked physics start asleep",
      description: "Starts networked physics objects asleep.",
    },
    cl_phys_assume_fixed_tick_interval: {
      label: "Fixed physics tick",
      description:
        "Assumes a fixed client tick rate for physics substeps instead of measuring it.",
    },
    phys_cull_internal_mesh_contacts: {
      label: "Cull internal mesh contacts",
      description: "Skips physics contacts inside meshes.",
    },
    phys_dynamic_scaling: {
      label: "Dynamic physics scaling",
      description: UNDOCUMENTED,
    },
    phys_multithreading_enabled: {
      label: "Multithreaded physics",
      description: "Runs physics on several threads. On by default.",
    },
    phys_threaded_cloth_bone_update: {
      label: "Threaded cloth bone update",
      description: "Updates cloth bones on worker threads.",
    },
    phys_threaded_kinematic_bone_update: {
      label: "Threaded kinematic bone update",
      description: "Updates kinematic bones on worker threads.",
    },
    phys_threaded_transform_update: {
      label: "Threaded transform update",
      description: "Updates physics transforms on worker threads.",
    },
    phys_expensive_shape_threshold: {
      label: "Expensive shape threshold",
      description: "Threshold above which a physics shape counts as expensive.",
    },
    props_break_max_pieces_perframe: {
      label: "Break pieces per frame",
      description:
        "Maximum pieces a breakable prop creates per frame. Upstream: 0 breaks crates and troopers into a single piece.",
    },
    props_break_apply_radial_forces: {
      label: "Radial break forces",
      description: "Applies radial forces to pieces of breaking props.",
    },
    func_break_max_pieces: {
      label: "Breakable pieces",
      description: "Maximum pieces a breakable creates.",
    },
    rope_collide: {
      label: "Rope collision",
      description: "Lets ropes collide with the world.",
    },
    rope_subdiv: {
      label: "Rope subdivision",
      description:
        "Rope subdivision level, 0 to 8. Lower values make ropes more angular.",
    },
    rope_wind_dist: {
      label: "Rope wind distance",
      description: "Ropes past this distance don't get small wind gusts.",
    },
    rope_smooth_enlarge: {
      label: "Rope smoothing enlarge",
      description:
        "How much ropes are enlarged on screen for their anti-aliasing effect.",
    },
    rope_smooth_maxalpha: {
      label: "Rope smoothing max alpha",
      description: "Maximum alpha of the rope anti-aliasing effect.",
    },
    rope_smooth_maxalphawidth: {
      label: "Rope smoothing max alpha width",
      description:
        "Screen width at which rope smoothing reaches its maximum alpha.",
    },
    rope_smooth_minalpha: {
      label: "Rope smoothing min alpha",
      description: "Minimum alpha of the rope anti-aliasing effect.",
    },
    rope_smooth_minwidth: {
      label: "Rope smoothing min width",
      description: "Minimum on-screen width a smoothed rope shrinks to.",
    },
    ai_use_async_ragdoll_fixup: {
      label: "Async ragdoll fixup",
      description: "Fixes up NPC ragdolls asynchronously.",
    },

    // CPU & threading
    thread_pool_option: {
      label: "Thread pool mode",
      description:
        "Thread pool option. -1 is the engine default; upstream configs disagree on the value.",
    },
    engine_low_latency_sleep_after_client_tick: {
      label: "Low-latency sleep after client tick",
      description:
        "With NVIDIA Reflex or AMD Anti-Lag on, moves the low-latency sleep on tick frames to after client simulation.",
    },
    engine_no_focus_sleep: {
      label: "Background frame sleep",
      description:
        "Milliseconds the game sleeps per frame while it doesn't have focus. 0 keeps it running at full speed in the background.",
    },
    engine_max_ticks_to_simulate: {
      label: "Max ticks per frame",
      description:
        "Maximum ticks simulated in one frame before the simulation falls behind real time. -1 uses the engine default.",
    },
    engine_accurate_input_processing_delta_time: {
      label: "Accurate input timing",
      description:
        "Uses the time since the last input processing when input is processed several times per frame.",
    },
    fps_max: {
      label: "Frame rate cap",
      description:
        "Frame rate limit in game; 0 removes the cap. The in-game maximum FPS slider writes it to video.txt, which wins over gameinfo.gi.",
    },
    fps_max_ui: {
      label: "Menu frame rate cap",
      description:
        "Frame rate limit outside matches (Dashboard maximum FPS in the menu).",
    },
    cpu_level: {
      label: "CPU level",
      description: "Engine CPU detail level (default High).",
    },
    r_frame_sync_enable: {
      label: "Frame sync",
      description: "Synchronizes the CPU with the GPU each frame.",
      sideEffects: "Upstream: off makes VRAM spill into system memory.",
    },
    cl_simulate_dormant_entities: {
      label: "Simulate dormant entities",
      description: "Keeps simulating entities the server marked dormant.",
    },
    cl_batch_entity_list_ops_during_latch: {
      label: "Batch entity list changes",
      description:
        "Batches entity list adds and removes while latching interpolated variables, to avoid mutex contention.",
    },
    cl_interp_parallel: {
      label: "Parallel interpolation",
      description:
        "Runs interpolation in parallel for entities without children.",
    },
    cl_parallel_readpacketentities: {
      label: "Threaded snapshot reading",
      description:
        "Reads entity snapshots on worker threads when the server sends bit counts.",
    },
    cl_parallel_readpacketentities_threshold: {
      label: "Threaded snapshot threshold",
      description:
        "Entity count above which snapshots are read on worker threads.",
    },
    cl_pred_parallel_postnetwork: {
      label: "Parallel post-network prediction",
      description: UNDOCUMENTED,
    },
    cl_skip_hierarchy_update_for_unchanged_entities: {
      label: "Skip unchanged hierarchy updates",
      description: "Skips hierarchy updates for entities that didn't change.",
    },
    cl_bone_cache_optimization: {
      label: "Bone cache optimization",
      description: UNDOCUMENTED,
    },
    cl_async_usercmd_send: {
      label: "Async command send",
      description: "Sends user commands asynchronously.",
    },
    cl_modifier_parallel_gather_status_effect_updates: {
      label: "Parallel status effect updates",
      description: "Gathers status effect updates in parallel.",
    },
    cl_fasttempentcollision: {
      label: "Temp entity collision",
      description:
        "Collision handling for temporary entities such as shell casings.",
    },
    ai_strong_optimizations_no_checkstand: {
      label: "AI stand-check optimization",
      description: UNDOCUMENTED,
    },
    ai_gather_conditions_async: {
      label: "Async AI conditions",
      description: "Lets NPCs gather conditions asynchronously.",
    },
    ai_think_interval: {
      label: "NPC think interval",
      description: "Seconds between NPC thinks.",
    },
    ai_think_interval_lod_low: {
      label: "NPC think interval (low LOD)",
      description: "Seconds between NPC thinks at low AI level of detail.",
    },
    ai_think_interval_lod_med: {
      label: "NPC think interval (medium LOD)",
      description: "Seconds between NPC thinks at medium AI level of detail.",
    },
    ai_lod_auto_enabled: {
      label: "Automatic AI LOD",
      description: "Lowers NPC update rates automatically by distance.",
    },
    ai_async_queue_max_jobs: {
      label: "AI async jobs per frame",
      description: "Limit on AI jobs run per frame; -1 means no limit.",
    },
    ai_foot_sweep_enable: {
      label: "NPC foot sweep",
      description: UNDOCUMENTED,
    },
    nav_pathfind_multithread: {
      label: "Multithreaded pathfinding",
      description: "Runs NPC pathfinding on worker threads.",
    },
    nav_obstruction_async_update: {
      label: "Async nav obstruction updates",
      description: "Updates navigation obstructions asynchronously.",
    },
    think_limit: {
      label: "Think time warning",
      description:
        "Think time in milliseconds after which a warning is printed.",
    },
    fs_async_threads: {
      label: "Async file I/O threads",
      description:
        "Number of async filesystem I/O threads; -1 picks automatically.",
    },
    r_threaded_particles: {
      label: "Threaded particles",
      description: "Simulates particles on worker threads.",
    },
    r_late_particle_job_sync: {
      label: "Late particle job sync",
      description: "Waits for particle jobs later in the frame.",
    },
    r_skip_precache_validation_check: {
      label: "Skip precache validation",
      description: "Skips validating that resources were precached.",
    },
    r_pipeline_stats_use_flush_api: {
      label: "Pipeline stats flush",
      description:
        "Experimental: uses ID3D11DeviceContext::Flush instead of queries to flush the GPU pipeline (DirectX 11).",
    },
    steam_inputhandler_enabled: {
      label: "Steam Input",
      description:
        "Steam Input controller handling. Off, controllers stop working in game.",
    },
    sv_pvs_max_distance: {
      label: "PVS max distance",
      description:
        "Maximum range for PVS checks on a server. Has no effect on official servers.",
    },
    sv_remove_ent_from_pvs: {
      label: "Remove entities from PVS",
      description: "Server-side setting. Has no effect on official servers.",
    },
    v8_maximum_heap_size_mb: {
      label: "UI script heap size",
      description:
        "Hard limit for the V8 JavaScript heap the interface uses, in MB.",
    },
    r_citadel_gpu_preview_denoise_passes: {
      label: "Preview denoise passes",
      description: UNDOCUMENTED,
    },

    // Network
    cl_smoothtime: {
      label: "Prediction smoothing time",
      description:
        "Seconds over which the view is smoothed after a prediction error. Lower is snappier but more abrupt.",
    },
    cl_smooth: {
      label: "Prediction smoothing",
      description: "Smooths the view after prediction errors.",
    },
    cl_updaterate: {
      label: "Update rate",
      description: "Snapshots per second requested from the server.",
    },
    cl_pred_optimize: {
      label: "Prediction optimization",
      description: "Skips repredicting when there were no prediction errors.",
    },
    cl_prediction_savedata_postentitypacketreceived: {
      label: "Prediction save-data optimization",
      description:
        "An experimental optimization; Valve's help text asks for the convar to be deleted.",
    },
    cl_resend: {
      label: "Connect retry delay",
      description: "Seconds before the client retries a connect attempt.",
    },
    net_async_clientconnect: {
      label: "Async client connect",
      description: "Async client connect optimization.",
    },

    // Interface
    panorama_max_fps: {
      label: "Menu frame rate cap",
      description:
        "Frame rate cap for menus such as the shop. Not in Valve's current convar dump.",
    },
    panorama_max_overlay_fps: {
      label: "Overlay frame rate cap",
      description:
        "Frame rate cap for the settings and escape menu overlay. Not in Valve's current convar dump.",
    },
    panorama_allow_transitions: {
      label: "UI transitions",
      description: "Animated transitions in the shop and menus.",
    },
    panorama_transition_time_factor: {
      label: "UI transition speed",
      description:
        "Speed of interface transitions: 1 is normal, 2 twice as fast.",
    },
    panorama_disable_box_shadow: {
      label: "Disable UI box shadows",
      description: "Turns off drop shadows in the interface.",
    },
    panorama_comp_layer_lru_lifetime: {
      label: "UI layer cache lifetime",
      description: "How long cached interface composition layers are kept.",
    },
    panorama_temp_comp_layer_min_dimension: {
      label: "UI temporary layer minimum size",
      description: "Minimum size of temporary interface composition layers.",
    },
    panorama_async_compute_mipgen: {
      label: "UI async mip generation",
      description: "Generates interface texture mipmaps with async compute.",
    },
    panorama_use_new_occlusion_invalidation: {
      label: "UI occlusion invalidation",
      description: UNDOCUMENTED,
    },
    r_dashboard_render_quality: {
      label: "Dashboard render quality",
      description: "Render quality of the main menu dashboard.",
    },
    citadel_damage_offscreen_indicator_disabled: {
      label: "Hide offscreen damage indicators",
      description: "Hides the indicators for damage from units you can't see.",
    },
    citadel_hud_objective_health_enabled: {
      label: "Objective health bars",
      description:
        "HUD health bars for objectives: 0 off, 1 shrines, Patron and Mid-Boss, 2 adds Guardians and Walkers, 3 adds barracks.",
    },
    citadel_hud_objective_health_idle_timeout: {
      label: "Objective health bar timeout",
      description:
        "Seconds after an objective stops taking damage before its HUD health bar hides.",
    },
    citadel_hud_objective_health_debug_show_midboss: {
      label: "Always show Mid-Boss health",
      description: "Debug option that keeps the Mid-Boss health bar visible.",
    },
    citadel_damage_report_enable: {
      label: "Damage report",
      description: "Shows the damage report.",
    },
    citadel_damage_text_show_effectiveness: {
      label: "Damage effectiveness text",
      description: "Shows damage effectiveness on every damage number.",
    },
    citadel_damage_text_lifetime: {
      label: "Damage number lifetime",
      description:
        "How long damage numbers stay on screen. Not in Valve's current convar dump.",
    },
    citadel_damage_text_lifetime_new: {
      label: "Accumulated damage number lifetime",
      description: "How long accumulated damage numbers stay on screen.",
    },
    citadel_crosshair_hit_marker_duration: {
      label: "Hit marker duration",
      description: "How long the hit marker stays on the crosshair.",
    },
    citadel_unit_status_old_update_rate: {
      label: "Health bar update rate",
      description:
        "How many times per second health bars can redraw; 0 means every frame. Not in Valve's current convar dump.",
    },
    citadel_minimap_use_canvas_for_neutrals: {
      label: "Minimap canvas for neutrals",
      description: "Not in Valve's current convar dump.",
    },
    citadel_minimap_use_canvas_for_shop: {
      label: "Minimap canvas for shops",
      description: "Not in Valve's current convar dump.",
    },
    minimap_update_rate_hz: {
      label: "Minimap update rate",
      description: "How many times per second the minimap updates.",
    },
    closecaption: {
      label: "Closed captions",
      description: "Closed captioning.",
    },
    cc_captiontrace: {
      label: "Missing caption trace",
      description: "Reports missing closed captions: 0 no, 1 console, 2 HUD.",
    },
    hud_free_cursor: {
      label: "Free HUD cursor",
      description: "Frees the mouse cursor on the HUD: 0 disabled, 1 enabled.",
    },
    citadel_show_survey: {
      label: "Show survey",
      description: "Forces the survey interface on outside matchmaking.",
    },
    mm_idle_show_warning_at_s: {
      label: "Idle warning delay",
      description: "Seconds before the idle warning dialog shows.",
    },
    mm_idle_enabled: {
      label: "Idle detection",
      description: "Kill switch for idle detection.",
    },
    citadel_cinematic_intro_enabled: {
      label: "Match intro cinematic",
      description:
        "-1 forces the cinematic intro off, 0 uses the default, 1 forces it on.",
    },

    // Audio
    snd_occlusion_bounces: {
      label: "Sound occlusion bounces",
      description: "Bounces traced for sound occlusion.",
    },
    snd_occlusion_rays: {
      label: "Sound occlusion rays",
      description:
        "Rays traced for sound occlusion; 0 turns occlusion tracing off.",
    },
    snd_mixahead: {
      label: "Audio mix-ahead",
      description:
        "Seconds of audio mixed ahead of playback. Higher values add audio latency.",
    },
    snd_mix_async: {
      label: "Async audio mixing",
      description: "Mixes audio asynchronously.",
    },
    soundsystem_update_async: {
      label: "Async sound system update",
      description: "Updates the sound system asynchronously.",
    },
    audio_enable_vmix_mastering: {
      label: "Audio mastering",
      description:
        "Mastering DSP on the final audio mix. Off changes how the mix sounds.",
    },
    dsp_volume: {
      label: "DSP volume",
      description: "Volume of DSP effects such as room reverb.",
    },
    snd_steamaudio_num_threads: {
      label: "Steam Audio threads",
      description: "Threads Steam Audio uses for realtime reflections.",
    },
    snd_steamaudio_enable_reverb: {
      label: "Steam Audio reverb",
      description: "Steam Audio's reverb processor.",
    },
    snd_steamaudio_max_occlusion_samples: {
      label: "Steam Audio occlusion samples",
      description: "Maximum rays Steam Audio traces for volumetric occlusion.",
    },
    snd_steamaudio_num_diffuse_samples: {
      label: "Steam Audio diffuse samples",
      description: "Directions Steam Audio considers for ray bounces.",
    },
    snd_steamaudio_reverb_order_rendering: {
      label: "Steam Audio reverb order",
      description:
        "Ambisonics order for convolution reverb: 0 is one channel, 1 is four.",
    },
    snd_use_baked_occlusion: {
      label: "Baked sound occlusion",
      description: "Uses precomputed sound occlusion.",
    },
    update_voices_low_priority: {
      label: "Low-priority voice updates",
      description: UNDOCUMENTED,
    },

    // Camera & visibility
    r_aspectratio: {
      label: "Aspect ratio",
      description:
        "Forces the render aspect ratio; 0 uses your screen's. Values above your screen's ratio fit more of the world on screen, slightly squeezed.",
    },
    citadel_camera_hero_fov: {
      label: "Hero camera FOV",
      description:
        "Field of view of the hero camera in degrees. The engine clamps it to 75..90, the same range as the Settings slider.",
    },
    default_fov: {
      label: "Default FOV",
      description: "Default field of view.",
    },
    viewmodel_fov: {
      label: "First-person model FOV",
      description: "Field of view for first-person models.",
    },
    citadel_camera_pitch_default: {
      label: "Camera resting pitch",
      description: "The camera's resting pitch.",
    },
    citadel_camera_wobble_disable: {
      label: "Disable camera wobble",
      description: "Turns off camera wobble effects.",
    },
    citadel_camera_soft_collision: {
      label: "Soft camera collision",
      description:
        "Softens camera-to-wall collision using a cone of traces: 0 off, 1 on, 2 also drives the hole punch.",
    },
    citadel_camera_soft_collision_angle: {
      label: "Soft collision cone angle",
      description:
        "Arc of the soft camera collision cone in degrees. Larger angles soften earlier.",
    },
    citadel_camera_use_vmdl_flatten_horizontal: {
      label: "Flatten camera horizontally",
      description:
        "Averages the camera's horizontal pose positions to reduce motion sickness.",
    },
    citadel_camera_use_vmdl_flatten_vertical: {
      label: "Flatten camera vertically",
      description: "Averages the camera's vertical pose positions.",
      sideEffects:
        "Upstream FAQ: off makes Rem's and Venator's camera move down when aiming down sights.",
    },
    citadel_melee_shake_amplitude: {
      label: "Melee screen shake",
      description: "Strength of the screen shake from melee hits.",
    },
    citadel_melee_shake_duration: {
      label: "Melee screen shake duration",
      description: "Duration of the screen shake from melee hits.",
    },
    r_citadel_clip_sphere_min_opacity: {
      label: "Camera clip opacity",
      description:
        "Minimum opacity of objects between the camera and your hero; 0 makes them fully transparent.",
    },
    citadel_trooper_glow_disabled: {
      label: "Hide trooper glow",
      description: "Turns off the glow on troopers.",
    },
    citadel_trooper_friendly_glow_disabled: {
      label: "Hide friendly trooper glow",
      description:
        "Turns off the glow on friendly troopers, except through walls during laning.",
    },
    citadel_boss_glow_disabled: {
      label: "Hide boss glow",
      description: "Turns off the glow on bosses and Walkers.",
    },
    citadel_trooper_outline_enabled: {
      label: "Trooper outlines",
      description: "Outlines on troopers.",
    },
    citadel_player_outline_enemies: {
      label: "Enemy player outlines",
      description: "Outlines on enemy players.",
    },
    citadel_player_glow_disabled: {
      label: "Hide player glow",
      description: "Turns off the glow on players.",
    },
    cl_glow_brightness: {
      label: "Glow brightness",
      description: "Brightness of player halos.",
    },
    r_citadel_glow_health_bars: {
      label: "Glowing health bars",
      description: "Glow on health bars.",
    },
    r_citadel_npr_outlines: {
      label: "Stylized outlines",
      description: "Non-photorealistic outlines on characters.",
    },
    r_citadel_npr_outlines_max_dist: {
      label: "Stylized outline distance",
      description: "Maximum distance at which stylized outlines render.",
    },
    r_citadel_outlines: {
      label: "Outlines",
      description: "Not in Valve's current convar dump.",
    },
    citadel_unit_status_allies_see_thru_walls: {
      label: "Ally health bars through walls",
      description: "Shows allied players' health bars through walls.",
    },
    citadel_unit_status_hide_names: {
      label: "Hide names on health bars",
      description: "Hides the names drawn over health bars.",
    },
    citadel_unit_status_delta_decay_delay: {
      label: "Damage highlight delay",
      description:
        "Delay before the recent-damage segment of a health bar starts fading.",
    },
    citadel_unit_status_delta_decay_rate: {
      label: "Damage highlight fade rate",
      description: "How fast the recent-damage segment of a health bar fades.",
    },
    citadel_unit_status_use_new: {
      label: "New health bars",
      description: "Not in Valve's current convar dump.",
    },

    // Developer and hideout tools
    citadel_hideout_ball_show_juggle_count: {
      label: "Hideout ball juggle count",
      description: "Work-in-progress juggle counter on the hideout ball.",
    },
    citadel_hideout_ball_show_juggle_fx: {
      label: "Hideout ball juggle effects",
      description: "Work-in-progress effects when the hideout ball bounces.",
    },
    citadel_hideout_enable_testing_tools: {
      label: "Hideout testing tools",
      description: "Developer testing tools in the hideout.",
    },
    debug_draw_enable: {
      label: "Debug drawing",
      description: "Developer debug drawing.",
    },

    // Other
    citadel_video_preset: {
      label: "Rendering quality preset",
      description: "The in-game Rendering quality preset, 0 Low to 3 Ultra.",
    },
    r_muzzleflashbrightness: {
      label: "Muzzle flash brightness",
      description: "Brightness of muzzle flash lights.",
    },
    r_flashlightbrightness: {
      label: "Flashlight brightness",
      description: "Brightness of flashlight-type lights.",
    },
    r_impacts_alt_orientation: {
      label: "Alternate impact orientation",
      description: UNDOCUMENTED,
    },
    r_nearz: {
      label: "Near clip distance",
      description: "Overrides the near clipping plane; -1 uses the default.",
    },
    cl_input_enable_raw_keyboard: {
      label: "Raw keyboard input",
      description: "Reads the keyboard through raw input.",
      sideEffects: "Upstream notes held keys can get stuck after alt-tabbing.",
    },
    m_rawinput: {
      label: "Raw mouse input",
      description: "Not in Valve's current convar dump.",
    },
    zipline_use_new_latch: {
      label: "New zipline latch",
      description:
        "Latch motion when getting on a zipline: 0 old, 1 only heroes set up for it, 2 everyone.",
    },
    citadel_npc_disable_cockroaches: {
      label: "Disable cockroaches",
      description: "Removes ambient cockroach NPCs.",
    },
    thumper_use_plane_reflection: {
      label: "Thumper plane reflection",
      description: UNDOCUMENTED,
    },
    mesh_calculate_curvature_smooth_pass_count: {
      label: "Mesh curvature smoothing passes",
      description: UNDOCUMENTED,
    },
    battery_saver: {
      label: "Battery saver",
      description:
        "Obsolete, replaced by mobile_fps_*. Not in Valve's current convar dump.",
    },
    citadel_bullet_shot_offset_fade_time: {
      label: "Bullet offset fade time",
      description: UNDOCUMENTED,
    },
    audio_enable_spawn_mask_mix_layer: {
      label: "Spawn mask mix layer",
      description:
        "Mix layer that mutes certain sounds at map load boundaries.",
    },
    panorama_panel_occlusion: {
      label: "UI panel occlusion",
      description: "Skips work for interface panels hidden behind others.",
    },
    citadel_test_ranked_summary: {
      label: "Test ranked summary",
      description: "Not in Valve's current convar dump.",
    },
    citadel_damage_text_batching_window_ability: {
      label: "Ability damage batching window",
      description:
        "Ability damage within this time is added into one number. Not in Valve's current convar dump.",
    },
    citadel_distance_mouse_move_for_minimap_drawing: {
      label: "Minimap drawing mouse distance",
      description: "Not in Valve's current convar dump.",
    },
    mat_async_shader_load: {
      label: "Async shader loading",
      description: "Not in Valve's current convar dump.",
    },
    cl_enable_eye_occlusion: {
      label: "Eye occlusion",
      description: "Not in Valve's current convar dump.",
    },
    r_citadel_depth_prepass_dynamic_objects: {
      label: "Depth prepass for moving objects",
      description: "Not in Valve's current convar dump.",
    },
    citadel_npc_force_animate_every_tick: {
      label: "Animate NPCs every tick",
      description: "Not in Valve's current convar dump.",
    },
    lb_enable_newsum: {
      label: "Light binner new sum",
      description: "Not in Valve's current convar dump.",
    },
    lb_enable_binning: {
      label: "Light binning",
      description: "Sorts lights into screen bins before shading.",
    },
    lb_timesliced_shadows_dynamic_size: {
      label: "Time-sliced dynamic shadow size",
      description: UNDOCUMENTED,
    },
    r_citadel_shadow_caching: {
      label: "Shadow caching",
      description: "Caches shadow maps between frames.",
    },
    r_citadel_gpu_preview_baked_shadows: {
      label: "Preview baked shadows",
      description: UNDOCUMENTED,
    },
    r_citadel_cloak_blur_amount: {
      label: "Cloak blur",
      description: "Blur amount of the cloak effect.",
    },
    csm_viewmodel_farz: {
      label: "First-person shadow far plane",
      description: "Not in Valve's current convar dump.",
    },
    csm_viewmodel_nearz: {
      label: "First-person shadow near plane",
      description: "Near plane of the first-person model shadow.",
    },
    sparseshadowtree_disable_add_layers: {
      label: "Disable SST runtime layers",
      description:
        "Debug option that leaves runtime layers out of the sparse shadow tree.",
    },
    sparseshadowtree_leaf_precision_viewmodel: {
      label: "SST first-person precision",
      description:
        "Depth compression precision at sparse shadow tree leaves for first-person models.",
    },
    r_particle_newinput: {
      label: "Particle input path",
      description: "Input path in particle operators.",
    },
    animgraph_footlock_calculate_tilt: {
      label: "Foot lock tilt",
      description: "Tilts locked feet to the ground.",
    },
    animgraph_footlock_ground_roll: {
      label: "Foot lock ground roll",
      description: "Rolls locked feet to the ground.",
    },
    animgraph_footlock_hip_offset_enable: {
      label: "Foot lock hip offset",
      description: "Offsets the hips to keep locked feet on the ground.",
    },
    animgraph_footlock_ik_enable: {
      label: "Foot lock IK",
      description: "Inverse kinematics for foot locking.",
    },
    animgraph_footlock_trace_ground_enabled: {
      label: "Foot lock ground tracing",
      description: "Traces the ground for foot locking.",
    },
    animgraph_footlock_use_hip_shift: {
      label: "Foot lock hip shift",
      description: "Shifts the hips for foot locking.",
    },
    ik_fabrik_backwards_enabled: {
      label: "FABRIK backward pass",
      description: "Backward pass of the FABRIK inverse-kinematics solver.",
    },
    ik_fabrik_forwards_enabled: {
      label: "FABRIK forward pass",
      description: "Forward pass of the FABRIK inverse-kinematics solver.",
    },
    ik_debug_fabrik_backwards_enabled: {
      label: "FABRIK backward pass (debug)",
      description: "Debug switch for the FABRIK backward pass.",
    },
    ik_debug_fabrik_forwards_enabled: {
      label: "FABRIK forward pass (debug)",
      description: "Debug switch for the FABRIK forward pass.",
    },
    ik_debug_dogleg3bone_enabled: {
      label: "Three-bone IK (debug)",
      description: "Debug switch for the three-bone (dogleg) IK solver.",
    },
    cam_idealdelta: {
      label: "Third-person angle matching speed",
      description:
        "Speed at which the third-person camera matches its ideal angles.",
    },
    cam_ideallag: {
      label: "Third-person camera lag",
      description: "Lag when the third-person camera matches its ideal angles.",
    },
    citadel_camera_height: {
      label: "Camera height",
      description: "Vertical offset of the camera's look-at point.",
    },
    citadel_camera_listening_offset: {
      label: "Camera listening offset",
      description: UNDOCUMENTED,
    },
    citadel_camera_see_distance_max: {
      label: "Camera see distance",
      description: "Maximum distance at which the camera can see an entity.",
    },
    citadel_shoot_forward_offset: {
      label: "Shoot position offset",
      description:
        "How far forward the shoot position moves from the hero and camera plane. Replicated: servers use their own value.",
    },
    citadel_stuck_camera_trace_extra_length: {
      label: "Stuck camera trace length",
      description: UNDOCUMENTED,
    },
    citadel_tightcamera_alternative: {
      label: "Tight camera alternative",
      description: "Alternative tight-camera test mode.",
    },
    citadel_camera_height_ceiling_distance: {
      label: "Camera ceiling distance",
      description: "Not in Valve's current convar dump.",
    },
    citadel_camera_parrot_smoothing_rate: {
      label: "Camera unclip smoothing",
      description:
        "Smoothing back to the resting position after the camera stops being clipped. Not in Valve's current convar dump.",
    },
    citadel_reduce_camera_shake: {
      label: "Reduce camera shake",
      description: "Reduces camera shake.",
    },
    nav_edit_use_camera: {
      label: "Nav editor camera",
      description: "Navigation mesh editor setting.",
    },
    r_drawviewmodel: {
      label: "First-person models",
      description: "Renders first-person models.",
    },
    r_citadel_glow_health_bar_debug: {
      label: "Health bar glow debug",
      description: "Debug overlay for health bar glow.",
    },
    citadel_unit_status_allies_see_thru_walls_max_distance: {
      label: "Ally health bars through walls distance",
      description:
        "How far allied health bars show through walls. Not in Valve's current convar dump.",
    },
    citadel_unit_status_dpi: {
      label: "Health bar scale",
      description: "Not in Valve's current convar dump.",
    },
    citadel_unit_status_single_bar_mode: {
      label: "Single health bar",
      description:
        "Allows only one health bar, no stacking. Not in Valve's current convar dump.",
    },
    citadel_unit_status_use_v2: {
      label: "V2 health bars",
      description: "Not in Valve's current convar dump.",
    },
    citadel_unit_status_use_v2_for_nonplayers: {
      label: "V2 health bars for non-players",
      description: "Not in Valve's current convar dump.",
    },
    citadel_unit_status_stamina_low_pips: {
      label: "Low stamina pips",
      description: "Not in Valve's current convar dump.",
    },
  } satisfies Record<string, CuratedConvar>),
);
