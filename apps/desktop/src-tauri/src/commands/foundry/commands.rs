use std::io::Cursor;
use std::path::PathBuf;

use base64::Engine;
use image::codecs::png::PngEncoder;
use image::{ExtendedColorType, ImageEncoder};
use vpkmanager::source2::sound::VsndAudio;

use crate::errors::Error;

use super::analyze::{analyze_default_hero, analyze_vpk_path, decode_foundry_cards};
use super::export::{ExportDestination, FoundryExportResult, export_workspace};
use super::paint::{describe_paint_targets, model_paint_parts, paint_parts, paint_target};
use super::palette::{sample_color_map, skin_palette};
use super::remove_parts::remove_parts;
use super::sounds::find_mp3_payload;
use super::types::{
  ExportDestinationKind, FoundryAppliedPaint, FoundryBuildResult, FoundryCardPreview,
  FoundryManifest, FoundryPaintPart, FoundryPaintResult, FoundryPaintTargetInfo,
  FoundryRemovedParts, FoundryReplacementResult, FoundrySoundPreview, FoundrySoundSettings,
  FoundryTexture, FoundryWorkspace, PaintTarget,
};
use super::workspace::{
  adjust_workspace_sound, build_workspace_vpk, entry_bytes_from_sources, hue_of, parse_hex_color,
  prepare_workspace, record_edits, record_paint, replace_workspace_file, revert_workspace_file,
};
use crate::vpk_archive_cache::clear_archive_cache;

