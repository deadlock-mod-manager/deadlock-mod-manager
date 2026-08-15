//! The Tauri command surface of the Mod Foundry.
//!
//! Every command that touches the filesystem or decodes an asset runs on the
//! blocking pool: parsing a multi-gigabyte pak or re-encoding a texture would
//! otherwise stall the UI thread.

use std::io::Cursor;
use std::path::PathBuf;

use base64::Engine;
use image::codecs::png::PngEncoder;
use image::{ExtendedColorType, ImageEncoder};

use crate::errors::Error;

use super::analyze::{analyze_default_hero, analyze_vpk_path, decode_foundry_cards};
use super::archive_cache::{clear_archive_cache, open_archive};
use super::export::{ExportDestination, FoundryExportResult, export_workspace};
use super::paint::{describe_paint_targets, paint_target};
use super::sounds::find_mp3_payload;
use super::staging::staged_base_game_vpk;
use super::types::{
  ExportDestinationKind, FoundryBuildResult, FoundryCardPreview, FoundryManifest, FoundryModel,
  FoundryPaintResult, FoundryPaintTargetInfo, FoundryReplacementResult, FoundrySoundPreview,
  FoundryTexture, FoundryWorkspace, PaintTarget,
};
use super::workspace::{
  build_workspace_vpk, entry_bytes_from_sources, hue_of, parse_hex_color, prepare_workspace,
  replace_workspace_file, revert_workspace_file,
};

/// Parse a skin VPK, detect its hero, and return the entries grouped by editing
/// category. Read-only: this never writes to the user's copy of the VPK.
#[tauri::command]
pub async fn foundry_analyze_vpk(file_path: String) -> Result<FoundryManifest, Error> {
  tauri::async_runtime::spawn_blocking(move || analyze_vpk_path(&PathBuf::from(file_path)))
    .await
    .map_err(|e| Error::InvalidInput(format!("VPK analysis task failed: {e}")))?
}

/// Open the base game's default hero assets as a Foundry source, filtered to
/// that one hero instead of the entire game archive.
#[tauri::command]
pub async fn foundry_analyze_default_hero(hero_display: String) -> Result<FoundryManifest, Error> {
  tauri::async_runtime::spawn_blocking(move || analyze_default_hero(hero_display))
    .await
    .map_err(|e| Error::InvalidInput(format!("default hero analysis task failed: {e}")))?
}

/// Prepare the editable workspace for the loaded skin: unpack it to
/// `<app_local_data>/foundry/<id>/files` (copying, never moving, the source).
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

/// Bundle the active workspace into a standalone VPK. Export passes an explicit
/// output path; without one the VPK lands under `<workspace>/exports/`.
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

/// Pack the workspace and deliver it: to a file the user picked, to a new local
/// mod in the library, or over the VPK the Foundry loaded.
///
/// Replacing keeps a `.bak` of the original beside it.
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

/// Drop the cached VPK indexes. Called when the Foundry unloads a skin, so a
/// parsed pak01 does not sit in memory for the rest of the session.
#[tauri::command]
pub fn foundry_release_archives() {
  clear_archive_cache();
}

/// Replace one file inside the workspace. A PNG/JPG dropped on a `.vtex_c` entry
/// is re-encoded into that texture's container; other formats must match.
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

/// How much of the hero each paint target covers in the loaded skin.
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

/// Recolor one part of the hero — body, gun body, gun, or ability effects.
///
/// Each pass reads the packed originals rather than the previous pass's output,
/// so re-applying with a different color replaces the paint instead of stacking
/// hue shift on hue shift.
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
  let color = parse_hex_color(&color_hex)?;
  let recolor = vpkmanager::Recolor::new(
    f64::from(hue_of(color)),
    f64::from(saturation.unwrap_or(1.0).clamp(0.0, 3.0)),
    f64::from(brightness.unwrap_or(1.0).clamp(0.2, 2.0)),
  );
  let pattern = parse_pattern(pattern.as_deref(), pattern_intensity, pattern_phase)?;
  tauri::async_runtime::spawn_blocking(move || {
    paint_target(
      PathBuf::from(workspace_root),
      PathBuf::from(file_path),
      target,
      hero_display,
      recolor,
      pattern,
    )
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("paint task failed: {e}")))?
}

