//! The editable working copy of a skin, and the VPK it is packed back into.
//!
//! Editing a compiled VPK in place is not practical: entries are length-prefixed
//! into one contiguous data section, so replacing a single file rewrites the
//! whole archive anyway. Instead the Foundry unpacks the skin into a plain file
//! tree under `<app_local_data>/foundry/<id>/files`, every edit is a normal file
//! write into that tree, and Export packs the tree into a fresh VPK. The source
//! VPK is only ever read.

use std::path::{Component, Path, PathBuf};

use base64::Engine;
use vpk_parser::{VpkParseOptions, VpkParser};

use crate::errors::Error;

use super::analyze::classify;
use super::game::foundry_workspace_root;
use super::staging::staged_base_game_vpk;
use super::types::{
  CATEGORY_CARD, ENTRY_SOURCE_WORKSPACE, FoundryBuildResult, FoundryEntry,
  FoundryReplacementResult, FoundryTexture, FoundryWorkspace,
};

/// Sanitize a human name (hero / mod name) into a folder-safe workspace id
/// component. Non-alphanumerics collapse to `_`; empty input becomes `skin`.
pub(crate) fn sanitize_workspace_name(name: &str) -> String {
  let cleaned: String = name
    .trim()
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
        c
      } else {
        '_'
      }
    })
    .collect();
  let trimmed = cleaned.trim_matches('_');
  if trimmed.is_empty() {
    "skin".to_string()
  } else {
    trimmed.to_string()
  }
}

/// Stable 8-hex FNV-1a hash of the source path, appended to the workspace id so
/// two skins that share a name don't collide on the same folder.
pub(crate) fn short_path_hash(path: &str) -> String {
  let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
  for byte in path.as_bytes() {
    hash ^= u64::from(*byte);
    hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
  }
  format!("{:08x}", (hash & 0xffff_ffff) as u32)
}

/// Copy a `_dir.vpk`'s companion `_NNN.vpk` archives next to a copied dir file
/// so the copied VPK set stays self-contained (read-only on the source).
pub(crate) fn copy_companion_archives(source_vpk: &Path, dest_dir: &Path) -> Result<(), Error> {
  let stem = source_vpk
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or_default();
  let Some(base) = stem.strip_suffix("_dir") else {
    return Ok(());
  };
  let parent = source_vpk.parent().unwrap_or_else(|| Path::new("."));
  let prefix = format!("{base}_");
  for entry in std::fs::read_dir(parent)? {
    let path = entry?.path();
    if !path.is_file() {
      continue;
    }
    let filename = path
      .file_name()
      .and_then(|s| s.to_str())
      .unwrap_or_default();
    if let Some(rest) = filename.strip_prefix(&prefix)
      && let Some(num) = rest.strip_suffix(".vpk")
      && num.len() == 3
      && num.chars().all(|c| c.is_ascii_digit())
    {
      std::fs::copy(&path, dest_dir.join(filename))?;
    }
  }
  Ok(())
}

fn count_files(dir: &Path) -> usize {
  let mut total = 0usize;
  let Ok(read_dir) = std::fs::read_dir(dir) else {
    return 0;
  };
  for entry in read_dir.flatten() {
    let path = entry.path();
    if path.is_dir() {
      total += count_files(&path);
    } else {
      total += 1;
    }
  }
  total
}

/// Map a VPK entry path onto a relative filesystem path, rejecting anything that
/// could escape the workspace (`..`, absolute paths, drive prefixes).
pub(crate) fn safe_entry_relative(entry_path: &str) -> Result<PathBuf, Error> {
  let normalized = entry_path.replace('\\', "/");
  let mut out = PathBuf::new();
  for component in Path::new(&normalized).components() {
    match component {
      Component::Normal(part) => out.push(part),
      Component::CurDir => {}
      Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
        return Err(Error::InvalidInput(format!(
          "invalid Foundry entry path: {entry_path}"
        )));
      }
    }
  }
  if out.as_os_str().is_empty() {
    return Err(Error::InvalidInput(
      "Foundry entry path cannot be empty".to_string(),
    ));
  }
  Ok(out)
}

pub(crate) fn entry_extension(path: &str) -> String {
  Path::new(path)
    .extension()
    .and_then(|ext| ext.to_str())
    .unwrap_or_default()
    .to_ascii_lowercase()
}

