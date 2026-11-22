/**
 * DMM Clean is derived, not hand-written. For every ConVar, each lineage of
 * the pinned upstream configs (see `UPSTREAM_FILES`) votes with the value its
 * configs set relative to their own base build (majority within the lineage).
 * A value makes it in when:
 *
 * 1. at least `MIN_LINEAGES` lineages vote for it, and they are at least
 *    `MIN_AGREEMENT` of the lineages that change the key at all;
 * 2. the convar is in the current dump and not blocked (`gameinfo_cannot_override`);
 * 3. it isn't denied, has no gameplay class (camera, visibility, devtools) and
 *    isn't in the Camera & visibility category;
 * 4. the in-game video menu doesn't control it (`curated/video.ts`): the
 *    player's menu choice is saved in video.txt and wins over gameinfo.gi;
 * 5. it doesn't match `HIDES_THINGS` below;
 * 6. the value is inside the convar's min/max and differs from the latest stock
 *    value (or the code default when stock doesn't set it).
 */
export const MIN_LINEAGES = 3;
export const MIN_AGREEMENT = 0.75;

/**
 * Settings that make things disappear or change what a player can see, rather
 * than render the same thing cheaper. DMM Clean leaves all of these at stock.
 */
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