/// Resolve an optional pattern name into a [`vpkmanager::Pattern`]. `None` and
/// `"none"` both mean a plain recolor; an unknown name is rejected rather than
/// silently ignored, so a typo surfaces instead of quietly doing nothing.
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

/// A PNG swatch of one pattern style, for the picker tiles. Pure generation:
/// no VPK is read, so this is cheap enough to call for every style at once.
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

/// Undo every edit to one workspace entry, restoring the packed original.
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

/// Decode a `.vtex_c` entry (card or texture) to a PNG data URL, preferring the
/// workspace's edited copy when one exists.
#[tauri::command]
pub async fn foundry_decode_texture(
  file_path: String,
  entry_path: String,
  workspace_root: Option<String>,
) -> Result<FoundryTexture, Error> {
  let vpk_path = PathBuf::from(&file_path);
  tauri::async_runtime::spawn_blocking(move || {
    let bytes = entry_bytes_from_sources(
      workspace_root.as_ref().map(PathBuf::from).as_deref(),
      &vpk_path,
      &entry_path,
    )?;
    let decoded = source2_model::decode_texture_png_bytes(bytes)
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

/// Decode every hero-card texture for the active skin in one background pass.
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

/// Decode a `.vmesh_c`, or assemble every mesh a `.vmdl_c` references, into one
/// GLB for the 3D preview.
///
/// Two things make the preview match the game rather than the raw file: the
/// workspace shadows the archive, so a repaint shows immediately, and the model
/// is stood in the base game's idle rest pose, so the hero holds its weapon
/// instead of floating in bind pose. Still geometry only — nothing animates.
#[tauri::command]
pub async fn foundry_decode_model(
  file_path: String,
  entry_path: String,
  workspace_root: Option<String>,
) -> Result<FoundryModel, Error> {
  let vpk_path = PathBuf::from(&file_path);
  tauri::async_runtime::spawn_blocking(move || {
    let overlay = workspace_root.map(|root| PathBuf::from(root).join("files"));
    // Both archives come from the cache: opening pak01 costs ~550 ms, and the
    // rest pose alone would otherwise reopen it for the skeleton, the clip
    // lookup and the clip itself.
    let archive = open_archive(&vpk_path, overlay.as_deref())?;
    let decoded = source2_model::decode_model_glb_from_archive(&archive, &entry_path)
      .map_err(|e| Error::InvalidInput(format!("failed to decode model: {e}")))?;
    let decoded = match staged_base_game_vpk()? {
      Some(base_vpk) => {
        let base = open_archive(&base_vpk, None)?;
        source2_model::pose_model_at_rest(decoded, &base, &archive, &entry_path)
      }
      None => decoded,
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&decoded.glb);
    Ok(FoundryModel {
      vertex_count: decoded.vertex_count,
      index_count: decoded.index_count,
      data_url: format!("data:model/gltf-binary;base64,{b64}"),
    })
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("model decode task failed: {e}")))?
}

/// Extract a browser-playable preview from a compiled Source 2 sound. Clips that
/// aren't MP3-encoded have no preview; the caller treats that as "not playable"
/// rather than an error worth surfacing.
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
    let Some(mp3) = find_mp3_payload(&bytes) else {
      return Err(Error::InvalidInput(format!(
        "sound preview is not available for {entry_path}"
      )));
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(mp3);
    Ok(FoundrySoundPreview {
      data_url: format!("data:audio/mpeg;base64,{b64}"),
      mime_type: "audio/mpeg".to_string(),
    })
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("sound decode task failed: {e}")))?
}