/// Image formats the texture replacer accepts as a card / texture source. These
/// are exactly the decoders the `image` crate is compiled with.
pub(crate) fn is_supported_image(ext: &str) -> bool {
  matches!(
    ext,
    "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tga" | "tif" | "tiff" | "ico" | "qoi"
  )
}

fn workspace_category(entry_path: &str, ext: &str) -> &'static str {
  let lower = entry_path.to_ascii_lowercase();
  if ext == "vtex_c" && lower.starts_with("panorama/images/heroes/") {
    return CATEGORY_CARD;
  }
  classify(ext, entry_path, &[])
}

fn texture_preview_from_file(path: &Path) -> Result<FoundryTexture, Error> {
  let decoded = source2_model::decode_texture_file(path)
    .map_err(|e| Error::InvalidInput(format!("failed to decode replacement texture: {e}")))?;
  let b64 = base64::engine::general_purpose::STANDARD.encode(&decoded.png);
  Ok(FoundryTexture {
    width: decoded.width,
    height: decoded.height,
    data_url: format!("data:image/png;base64,{b64}"),
  })
}

pub(crate) fn parse_hex_color(value: &str) -> Result<[u8; 3], Error> {
  let hex = value.trim().trim_start_matches('#');
  if hex.len() != 6 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
    return Err(Error::InvalidInput(format!("invalid color: {value}")));
  }
  let red = u8::from_str_radix(&hex[0..2], 16)
    .map_err(|e| Error::InvalidInput(format!("invalid red channel: {e}")))?;
  let green = u8::from_str_radix(&hex[2..4], 16)
    .map_err(|e| Error::InvalidInput(format!("invalid green channel: {e}")))?;
  let blue = u8::from_str_radix(&hex[4..6], 16)
    .map_err(|e| Error::InvalidInput(format!("invalid blue channel: {e}")))?;
  Ok([red, green, blue])
}

/// The hue of a picked color, in degrees. The UI picks a target color; the hue
/// recolor only needs the hue out of it, since saturation and brightness come
/// from their own sliders.
pub(crate) fn hue_of([red, green, blue]: [u8; 3]) -> f32 {
  let red = f32::from(red) / 255.0;
  let green = f32::from(green) / 255.0;
  let blue = f32::from(blue) / 255.0;
  let max = red.max(green).max(blue);
  let min = red.min(green).min(blue);
  let delta = max - min;
  if delta <= f32::EPSILON {
    return 0.0;
  }
  let hue = if max == red {
    60.0 * (((green - blue) / delta) % 6.0)
  } else if max == green {
    60.0 * (((blue - red) / delta) + 2.0)
  } else {
    60.0 * (((red - green) / delta) + 4.0)
  };
  hue.rem_euclid(360.0)
}

/// The `.vtex_c` container an edit is written into. A texture the workspace has
/// already edited is reused so repeated edits stack on the same container;
/// otherwise the original comes from the skin VPK, or from the base game when
/// the skin doesn't ship that texture (a mod may only override some of a hero's
/// cards, but the user can still replace the rest).
fn texture_template_bytes(
  target_path: &Path,
  template_vpk_path: Option<&Path>,
  entry_path: &str,
) -> Result<Vec<u8>, Error> {
  if target_path.exists() {
    return Ok(std::fs::read(target_path)?);
  }

  if let Some(vpk_path) = template_vpk_path.filter(|path| path.exists())
    && let Ok(bytes) = source2_model::vpk_extract::extract_entry(vpk_path, entry_path)
  {
    return Ok(bytes);
  }

  if let Some(base_vpk) = staged_base_game_vpk()?
    && let Ok(bytes) = source2_model::vpk_extract::extract_entry(&base_vpk, entry_path)
  {
    return Ok(bytes);
  }

  Err(Error::InvalidInput(format!(
    "template texture not found for {entry_path}"
  )))
}

