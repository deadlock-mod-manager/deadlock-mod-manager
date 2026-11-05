//! Projected sequences retain lossless RGBA PNGs instead of quantizing the projection back to GIF.
use super::*;
use base64::Engine;
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingProjectedImageFrame {
  pub rgba_base64: String,
  pub width: u32,
  pub height: u32,
  pub duration_ms: u32,
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingModelImagePixels {
  pub frames: Vec<ModdingProjectedImageFrame>,
  pub plays: u32,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Frame {
  hash: String,
  duration_ms: u32,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Sequence {
  width: u32,
  height: u32,
  plays: u32,
  frames: Vec<Frame>,
}
fn metadata(path: &str, sequence: &Sequence) -> ModdingModelImage {
  let folder = Path::new(path).parent().unwrap().to_string_lossy();
  ModdingModelImage {
    path: path.into(),
    width: sequence.width,
    height: sequence.height,
    plays: sequence.plays,
    frames: sequence
      .frames
      .iter()
      .enumerate()
      .map(|(index, frame)| ModdingModelImageFrame {
        path: format!("{folder}/frame_{index:04}.png"),
        duration_ms: frame.duration_ms,
      })
      .collect(),
  }
}
pub(super) fn save(
  root: &Path,
  frames: Vec<ModdingProjectedImageFrame>,
  plays: u32,
) -> Result<ModdingModelImage, Error> {
  if frames.is_empty() || frames.len() > 128 {
    return Err(invalid("Projected images require 1 to 128 frames"));
  }
  let (width, height) = (frames[0].width, frames[0].height);
  if width == 0
    || height == 0
    || u64::from(width) * u64::from(height) * frames.len() as u64 * 4 > MAX_BYTES
  {
    return Err(invalid("Projected animation exceeds 128 MB decoded"));
  }
  let mut sequence = Sequence {
    width,
    height,
    plays,
    frames: Vec::new(),
  };
  let staging_root = contained(root, PREFIX.trim_end_matches('/'))?;
  std::fs::create_dir_all(&staging_root)?;
  let staging = tempfile::tempdir_in(staging_root)?;
  for frame in frames {
    if frame.width != width
      || frame.height != height
      || (frame.duration_ms == 0 && !sequence.frames.is_empty())
      || frame.rgba_base64.len() as u64 > MAX_BYTES * 2
    {
      return Err(invalid(
        "Projected frames must share dimensions and positive animation durations",
      ));
    }
    let pixels = base64::engine::general_purpose::STANDARD
      .decode(frame.rgba_base64)
      .map_err(|e| invalid(e.to_string()))?;
    let image = RgbaImage::from_raw(width, height, pixels)
      .ok_or_else(|| invalid("Projected frame dimensions do not match RGBA bytes"))?;
    let png = super::encode_png(&image)?;
    sequence.frames.push(Frame {
      hash: super::super::modding_edits::fingerprint(&png),
      duration_ms: frame.duration_ms,
    });
    std::fs::write(
      staging
        .path()
        .join(format!("frame_{:04}.png", sequence.frames.len() - 1)),
      png,
    )?;
  }
  if sequence.frames.len() > 1 && sequence.frames.iter().any(|frame| frame.duration_ms == 0) {
    return Err(invalid("Animation frame durations must be positive"));
  }
  let original = serde_json::to_vec(&sequence).map_err(|e| invalid(e.to_string()))?;
  let folder = format!(
    "{PREFIX}{}",
    super::super::modding_edits::fingerprint(&original)
  );
  let directory = contained(root, &folder)?;
  let path = format!("{folder}/original.json");
  std::fs::write(staging.path().join("original.json"), &original)?;
  match std::fs::rename(staging.path(), &directory) {
    Ok(()) => {}
    Err(_) if directory.is_dir() => {
      if load(root, &path).is_ok() {
        return Ok(metadata(&path, &sequence));
      }
      for index in 0..sequence.frames.len() {
        let name = format!("frame_{index:04}.png");
        let png = std::fs::read(staging.path().join(&name))?;
        super::super::modding_edits::write_atomic(
          &contained(root, &format!("{folder}/{name}"))?,
          &png,
        )?;
      }
      super::super::modding_edits::write_atomic(&contained(root, &path)?, &original)?;
    }
    Err(error) => return Err(error.into()),
  }
  Ok(metadata(&path, &sequence))
}
pub(super) fn load(root: &Path, path: &str) -> Result<ModdingModelImage, Error> {
  let file = contained(root, path)?;
  if std::fs::metadata(&file)?.len() > 128 * 1024 {
    return Err(invalid("Managed image descriptor exceeds 128 KB"));
  }
  let bytes = std::fs::read(file)?;
  if bytes.len() > 128 * 1024
    || Path::new(path)
      .parent()
      .and_then(Path::file_name)
      .and_then(|name| name.to_str())
      != Some(&super::super::modding_edits::fingerprint(&bytes))
  {
    return Err(invalid("Managed image sequence changed outside DMM"));
  }
  let sequence: Sequence = serde_json::from_slice(&bytes).map_err(|e| invalid(e.to_string()))?;
  if sequence.frames.is_empty()
    || sequence.frames.len() > 128
    || sequence.width == 0
    || sequence.height == 0
    || u64::from(sequence.width) * u64::from(sequence.height) * sequence.frames.len() as u64 * 4
      > MAX_BYTES
    || (sequence.frames.len() > 1 && sequence.frames.iter().any(|frame| frame.duration_ms == 0))
  {
    return Err(invalid("Invalid managed image sequence"));
  }
  let result = metadata(path, &sequence);
  for (frame, record) in result.frames.iter().zip(&sequence.frames) {
    let target = contained(root, &frame.path)?;
    if std::fs::metadata(&target)?.len() > MAX_BYTES {
      return Err(invalid("Managed image frame exceeds 128 MB"));
    }
    if super::super::modding_edits::fingerprint(&std::fs::read(target)?) != record.hash {
      return Err(invalid("Managed image frame changed outside DMM"));
    }
  }
  Ok(result)
}
#[tauri::command]
pub async fn save_modding_projected_image(
  app: AppHandle,
  addon_id: String,
  frames: Vec<ModdingProjectedImageFrame>,
  plays: u32,
) -> Result<ModdingModelImage, Error> {
  let addon = resolve(&app, &addon_id)?;
  tauri::async_runtime::spawn_blocking(move || save(Path::new(&addon.content_path), frames, plays))
    .await
    .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}
fn preview_dimensions(width: u32, height: u32, frames: usize, max_side: Option<u32>) -> (u32, u32) {
  let scale = max_side
    .map(|side| {
      let memory_side = (8. * 1024. * 1024. / (frames.max(1) as f64 * 4.)).sqrt();
      (f64::from(side.clamp(1, 512)).min(memory_side) / f64::from(width.max(height).max(1))).min(1.)
    })
    .unwrap_or(1.);
  (
    (f64::from(width) * scale).floor().max(1.) as u32,
    (f64::from(height) * scale).floor().max(1.) as u32,
  )
}

#[tauri::command]
pub async fn read_modding_model_image(
  app: AppHandle,
  addon_id: String,
  path: String,
  max_side: Option<u32>,
) -> Result<ModdingModelImagePixels, Error> {
  let addon = resolve(&app, &addon_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    let root = Path::new(&addon.content_path);
    let image = super::load(root, &path)?;
    let (width, height) =
      preview_dimensions(image.width, image.height, image.frames.len(), max_side);
    let mut frames = Vec::new();
    for frame in &image.frames {
      let pixels = super::frame_pixels(root, &image, frame)?;
      let pixels = if pixels.width() == width && pixels.height() == height {
        pixels
      } else {
        image::imageops::resize(
          &pixels,
          width,
          height,
          image::imageops::FilterType::Triangle,
        )
      };
      frames.push(ModdingProjectedImageFrame {
        width: pixels.width(),
        height: pixels.height(),
        duration_ms: frame.duration_ms,
        rgba_base64: base64::engine::general_purpose::STANDARD.encode(pixels.as_raw()),
      });
    }
    Ok(ModdingModelImagePixels {
      frames,
      plays: image.plays,
    })
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn sticker_previews_bound_decoded_memory_without_upscaling_or_affecting_exports() {
    for frames in [1, 8, 128] {
      let (width, height) = preview_dimensions(4096, 2048, frames, Some(512));
      assert!(width <= 512 && height <= 512);
      assert!(u64::from(width) * u64::from(height) * frames as u64 * 4 <= 8 * 1024 * 1024);
      assert_eq!(width, height * 2);
    }
    assert_eq!(preview_dimensions(32, 16, 8, Some(512)), (32, 16));
    assert_eq!(preview_dimensions(4096, 2048, 128, None), (4096, 2048));
  }
  #[test]
  fn lossless_sequence_roundtrip_and_tamper_detection() {
    let root = tempfile::tempdir().unwrap();
    let frames: Vec<ModdingProjectedImageFrame> =
      [([255, 11, 24, 123], 30), ([19, 255, 83, 48], 90)]
        .into_iter()
        .map(|(pixel, duration_ms)| ModdingProjectedImageFrame {
          width: 2,
          height: 2,
          rgba_base64: base64::engine::general_purpose::STANDARD.encode(pixel.repeat(4)),
          duration_ms,
        })
        .collect();
    let image = save(root.path(), frames.clone(), 3).unwrap();
    assert_eq!(load(root.path(), &image.path).unwrap(), image);
    let frame = image::open(root.path().join(&image.frames[0].path))
      .unwrap()
      .to_rgba8();
    assert_eq!(frame.get_pixel(0, 0).0, [255, 11, 24, 123]);
    std::fs::write(root.path().join(&image.frames[0].path), b"tampered").unwrap();
    assert!(load(root.path(), &image.path).is_err());
    assert_eq!(save(root.path(), frames, 3).unwrap(), image);
    assert_eq!(load(root.path(), &image.path).unwrap(), image);
  }

  #[test]
  fn invalid_projected_sequences_do_not_publish_partial_frames() {
    let root = tempfile::tempdir().unwrap();
    let frames = [30, 0]
      .into_iter()
      .map(|duration_ms| ModdingProjectedImageFrame {
        rgba_base64: base64::engine::general_purpose::STANDARD.encode([255, 0, 0, 128]),
        width: 1,
        height: 1,
        duration_ms,
      })
      .collect();
    assert!(save(root.path(), frames, 0).is_err());
    assert_eq!(
      std::fs::read_dir(root.path().join(PREFIX)).unwrap().count(),
      0
    );
  }
}
