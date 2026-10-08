import type { ConvarMeta } from "../src/schema";

type GameplayClass = NonNullable<ConvarMeta["gameplay"]>;

interface GameplayRule {
  class: GameplayClass;
  why?: string;
}

/**
 * Convars that change what the player sees or how the camera frames the world,
 * rather than how fast the game renders. Camera and visibility settings apply
 * as the author set them and can be turned off one by one; developer, debug and
 * hideout tools stay off unless the user enables them.
 *
 * Enforcement (adapted from Grimoire's opt-in rule): every key a preset sets
 * that matches one of `GAMEPLAY_PATTERNS` must appear in `GAMEPLAY`, in
 * `ALLOW_IN_BODY` with a reason, or be denied in `rules.ts`. The generator fails
 * otherwise, so an upstream bump that adds a new outline or FOV convar cannot
 * slip into a preset unnoticed.
 */
export const GAMEPLAY_PATTERNS: RegExp[] = [
  /timescale/,
  /outline/,
  /glow/,
  /see_thru/,
  /_fov$/,
  /aspectratio/,
  /camera_pitch/,
  /citadel_unit_status_/,
  /debug_draw/,
  /debug_show/,
  /hideout/,
  /camera/,
  /^cam_/,
];

/** Explicit classification, with the reason where it isn't obvious from the name. */
export const GAMEPLAY = new Map(
  Object.entries({
    // Enemy and unit visibility
    citadel_player_outline_enemies: { class: "visibility" },
    citadel_trooper_outline_enabled: { class: "visibility" },
    citadel_trooper_friendly_glow_disabled: { class: "visibility" },
    citadel_trooper_glow_disabled: { class: "visibility" },
    citadel_player_glow_disabled: { class: "visibility" },
    citadel_boss_glow_disabled: { class: "visibility" },
    citadel_unit_status_allies_see_thru_walls: { class: "visibility" },
    citadel_unit_status_allies_see_thru_walls_max_distance: {
      class: "visibility",
    },
    citadel_unit_status_use_new: {
      class: "visibility",
      why: "Swaps the health bar style; authors disagree about it.",
    },
    citadel_unit_status_hide_names: {
      class: "visibility",
      why: "Hides the names drawn over unit health bars.",
    },
    citadel_unit_status_use_v2: {
      class: "visibility",
      why: "Swaps the health bar style.",
    },
    citadel_unit_status_use_v2_for_nonplayers: {
      class: "visibility",
      why: "Uses the v2 health bar for troopers, objectives and camps.",
    },
    citadel_unit_status_single_bar_mode: {
      class: "visibility",
      why: "Collapses the health bar into one bar.",
    },
    citadel_unit_status_delta_decay_delay: {
      class: "visibility",
      why: "How long recent damage stays readable on a health bar.",
    },
    citadel_unit_status_delta_decay_rate: {
      class: "visibility",
      why: "How fast recent damage fades from a health bar.",
    },
    citadel_unit_status_dpi: {
      class: "visibility",
      why: "Scales health bars for readability.",
    },
    citadel_unit_status_stamina_low_pips: {
      class: "visibility",
      why: "How much of the stamina display stays on screen.",
    },
    citadel_unit_status_recent_active_damage_time: {
      class: "visibility",
      why: "How long recent damage stays highlighted on a health bar.",
    },
    citadel_unit_status_hero_name_mode: {
      class: "visibility",
      why: "Name shown above hero bars.",
    },
    r_particle_timescale: {
      class: "visibility",
      why: "Speeds up particle effects so they visibly end before the ability does.",
    },
    cl_glow_brightness: { class: "visibility" },
    r_citadel_outlines: { class: "visibility" },
    r_citadel_npr_outlines: { class: "visibility" },
    r_citadel_npr_outlines_max_dist: { class: "visibility" },
    r_citadel_glow_health_bars: { class: "visibility" },
    r_citadel_selection_outline2_alpha: { class: "visibility" },
    r_citadel_selection_outline2_offset: { class: "visibility" },
    r_citadel_selection_outline2_width: { class: "visibility" },
    r_citadel_npr_force_solid_outline: { class: "visibility" },
    citadel_player_glow_from_teammate_vision_max_range: { class: "visibility" },
    r_citadel_clip_sphere_min_opacity: {
      class: "visibility",
      why: "How transparent objects between the camera and your hero become; 0 makes them fully see-through.",
    },
    // Camera and field of view
    r_aspectratio: {
      class: "camera",
      why: "Stretches the view horizontally (a wider field of view).",
    },
    citadel_camera_hero_fov: { class: "camera" },
    default_fov: { class: "camera" },
    viewmodel_fov: { class: "camera" },
    citadel_camera_pitch_max: { class: "camera" },
    citadel_camera_pitch_min: { class: "camera" },
    citadel_camera_pitch_default: { class: "camera" },
    citadel_camera_height: {
      class: "camera",
      why: "Vertical offset of the camera's look-at point.",
    },
    citadel_camera_listening_offset: { class: "camera" },
    citadel_camera_soft_collision: {
      class: "camera",
      why: "How the camera behaves against walls.",
    },
    citadel_camera_soft_collision_angle: { class: "camera" },
    citadel_camera_wobble_disable: {
      class: "camera",
      why: "Camera wobble on hits; a comfort preference.",
    },
    citadel_camera_use_vmdl_flatten_horizontal: { class: "camera" },
    citadel_camera_use_vmdl_flatten_vertical: { class: "camera" },
    citadel_camera_parrot_smoothing_rate: { class: "camera" },
    citadel_camera_height_ceiling_distance: { class: "camera" },
    citadel_stuck_camera_trace_extra_length: { class: "camera" },
    citadel_tightcamera_alternative: { class: "camera" },
    citadel_melee_shake_amplitude: {
      class: "camera",
      why: "Screen shake on melee hits; a comfort preference.",
    },
    citadel_melee_shake_duration: {
      class: "camera",
      why: "Screen shake on melee hits; a comfort preference.",
    },
    citadel_shoot_forward_offset: {
      class: "camera",
      why: "Moves the shoot position relative to the camera.",
    },
    citadel_reduce_camera_shake: {
      class: "camera",
      why: "Camera shake; a comfort preference.",
    },
    cam_idealdelta: { class: "camera" },
    cam_ideallag: { class: "camera" },
    rpg_camera_yaw: { class: "camera" },
    citadel_camera_see_distance_max: {
      class: "visibility",
      why: "How far the camera can see entities.",
    },
    r_drawviewmodel: { class: "visibility", why: "Hides first-person models." },
    citadel_damage_offscreen_indicator_disabled: {
      class: "visibility",
      why: "Hides the indicators for damage from units you can't see.",
    },
    sv_hide_ent_in_pvs: {
      class: "visibility",
      why: "Server-side entity visibility.",
    },
    sv_force_transmit_players: {
      class: "visibility",
      why: "Server-side player transmission.",
    },
    // Developer, debug and hideout tools
    citadel_hideout_enable_testing_tools: { class: "devtools" },
    movement_stats_debug_draw: { class: "devtools" },
    citadel_orb_debug_draw_state: { class: "devtools" },
    music_hideout_debug_enabled: { class: "devtools" },
    nav_edit_use_camera: {
      class: "devtools",
      why: "Navigation mesh editor setting.",
    },
    citadel_hideout_ball_show_juggle_count: {
      class: "devtools",
      why: "Hideout-only overlay.",
    },
    citadel_hideout_ball_show_juggle_fx: {
      class: "devtools",
      why: "Hideout-only effect.",
    },
  } satisfies Record<string, GameplayRule>),
);

/** Keys that match a pattern but are ordinary performance settings, with the reason. */
export const ALLOW_IN_BODY = new Map(
  Object.entries({
    cl_phys_timescale:
      "Matches the timescale pattern but is the physics simulation speed; presets set it to 1, the normal speed.",
    debug_draw_enable:
      "Presets set it to false, which turns debug drawing off.",
    r_citadel_glow_health_bar_debug:
      "Presets set it to false, which turns a debug overlay off.",
    citadel_unit_status_old_update_rate:
      "Caps how often health bars redraw; it changes redraw cost, not what the bars show.",
    citadel_hud_objective_health_debug_show_midboss:
      "Presets set it to false, the engine default, which keeps a debug overlay off.",
  } satisfies Record<string, string>),
);

/**
 * Classification for keys no preset sets, so the settings editor can still
 * group them. Explicit entries above always win.
 */
export const PATTERN_DEFAULTS: { pattern: RegExp; class: GameplayClass }[] = [
  { pattern: /debug_draw|debug_show|hideout/, class: "devtools" },
  { pattern: /_fov$|aspectratio|camera|^cam_/, class: "camera" },
  {
    pattern: /outline|glow|see_thru|citadel_unit_status_/,
    class: "visibility",
  },
];