#[tauri::command]
pub async fn foundry_analyze_vpk(file_path: String) -> Result<FoundryManifest, Error> {
  tauri::async_runtime::spawn_blocking(move || analyze_vpk_path(&PathBuf::from(file_path)))
    .await
    .map_err(|e| Error::InvalidInput(format!("VPK analysis task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_analyze_default_hero(hero_display: String) -> Result<FoundryManifest, Error> {
  tauri::async_runtime::spawn_blocking(move || analyze_default_hero(hero_display))
    .await
    .map_err(|e| Error::InvalidInput(format!("default hero analysis task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_prepare_workspace(
  file_path: String,
  name: String,
  entries: Option<Vec<String>>,
  force: Option<bool>,
) -> Result<FoundryWorkspace, Error> {
  let force = force.unwrap_or(false);
  tauri::async_runtime::spawn_blocking(move || {
    prepare_workspace(PathBuf::from(file_path), name, entries, force)
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("workspace task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_build_workspace_vpk(
  workspace_root: String,
  output_path: Option<String>,
  name: Option<String>,
) -> Result<FoundryBuildResult, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    build_workspace_vpk(
      PathBuf::from(workspace_root),
      output_path.map(PathBuf::from),
      name,
    )
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("VPK build task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_export_workspace(
  workspace_root: String,
  destination: ExportDestinationKind,
  name: Option<String>,
  output_path: Option<String>,
  source_path: Option<String>,
) -> Result<FoundryExportResult, Error> {
  let display_name = name.clone().unwrap_or_else(|| "Foundry skin".to_string());
  let destination = match destination {
    ExportDestinationKind::File => ExportDestination::File {
      output_path: PathBuf::from(output_path.ok_or_else(|| {
        Error::InvalidInput("exporting to a file needs an output path".to_string())
      })?),
    },
    ExportDestinationKind::NewMod => ExportDestination::NewMod { name: display_name },
    ExportDestinationKind::ReplaceSource => ExportDestination::ReplaceSource {
      source_path: PathBuf::from(source_path.filter(|path| !path.is_empty()).ok_or_else(|| {
        Error::InvalidInput(
          "this skin was not loaded from a mod, so there is nothing to replace".to_string(),
        )
      })?),
    },
  };

  tauri::async_runtime::spawn_blocking(move || {
    export_workspace(PathBuf::from(workspace_root), destination, name)
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("export task failed: {e}")))?
}

#[tauri::command]
pub fn foundry_release_archives() {
  clear_archive_cache();
}

#[tauri::command]
pub async fn foundry_replace_workspace_file(
  workspace_root: String,
  entry_path: String,
  source_file_path: String,
  template_vpk_path: Option<String>,
) -> Result<FoundryReplacementResult, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    replace_workspace_file(
      PathBuf::from(workspace_root),
      entry_path,
      PathBuf::from(source_file_path),
      template_vpk_path.map(PathBuf::from),
    )
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("workspace replacement task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_skin_palette(
  file_path: String,
  textures: Vec<String>,
  workspace_root: Option<String>,
) -> Result<Vec<String>, Error> {
  let vpk_path = PathBuf::from(&file_path);
  tauri::async_runtime::spawn_blocking(move || {
    let workspace = workspace_root.map(PathBuf::from);
    let maps: Vec<Vec<u8>> = textures
      .iter()
      .filter_map(|texture| {
        entry_bytes_from_sources(workspace.as_deref(), &vpk_path, texture)
          .ok()
          .and_then(sample_color_map)
      })
      .collect();
    Ok(
      skin_palette(&maps)
        .into_iter()
        .map(|[r, g, b]| format!("#{r:02x}{g:02x}{b:02x}"))
        .collect(),
    )
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("skin palette task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_paint_targets(
  file_path: String,
  workspace_root: Option<String>,
  hero_display: Option<String>,
) -> Result<Vec<FoundryPaintTargetInfo>, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    describe_paint_targets(
      &PathBuf::from(file_path),
      workspace_root.as_ref().map(PathBuf::from).as_deref(),
      hero_display.as_deref(),
    )
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("paint target scan failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_paint_target(
  workspace_root: String,
  file_path: String,
  target: PaintTarget,
  hero_display: Option<String>,
  color_hex: String,
  saturation: Option<f32>,
  brightness: Option<f32>,
  pattern: Option<String>,
  pattern_intensity: Option<f32>,
  pattern_phase: Option<f32>,
) -> Result<FoundryPaintResult, Error> {
  let applied = FoundryAppliedPaint {
    entry_path: String::new(),
    color_hex: color_hex.clone(),
    saturation: saturation.unwrap_or(1.0),
    brightness: brightness.unwrap_or(1.0),
    pattern: pattern.clone(),
    pattern_intensity: pattern_intensity.unwrap_or(1.0),
    pattern_phase: pattern_phase.unwrap_or(0.0),
  };
  let color = parse_hex_color(&color_hex)?;
  let recolor = vpkmanager::Recolor::new(
    f64::from(hue_of(color)),
    f64::from(saturation.unwrap_or(1.0).clamp(0.0, 3.0)),
    f64::from(brightness.unwrap_or(1.0).clamp(0.2, 2.0)),
  );
  let pattern = parse_pattern(pattern.as_deref(), pattern_intensity, pattern_phase)?;
  tauri::async_runtime::spawn_blocking(move || {
    let root = PathBuf::from(workspace_root);
    let result = paint_target(
      root.clone(),
      PathBuf::from(file_path),
      target,
      hero_display,
      recolor,
      pattern,
    )?;
    record_edits(&root, &result.painted_paths, true)?;
    record_paint(&root, &result.painted_paths, Some(&applied))?;
    Ok(result)
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("paint task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_model_parts(
  file_path: String,
  model_path: String,
  hero_display: Option<String>,
) -> Result<Vec<FoundryPaintPart>, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    model_paint_parts(
      &PathBuf::from(file_path),
      &model_path,
      hero_display.as_deref(),
    )
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("part scan failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_paint_parts(
  workspace_root: String,
  file_path: String,
  model_path: String,
  hero_display: Option<String>,
  textures: Vec<String>,
  color_hex: String,
  saturation: Option<f32>,
  brightness: Option<f32>,
  pattern: Option<String>,
  pattern_intensity: Option<f32>,
  pattern_phase: Option<f32>,
) -> Result<FoundryPaintResult, Error> {
  if textures.is_empty() {
    return Err(Error::InvalidInput("no parts selected".into()));
  }
  let applied = FoundryAppliedPaint {
    entry_path: String::new(),
    color_hex: color_hex.clone(),
    saturation: saturation.unwrap_or(1.0),
    brightness: brightness.unwrap_or(1.0),
    pattern: pattern.clone(),
    pattern_intensity: pattern_intensity.unwrap_or(1.0),
    pattern_phase: pattern_phase.unwrap_or(0.0),
  };
  let color = parse_hex_color(&color_hex)?;
  let recolor = vpkmanager::Recolor::new(
    f64::from(hue_of(color)),
    f64::from(saturation.unwrap_or(1.0).clamp(0.0, 3.0)),
    f64::from(brightness.unwrap_or(1.0).clamp(0.2, 2.0)),
  );
  let pattern = parse_pattern(pattern.as_deref(), pattern_intensity, pattern_phase)?;
  tauri::async_runtime::spawn_blocking(move || {
    let root = PathBuf::from(workspace_root);
    let result = paint_parts(
      root.clone(),
      PathBuf::from(file_path),
      &model_path,
      hero_display,
      textures,
      recolor,
      pattern,
    )?;
    record_edits(&root, &result.painted_paths, true)?;
    record_paint(&root, &result.painted_paths, Some(&applied))?;
    Ok(result)
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("paint task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_remove_parts(
  workspace_root: String,
  file_path: String,
  model_path: String,
  hero_display: Option<String>,
  textures: Vec<String>,
) -> Result<FoundryRemovedParts, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    remove_parts(
      PathBuf::from(workspace_root),
      PathBuf::from(file_path),
      &model_path,
      hero_display.as_deref(),
      textures,
    )
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("part removal task failed: {e}")))?
}

fn parse_pattern(
  name: Option<&str>,
  intensity: Option<f32>,
  phase: Option<f32>,
) -> Result<Option<vpkmanager::Pattern>, Error> {
  let Some(name) = name.filter(|name| !name.is_empty() && *name != "none") else {
    return Ok(None);
  };
  let style = vpkmanager::PatternStyle::parse(name)
    .ok_or_else(|| Error::InvalidInput(format!("unknown pattern: {name}")))?;
  Ok(Some(vpkmanager::Pattern::new(
    style,
    intensity.unwrap_or(1.0),
    phase.unwrap_or(0.0),
  )))
}

#[tauri::command]
pub async fn foundry_pattern_swatch(
  pattern: String,
  phase: Option<f32>,
  size: Option<u32>,
) -> Result<String, Error> {
  let style = vpkmanager::PatternStyle::parse(&pattern)
    .ok_or_else(|| Error::InvalidInput(format!("unknown pattern: {pattern}")))?;
  let size = size.unwrap_or(96).clamp(16, 256);
  tauri::async_runtime::spawn_blocking(move || {
    let rgba = vpkmanager::pattern_swatch(
      vpkmanager::Pattern::new(style, 1.0, phase.unwrap_or(0.0)),
      size,
    );
    let mut png = Vec::new();
    PngEncoder::new(Cursor::new(&mut png))
      .write_image(&rgba, size, size, ExtendedColorType::Rgba8)
      .map_err(|e| Error::InvalidInput(format!("failed to encode swatch: {e}")))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
    Ok(format!("data:image/png;base64,{b64}"))
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("swatch task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_revert_workspace_file(
  workspace_root: String,
  entry_path: String,
  template_vpk_path: Option<String>,
) -> Result<(), Error> {
  tauri::async_runtime::spawn_blocking(move || {
    revert_workspace_file(
      PathBuf::from(workspace_root),
      entry_path,
      template_vpk_path.map(PathBuf::from),
    )
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("workspace revert task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_adjust_sound(
  workspace_root: String,
  entry_path: String,
  template_vpk_path: Option<String>,
  gain_db: f32,
  normalize: bool,
  mute: bool,
) -> Result<FoundrySoundSettings, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    adjust_workspace_sound(
      PathBuf::from(workspace_root),
      entry_path,
      template_vpk_path.map(PathBuf::from),
      vpkmanager::SoundAdjust {
        gain_db,
        normalize,
        mute,
      },
    )
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("sound adjust task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_decode_texture(
  file_path: String,
  entry_path: String,
  workspace_root: Option<String>,
  opaque: Option<bool>,
) -> Result<FoundryTexture, Error> {
  let vpk_path = PathBuf::from(&file_path);
  tauri::async_runtime::spawn_blocking(move || {
    let bytes = entry_bytes_from_sources(
      workspace_root.as_ref().map(PathBuf::from).as_deref(),
      &vpk_path,
      &entry_path,
    )?;
    let decoded = source2_model::decode_texture_png_bytes(bytes, opaque.unwrap_or(false))
      .map_err(|e| Error::InvalidInput(format!("failed to decode texture: {e}")))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&decoded.png);
    Ok(FoundryTexture {
      width: decoded.width,
      height: decoded.height,
      data_url: format!("data:image/png;base64,{b64}"),
    })
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("texture decode task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_decode_cards(
  file_path: String,
  hero: Option<String>,
  hero_display: Option<String>,
  workspace_root: Option<String>,
) -> Result<Vec<FoundryCardPreview>, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    decode_foundry_cards(
      PathBuf::from(file_path),
      hero,
      hero_display,
      workspace_root.map(PathBuf::from),
    )
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("card decode task failed: {e}")))?
}

#[tauri::command]
pub async fn foundry_decode_sound(
  file_path: String,
  entry_path: String,
  workspace_root: Option<String>,
) -> Result<FoundrySoundPreview, Error> {
  let vpk_path = PathBuf::from(&file_path);
  tauri::async_runtime::spawn_blocking(move || {
    let bytes = entry_bytes_from_sources(
      workspace_root.as_ref().map(PathBuf::from).as_deref(),
      &vpk_path,
      &entry_path,
    )?;
    let (audio, mime_type) = match vpkmanager::source2::sound::extract_vsnd_audio(&bytes) {
      Ok(VsndAudio::WavPcm16 { wav, .. }) => (wav, "audio/wav"),
      Ok(VsndAudio::Mp3(mp3)) => (mp3, "audio/mpeg"),
      Err(_) => match find_mp3_payload(&bytes) {
        Some(mp3) => (mp3.to_vec(), "audio/mpeg"),
        None => {
          return Err(Error::InvalidInput(format!(
            "sound preview is not available for {entry_path}"
          )));
        }
      },
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(audio);
    Ok(FoundrySoundPreview {
      data_url: format!("data:{mime_type};base64,{b64}"),
      mime_type: mime_type.to_string(),
    })
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("sound decode task failed: {e}")))?
}
