//! video.txt, with the in-game video menu's names and values for each setting.

use super::kv::parse_kv;
use super::{ParsedConfig, ParsedLeaf, clean, collapse};
use crate::mod_manager::perf_config::live::normalize_value;
use crate::mod_manager::perf_config::types::{
  IgnoredKind, IgnoredPart, ImportFormat, VideoSetting,
};

/// Header keys naming the author's GPU. Never written: the game uses them to
/// spot a new graphics card and reset its settings.
const MACHINE_SPECIFIC_HEADER: &[&str] = &["vendorid", "deviceid"];

enum MenuValues {
  Options(&'static [(&'static str, &'static str)]),
  Toggle,
  Percent,
  FpsLimit,
  Plain,
}

/// The game's video menu (`panorama/layout/popups/popup_settings.xml` and its
/// English strings): option name and the values each choice writes.
const MENU_SETTINGS: &[(&str, &str, MenuValues)] = &[
  (
    "r_citadel_upscaling",
    "Upscaling technology",
    MenuValues::Options(&[
      ("0", "Stretch"),
      ("1", "FSR"),
      ("2", "FSR2 (TAA)"),
      ("3", "FSR3 (TAA)"),
      ("4", "NVIDIA DLSS"),
    ]),
  ),
  ("mat_viewportscale", "Render quality", MenuValues::Percent),
  (
    "r_citadel_dlss_settings_mode",
    "Scaling mode",
    MenuValues::Options(&[
      ("0", "Auto"),
      ("1", "2x"),
      ("2", "1.7x"),
      ("3", "1.5x"),
      ("4", "1x (DLAA)"),
    ]),
  ),
  (
    "r_dlss_preset",
    "DLSS Model",
    MenuValues::Options(&[("6", "CNN"), ("10", "Transformer")]),
  ),
  (
    "r_citadel_fsr_rcas_sharpness",
    "FSR sharpness",
    MenuValues::Percent,
  ),
  (
    "r_citadel_fsr2_sharpness",
    "FSR sharpness",
    MenuValues::Percent,
  ),
  (
    "r_citadel_antialiasing",
    "Anti-aliasing",
    MenuValues::Options(&[("0", "None"), ("1", "FXAA")]),
  ),
  (
    "r_citadel_ssao_quality",
    "Screen space AO",
    MenuValues::Options(&[
      ("0", "Off"),
      ("1", "Low"),
      ("2", "Med"),
      ("3", "High"),
      ("4", "Ultra"),
    ]),
  ),
  (
    "r_citadel_shadow_quality",
    "Shadow quality",
    MenuValues::Options(&[("0", "Low"), ("1", "Med"), ("2", "High"), ("3", "Ultra")]),
  ),
  (
    "r_citadel_fog_quality",
    "Fog quality",
    MenuValues::Options(&[("0", "Low"), ("1", "High")]),
  ),
  (
    "r_texture_stream_mip_bias",
    "Texture quality",
    MenuValues::Options(&[("2", "Low"), ("1", "Med"), ("0", "High")]),
  ),
  ("r_post_bloom", "Post process bloom", MenuValues::Toggle),
  ("r_effects_bloom", "Effects bloom", MenuValues::Toggle),
  ("mat_vsync", "VSync", MenuValues::Toggle),
  ("r_arealights", "Area lights", MenuValues::Toggle),
  ("r_depth_of_field", "Depth of field", MenuValues::Toggle),
  ("fps_max", "In-game maximum FPS", MenuValues::FpsLimit),
  (
    "r_low_latency",
    "NVIDIA Reflex",
    MenuValues::Options(&[
      ("0", "Disabled"),
      ("1", "Enabled"),
      ("2", "Enabled + Boost"),
    ]),
  ),
  (
    "r_fullscreen_gamma",
    "Full Screen Brightness",
    MenuValues::Plain,
  ),
];

/// Reads `setting.*` values from a video.txt, a `"video.cfg"` block or a
/// headerless fragment. Machine-specific keys and device ids are reported,
/// never recommended.
pub(super) fn parse_video(text: &str) -> ParsedConfig {
  let text = clean(text);
  let document = parse_kv(&text);
  let mut ignored = document.errors;
  let unreadable_lines = document.unreadable_lines;
  let mut settings = Vec::new();
  for leaf in document.leaves {
    let Some(key) = leaf.path.last() else {
      continue;
    };
    let lower = key.to_ascii_lowercase();
    match lower.strip_prefix("setting.") {
      Some(_) => settings.push(ParsedLeaf {
        path: vec![key["setting.".len()..].to_string()],
        value: leaf.value,
        line: leaf.line,
      }),
      None if MACHINE_SPECIFIC_HEADER.contains(&lower.as_str()) => ignored.push(IgnoredPart {
        kind: IgnoredKind::MachineSpecific,
        detail: key.clone(),
        line: Some(leaf.line),
      }),
      None => {}
    }
  }
  let (entries, duplicates) = collapse(&settings);
  ignored.extend(duplicates);
  ignored.sort_by_key(|part| part.line);
  let video_settings = entries
    .into_iter()
    .filter_map(|entry| {
      let value = entry.value?;
      Some(video_setting(&entry.path[0], value))
    })
    .collect();
  ParsedConfig {
    format: ImportFormat::VideoTxt,
    leaves: Vec::new(),
    ignored,
    video_settings,
    unreadable_lines,
  }
}

fn video_setting(key: &str, value: String) -> VideoSetting {
  let menu = MENU_SETTINGS
    .iter()
    .find(|(name, _, _)| name.eq_ignore_ascii_case(key));
  let display = menu.and_then(|(_, _, values)| menu_display(values, &value));
  VideoSetting {
    key: key.to_string(),
    label: menu.map(|(_, label, _)| (*label).to_string()),
    display,
    value,
  }
}

fn menu_display(values: &MenuValues, value: &str) -> Option<String> {
  let normalized = normalize_value(value);
  match values {
    MenuValues::Options(options) => options
      .iter()
      .find(|(option, _)| normalize_value(option) == normalized)
      .map(|(_, label)| (*label).to_string()),
    MenuValues::Toggle => match normalized.as_str() {
      "1" => Some("On".to_string()),
      "0" => Some("Off".to_string()),
      _ => None,
    },
    MenuValues::Percent => {
      let fraction: f64 = value.trim().parse().ok()?;
      fraction
        .is_finite()
        .then(|| format!("{}%", (fraction * 100.0).round()))
    }
    MenuValues::FpsLimit => match normalized.as_str() {
      "0" => Some("No limit".to_string()),
      _ => value
        .trim()
        .parse::<f64>()
        .ok()
        .map(|fps| format!("{}", fps.round())),
    },
    MenuValues::Plain => None,
  }
}