/// An entry's bytes as originally packed: from the skin VPK, or from the base
/// game when the skin doesn't ship it. Ignores any workspace edit.
fn packed_entry_bytes(vpk_path: Option<&Path>, entry_path: &str) -> Result<Vec<u8>, Error> {
  if let Some(vpk_path) = vpk_path.filter(|path| path.exists())
    && let Ok(bytes) = source2_model::vpk_extract::extract_entry(vpk_path, entry_path)
  {
    return Ok(bytes);
  }
  if let Some(base_vpk) = staged_base_game_vpk()?
    && let Ok(bytes) = source2_model::vpk_extract::extract_entry(&base_vpk, entry_path)
  {
    return Ok(bytes);
  }
  Err(Error::InvalidInput(format!(
    "original not found for {entry_path}"
  )))
}

fn workspace_entry_bytes(
  workspace_root: Option<&Path>,
  entry_path: &str,
) -> Result<Option<Vec<u8>>, Error> {
  let Some(workspace_root) = workspace_root else {
    return Ok(None);
  };
  let relative = safe_entry_relative(entry_path)?;
  let path = workspace_root.join("files").join(relative);
  if path.is_file() {
    return Ok(Some(std::fs::read(path)?));
  }
  Ok(None)
}

/// Read an entry's current bytes, preferring the user's edited copy, then the
/// skin VPK, then the base game.
pub(crate) fn entry_bytes_from_sources(
  workspace_root: Option<&Path>,
  vpk_path: &Path,
  entry_path: &str,
) -> Result<Vec<u8>, Error> {
  if let Some(bytes) = workspace_entry_bytes(workspace_root, entry_path)? {
    return Ok(bytes);
  }
  if vpk_path.exists()
    && let Ok(bytes) = source2_model::vpk_extract::extract_entry(vpk_path, entry_path)
  {
    return Ok(bytes);
  }
  if let Some(base_vpk) = staged_base_game_vpk()?
    && let Ok(bytes) = source2_model::vpk_extract::extract_entry(&base_vpk, entry_path)
  {
    return Ok(bytes);
  }
  Err(Error::InvalidInput(format!(
    "entry not found: {entry_path}"
  )))
}

pub(crate) fn workspace_files_dir(workspace_root: &Path) -> Result<PathBuf, Error> {
  let files_dir = workspace_root.join("files");
  if !files_dir.is_dir() {
    return Err(Error::InvalidInput(format!(
      "Foundry workspace files directory not found: {}",
      files_dir.display()
    )));
  }
  Ok(files_dir)
}

fn replacement_result(
  entry_path: String,
  target_path: &Path,
  target_ext: String,
  texture: Option<FoundryTexture>,
) -> Result<FoundryReplacementResult, Error> {
  let metadata = std::fs::metadata(target_path)?;
  let filename = Path::new(&entry_path)
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or(&entry_path)
    .to_string();
  let category = workspace_category(&entry_path, &target_ext);
  Ok(FoundryReplacementResult {
    entry: FoundryEntry {
      path: entry_path,
      filename,
      ext: target_ext,
      size: metadata.len().min(u64::from(u32::MAX)) as u32,
      category: category.to_string(),
      source: ENTRY_SOURCE_WORKSPACE.to_string(),
    },
    texture,
  })
}

