import type { Category } from "../src/schema";

/**
 * `weight` is how much turning things off in a category moves a config toward
 * the Frames end of the Looks ⟷ Frames scale. It ranks configs against each
 * other; it is not a frame-rate estimate.
 */
export const CATEGORIES: Category[] = [
  { id: "shadows", label: "Shadows", weight: 3 },
  { id: "lighting", label: "Lighting & fog", weight: 2 },
  { id: "postprocessing", label: "Post-processing", weight: 2 },
  { id: "textures", label: "Textures & detail", weight: 2 },
  { id: "particles", label: "Particles & effects", weight: 2 },
  { id: "world", label: "World & LOD", weight: 2.5 },
  { id: "physics", label: "Physics & animation", weight: 1 },
  { id: "cpu", label: "CPU & threading", weight: 1 },
  { id: "network", label: "Network", weight: 0 },
  { id: "interface", label: "Interface", weight: 0.5 },
  { id: "audio", label: "Audio", weight: 0.5 },
  { id: "camera", label: "Camera & visibility", weight: 0 },
  { id: "other", label: "Other", weight: 0.5 },
];

/** Category for edits outside ConVars, by lower-case top-level section. */
export const SECTION_CATEGORIES = {
  animationsystem: "physics",
  engine2: "other",
  materialsystem2: "textures",
  memory: "other",
  networksystem: "network",
  nvngx: "postprocessing",
  particles: "particles",
  physics: "physics",
  rendersystem: "cpu",
  scenesystem: "shadows",
  soundsystem: "audio",
  worldrenderer: "world",
} satisfies Record<string, string>;

/** First match wins; names are matched lower-case. Gameplay convars go to `camera` first. */
export const CATEGORY_RULES: { pattern: RegExp; category: string }[] = [
  {
    pattern:
      /^panorama|^v8_|^cl_hud|^hud_|^cc_|closecaption|dashboard|^citadel_(hud|ui|minimap|damage|crosshair|subtitles|ping|settings|in_world|chat|shop|kill|death|show_)/,
    category: "interface",
  },
  { pattern: /^ai_|^nav|^npc/, category: "cpu" },
  {
    pattern:
      /shadow|^csm_|_csm_|^lb_csm|sparseshadowtree|cascade|^cl_globallight/,
    category: "shadows",
  },
  {
    pattern: /^citadel_camera|shake|wobble|_fov$|aspectratio|^cam_|viewmodel/,
    category: "camera",
  },
  {
    pattern:
      /fog|^lb_|light(?!_sensitivity)|envmap|cubemap|^r_rendersun|sun_|^r_aoproxy|lpv|probe|^kelvin|^r_world_lighting|^r_citadel_distancefield_reflections/,
    category: "lighting",
  },
  {
    pattern:
      /ssao|_ao_|_ao$|bloom|depth_of_field|^r_dof|motion_blur|tonemap|upscal|fsr|dlss|antialias|sharpen|^r_post|postprocess|vignette|color_?correction|colorblind|gamma|light_sensitivity|reduce_flash|exposure|^r_citadel_mboit|^r_low_latency|^panorama_disable_blur|pano_world_blur/,
    category: "postprocessing",
  },
  {
    pattern:
      /particle|^r_rain|splash|bloodspray|ejectbrass|^r_effects|^cl_impact|^effects_|^r_tracer|^cl_show_(bloodspray|splashes)|^cl_aggregate|^violence|gib|^fx_|impact_effects|muzzleflash/,
    category: "particles",
  },
  {
    pattern:
      /^phys|^cl_phys|ragdoll|cloth|boneflex|^anim|^ik_|skeleton|^props_break|breakable|shatterglass|^rope_|^cl_ragdoll|^citadel_ragdoll|morph/,
    category: "physics",
  },
  {
    pattern:
      /texture|^mat_|mip|decal|aniso|shader|material|filtering|displacement|^r_vma|^gpu_level|^gpu_mem_level|^mem_level|^r_citadel_half_res|^r_hair|^r_character/,
    category: "textures",
  },
  {
    pattern:
      /lod|cull|^r_farz|^r_mapextents|fade|^r_grass|clutter|skybox|^r_draw|rope|propsmaxdist|^props_|^r_world|wind|^sc_|^r_size|portal|distancefield|^r_water|foliage|portrait_world_renderer|^r_citadel_screenspace|^r_citadel_gpu_culling|aggregate/,
    category: "world",
  },
  {
    pattern:
      /thread|^r_frame_sync|queue_mode|^engine_|^host_|^fps_max|parallel|^job|^cl_async|^ai_|^nav|^npc|^cpu_level|^r_async|^sv_|^tick|^r_citadel_gpu|^r_vulkan|^vulkan|^r_dx11|cpu|^r_frame/,
    category: "cpu",
  },
  {
    pattern:
      /^net_|^cl_(updaterate|cmdrate|interp|lagcomp|clock|tickpacket|pred|smooth|resend|timeout)|^rate$|^cq_|packet|^cl_.*_net|^steam_datagram/,
    category: "network",
  },
  {
    pattern:
      /^snd|^audio|^voice|^dsp|^adsp|^music|^soundscape|^cl_audio|^volume$|opus|sound/,
    category: "audio",
  },
  {
    pattern: /^cl_showfps|^citadel_unit_status|^citadel_hero_/,
    category: "interface",
  },
];

/** Explicit category for keys the rules place wrong. */
export const CATEGORY_OVERRIDES = new Map(
  Object.entries({
    cpu_level: "cpu",
    gpu_level: "textures",
    gpu_mem_level: "textures",
    mem_level: "textures",
    r_citadel_distancefield_ao_quality: "postprocessing",
    r_citadel_distancefield_shadows: "shadows",
    r_citadel_distancefield_enable: "lighting",
    r_distancefield_enable: "lighting",
    citadel_portrait_world_renderer_off: "interface",
    r_dashboard_render_quality: "interface",
    panorama_disable_box_shadow: "interface",
    panorama_disable_blur: "interface",
    panorama_max_fps: "interface",
    fps_max_ui: "interface",
    mat_viewportscale: "postprocessing",
    mat_vsync: "cpu",
    r_texturefilteringquality: "textures",
    enable_boneflex: "physics",
    cl_ragdoll_limit: "physics",
    cl_phys_timescale: "physics",
    r_drawropes: "world",
    r_ropetranslucent: "world",
    r_citadel_enable_pano_world_blur: "interface",
    mat_colcorrection_disableentities: "postprocessing",
    r_render_hair: "textures",
    r_haircull_percent: "textures",
    r_strip_invisible_during_sceneobject_update: "cpu",
    r_enable_rigid_animation: "physics",
    citadel_use_pvs_for_players: "world",
    cl_simulate_dormant_entities: "cpu",
    cl_batch_entity_list_ops_during_latch: "cpu",
    cl_skip_hierarchy_update_for_unchanged_entities: "cpu",
    cl_bone_cache_optimization: "cpu",
    citadel_bullet_shot_offset_fade_time: "other",
    sv_waterdist: "world",
    snd_steamaudio_num_threads: "audio",
    citadel_video_preset: "other",
    thumper_use_plane_reflection: "lighting",
    r_skip_precache_validation_check: "cpu",
    r_pipeline_stats_use_flush_api: "cpu",
  } satisfies Record<string, string>),
);
