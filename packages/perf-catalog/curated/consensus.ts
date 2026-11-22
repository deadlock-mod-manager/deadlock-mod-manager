export const MIN_LINEAGES = 3;
export const MIN_AGREEMENT = 0.75;

export const HIDES_THINGS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /^r_farz$|^r_mapextents$/,
    reason: "Draw distance: distant buildings and players pop in.",
  },
  {
    pattern: /size_cull|_cull_|cull_threshold/,
    reason: "Culls small or distant objects.",
  },
  {
    pattern: /lod_scale|lod_bias|^r_lod$/,
    reason: "Swaps to lower-detail models sooner.",
  },
  {
    pattern: /fade_distance|_fade$|start_fade|end_fade/,
    reason: "Fades objects out at a distance.",
  },
  {
    pattern: /^r_propsmaxdist$|^props_/,
    reason: "Hides props or breakable pieces.",
  },
  {
    pattern: /^cl_ragdoll_limit$/,
    reason: "Upstream FAQ: hides Doorman's ultimate indicator.",
  },
  {
    pattern: /^r_draw|^r_render_hair$/,
    reason: "Turns off drawing of a whole class of objects.",
  },
  {
    pattern: /^r_rendersun$|skybox|sunlight/,
    reason: "Removes the sun, its light or the 3D skybox.",
  },
  {
    pattern: /^fog_enable$/,
    reason: "Removes fog, which changes how far players can see.",
  },
  {
    pattern: /pvs/,
    reason: "Changes which players and objects are considered visible.",
  },
  { pattern: /^r_grass|^sc_clutter/, reason: "Removes grass and clutter." },
  {
    pattern: /decal/,
    reason: "Removes decals, which some abilities use as indicators.",
  },
  {
    pattern: /^cl_show_|^violence_|ejectbrass/,
    reason: "Removes effects such as splashes or blood.",
  },
  { pattern: /rope/, reason: "Changes how ropes and cables are drawn." },
  {
    pattern: /max_count$|_max_size_cull$/,
    reason: "Caps how many effects can be on screen.",
  },
  {
    pattern: /^citadel_portrait_world_renderer_off$/,
    reason: "Hides hero models in the shop and end screen.",
  },
  {
    pattern: /^lb_enable_dynamic_lights$/,
    reason: "Upstream FAQ: hero portraits go dark.",
  },
  { pattern: /^cl_phys_props/, reason: "Removes physics props." },
];