/// Replace one file inside the editable workspace.
///
/// The compiled formats are not written through verbatim; each is rebuilt around
/// the entry it replaces, so the game still gets a valid resource:
/// - an image on a `.vtex_c` is re-encoded into that texture's container,
///   keeping its dimensions, format and mip chain,
/// - an MP3 or WAV on a `.vsnd_c` is minted into a new sound container that
///   inherits the original's loop flag and dependency info,
/// - anything already in the entry's compiled format is copied as-is.
pub(crate) fn replace_workspace_file(
  workspace_root: PathBuf,
  entry_path: String,
  source_file_path: PathBuf,
  template_vpk_path: Option<PathBuf>,
) -> Result<FoundryReplacementResult, Error> {
  if !source_file_path.is_file() {
    return Err(Error::InvalidInput(format!(
      "replacement file not found: {}",
      source_file_path.display()
    )));
  }

  let files_dir = workspace_files_dir(&workspace_root)?;
  let relative = safe_entry_relative(&entry_path)?;
  let target_path = files_dir.join(relative);
  let target_ext = entry_extension(&entry_path);
  let source_ext = source_file_path
    .extension()
    .and_then(|ext| ext.to_str())
    .unwrap_or_default()
    .to_ascii_lowercase();

  if let Some(parent) = target_path.parent() {
    std::fs::create_dir_all(parent)?;
  }

  let texture = if target_ext == "vtex_c" && is_supported_image(&source_ext) {
    let image_bytes = std::fs::read(&source_file_path)?;
    let template = texture_template_bytes(&target_path, template_vpk_path.as_deref(), &entry_path)?;
    let replaced = vpkmanager::replace_texture_image(&template, &image_bytes)
      .map_err(|e| Error::InvalidInput(format!("failed to write replacement texture: {e}")))?;
    std::fs::write(&target_path, replaced.bytes)?;
    Some(texture_preview_from_file(&target_path)?)
  } else if target_ext == "vsnd_c" {
    let Some(input) = vpkmanager::classify_sound_input(&source_ext) else {
      return Err(Error::InvalidInput(format!(
        "a sound replacement must be .mp3, .wav or .vsnd_c, not .{source_ext}"
      )));
    };
    let replacement = std::fs::read(&source_file_path)?;
    // The donor is always the packed original, never the workspace copy: a
    // second swap should rebuild from the game's container rather than from the
    // one the first swap already rewrote.
    let donor = packed_entry_bytes(template_vpk_path.as_deref(), &entry_path)?;
    let swapped = vpkmanager::swap_sound(&donor, &replacement, input)
      .map_err(|e| Error::InvalidInput(format!("failed to write replacement sound: {e}")))?;
    std::fs::write(&target_path, swapped)?;
    None
  } else {
    if source_ext != target_ext {
      return Err(Error::InvalidInput(format!(
        "replacement file must be .{target_ext} for {entry_path}"
      )));
    }
    std::fs::copy(&source_file_path, &target_path)?;
    if target_ext == "vtex_c" {
      Some(texture_preview_from_file(&target_path)?)
    } else {
      None
    }
  };

  log::info!(
    "[Foundry] Replaced workspace entry {} with {}",
    entry_path,
    source_file_path.display(),
  );

  replacement_result(entry_path, &target_path, target_ext, texture)
}

/// Restore one entry to the state it had when the workspace was unpacked, by
/// deleting the edited file and re-extracting it from the source VPK.
pub(crate) fn revert_workspace_file(
  workspace_root: PathBuf,
  entry_path: String,
  template_vpk_path: Option<PathBuf>,
) -> Result<(), Error> {
  let files_dir = workspace_files_dir(&workspace_root)?;
  let relative = safe_entry_relative(&entry_path)?;
  let target_path = files_dir.join(&relative);
  if target_path.exists() {
    std::fs::remove_file(&target_path)?;
  }

  let Some(vpk_path) = template_vpk_path.filter(|path| path.exists()) else {
    return Ok(());
  };
  if let Ok(bytes) = source2_model::vpk_extract::extract_entry(&vpk_path, &entry_path) {
    if let Some(parent) = target_path.parent() {
      std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&target_path, bytes)?;
  }
  Ok(())
}

/// Pack the editable `files/` tree into a standalone VPK.
///
/// The result is parsed back once before it is reported as usable, so a writer
/// bug surfaces here instead of as a silently broken addon in the game.
pub(crate) fn build_workspace_vpk(
  workspace_root: PathBuf,
  output_path: Option<PathBuf>,
  name: Option<String>,
) -> Result<FoundryBuildResult, Error> {
  let files_dir = workspace_files_dir(&workspace_root)?;

  let output_path = output_path.unwrap_or_else(|| {
    let safe_name = sanitize_workspace_name(name.as_deref().unwrap_or("foundry-skin"));
    workspace_root
      .join("exports")
      .join(format!("{safe_name}_dir.vpk"))
  });

  let file_count = vpkmanager::pack_directory(&files_dir, &output_path)
    .map_err(|e| Error::InvalidInput(format!("failed to build Foundry VPK: {e}")))?;
  let size = std::fs::metadata(&output_path)?.len();

  let vpk_data = std::fs::read(&output_path)?;
  let options = VpkParseOptions {
    include_entries: false,
    file_path: output_path.to_string_lossy().to_string(),
    ..Default::default()
  };
  VpkParser::parse(vpk_data, options)
    .map_err(|e| Error::InvalidInput(format!("built Foundry VPK is invalid: {e}")))?;

  log::info!(
    "[Foundry] Built VPK {} ({} files, {} bytes)",
    output_path.display(),
    file_count,
    size,
  );

  Ok(FoundryBuildResult {
    output_path: output_path.to_string_lossy().to_string(),
    file_count,
    size,
  })
}

