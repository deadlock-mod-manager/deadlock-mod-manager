/**
 * In-game video menu options, as Deadlock words them
 * (`panorama/layout/popups/popup_settings.xml` + `citadel_main_english.txt`).
 * Only these keys are taken from an author's video.txt: resolution, monitor,
 * window mode, device ids and the keys the menu doesn't expose are left out.
 */
export interface VideoMenuOption {
  label: string;
  /** Menu value (normalized) to the text the menu shows. */
  values?: Record<string, string>;
  /** Slider shown as a percentage of the value. */
  percent?: boolean;
  /** Slider range; values outside it can't be set from the menu. */
  range?: [number, number];
  bool?: boolean;
}

const QUALITY_4 = { "0": "Low", "1": "Med", "2": "High", "3": "Ultra" };

export const VIDEO_MENU = new Map(
  Object.entries<VideoMenuOption>({
    r_citadel_upscaling: {
      label: "Upscaling technology",
      values: {
        "0": "Stretch",
        "1": "FSR",
        "2": "FSR2 (TAA)",
        "3": "FSR3 (TAA)",
        "4": "NVIDIA DLSS",
      },
    },
    mat_viewportscale: {
      label: "Render quality",
      percent: true,
      range: [0.4, 1],
    },
    r_citadel_dlss_settings_mode: {
      label: "Scaling mode (DLSS)",
      values: {
        "4": "1x (DLAA)",
        "3": "1.5x",
        "2": "1.7x",
        "1": "2x",
        "0": "Auto",
      },
    },
    r_dlss_preset: {
      label: "DLSS Model",
      values: { "6": "CNN", "10": "Transformer" },
    },
    r_citadel_fsr_rcas_sharpness: {
      label: "FSR sharpness",
      percent: true,
      range: [0, 1],
    },
    r_citadel_fsr2_sharpness: {
      label: "FSR sharpness (FSR2)",
      percent: true,
      range: [0, 1],
    },
    r_citadel_antialiasing: {
      label: "Anti-aliasing",
      values: { "0": "None", "1": "FXAA" },
    },
    r_citadel_ssao_quality: {
      label: "Screen space AO",
      values: { "0": "Off", "1": "Low", "2": "Med", "3": "High", "4": "Ultra" },
    },
    r_citadel_shadow_quality: { label: "Shadow quality", values: QUALITY_4 },
    r_citadel_fog_quality: {
      label: "Fog quality",
      values: { "0": "Low", "1": "High" },
    },
    r_texture_stream_mip_bias: {
      label: "Texture quality",
      values: { "2": "Low", "1": "Med", "0": "High" },
    },
    r_post_bloom: { label: "Post process bloom", bool: true },
    r_effects_bloom: { label: "Effects bloom", bool: true },
    mat_vsync: { label: "VSync", bool: true },
    r_arealights: { label: "Area lights", bool: true },
    r_depth_of_field: { label: "Depth of field", bool: true },
    fps_max: { label: "In-game maximum FPS", range: [60, 1000] },
    r_low_latency: {
      label: "NVIDIA Reflex",
      values: { "0": "Disabled", "1": "Enabled", "2": "Enabled + Boost" },
    },
    r_light_sensitivity_mode: { label: "Reduce flashing effects", bool: true },
  }),
);