/// Materialize an editable, unpacked working copy of the loaded skin under
/// `<app_local_data>/foundry/<id>/`.
///
/// Two modes, both COPY-only (the source is never moved):
/// - Full mod VPK (`entries = None`): unpack everything and keep a copy of the
///   VPK (+ companions) alongside.
/// - Default hero (`entries = Some(paths)`): the source is the shared multi-GB
///   base-game pak, so unpack only that hero's listed assets and skip the copy.
///
/// Existing unpacked files are reused unless `force` is set, so edits survive a
/// reload of the same skin.
pub(crate) fn prepare_workspace(
  file_path: PathBuf,
  name: String,
  entries: Option<Vec<String>>,
  force: bool,
) -> Result<FoundryWorkspace, Error> {
  if !file_path.exists() {
    return Err(Error::InvalidInput(format!(
      "VPK not found: {}",
      file_path.display()
    )));
  }

  let root_dir = foundry_workspace_root()?;
  std::fs::create_dir_all(&root_dir)?;

  let id = format!(
    "{}-{}",
    sanitize_workspace_name(&name),
    short_path_hash(&file_path.to_string_lossy())
  );
  let root = root_dir.join(&id);
  let files_dir = root.join("files");
  std::fs::create_dir_all(&root)?;

  let vpk_copy = if entries.is_none() {
    let original_name = file_path
      .file_name()
      .and_then(|s| s.to_str())
      .unwrap_or("source.vpk");
    let vpk_copy = root.join(original_name);
    std::fs::copy(&file_path, &vpk_copy)?;
    copy_companion_archives(&file_path, &root)?;
    vpk_copy.to_string_lossy().to_string()
  } else {
    String::new()
  };

  let has_unpacked = std::fs::read_dir(&files_dir)
    .map(|mut dir| dir.next().is_some())
    .unwrap_or(false);

  let (file_count, created) = if has_unpacked && !force {
    (count_files(&files_dir), false)
  } else {
    if files_dir.exists() {
      std::fs::remove_dir_all(&files_dir)?;
    }
    std::fs::create_dir_all(&files_dir)?;
    let count = match &entries {
      Some(paths) => source2_model::vpk_extract::extract_entries(&file_path, &files_dir, paths),
      None => source2_model::vpk_extract::extract_all(&file_path, &files_dir),
    }
    .map_err(|e| Error::InvalidInput(format!("failed to unpack VPK: {e}")))?;
    (count, true)
  };

  log::info!(
    "[Foundry] Workspace ready at {} ({} files, created={})",
    root.display(),
    file_count,
    created,
  );

  Ok(FoundryWorkspace {
    root: root.to_string_lossy().to_string(),
    files_dir: files_dir.to_string_lossy().to_string(),
    vpk_copy,
    file_count,
    created,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn entry_paths_cannot_escape_the_workspace() {
    assert!(safe_entry_relative("../outside.vtex_c").is_err());
    assert!(safe_entry_relative("/etc/passwd").is_err());
    assert!(safe_entry_relative("").is_err());
    assert_eq!(
      safe_entry_relative("panorama/images/heroes/haze_card.vtex_c").unwrap(),
      PathBuf::from("panorama")
        .join("images")
        .join("heroes")
        .join("haze_card.vtex_c")
    );
  }

  #[test]
  fn hex_colors_round_trip() {
    assert_eq!(parse_hex_color("#ff8800").unwrap(), [0xff, 0x88, 0x00]);
    assert_eq!(parse_hex_color("00FF7F").unwrap(), [0x00, 0xff, 0x7f]);
    assert!(parse_hex_color("#fff").is_err());
    assert!(parse_hex_color("nothex").is_err());
  }

  #[test]
  fn workspace_ids_are_stable_and_collision_resistant() {
    assert_eq!(
      sanitize_workspace_name("Grey Talon / Skin!"),
      "Grey_Talon___Skin"
    );
    assert_eq!(sanitize_workspace_name("   "), "skin");
    assert_ne!(short_path_hash("a/haze.vpk"), short_path_hash("b/haze.vpk"));
  }
}
