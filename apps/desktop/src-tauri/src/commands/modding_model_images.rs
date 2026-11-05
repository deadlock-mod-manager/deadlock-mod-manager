//! Managed image sources keep their original bytes and GIF disposal-composited frames.
pub(crate) mod animation;
pub(crate) mod projection;

use super::modding_workspace::{contained, resolve};
use crate::{app_runtime::AppHandle, errors::Error};
use image::{AnimationDecoder, ImageDecoder, RgbaImage};
use serde::{Deserialize, Serialize};
use std::{io::Cursor, path::Path};
use ts_rs::TS;

const MAX_BYTES: u64 = 128 * 1024 * 1024;
const MAX_FRAMES: usize = 512;
const PREFIX: &str = "materials/dmm_images/";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingModelImageFrame {
  pub path: String,
  pub duration_ms: u32,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingModelImage {
  pub path: String,
  pub width: u32,
  pub height: u32,
  pub frames: Vec<ModdingModelImageFrame>,
  /// Total play count. Zero means infinite; absent GIF loop extensions play once.
  pub plays: u32,
}
fn invalid(message: impl Into<String>) -> Error {
  Error::InvalidInput(message.into())
}

// Parse GIF blocks instead of searching compressed pixels for the application marker.
fn gif_plays(bytes: &[u8]) -> Result<u32, Error> {
  if bytes.len() < 13 {
    return Err(invalid("Truncated GIF header"));
  }
  let mut offset = 13
    + if bytes[10] & 128 != 0 {
      3 * (1usize << ((bytes[10] & 7) + 1))
    } else {
      0
    };
  let mut plays = 1;
  while offset < bytes.len() {
    let tag = bytes[offset];
    offset += 1;
    match tag {
      0x3b => return Ok(plays),
      0x21 => {
        let label = *bytes
          .get(offset)
          .ok_or_else(|| invalid("Truncated GIF extension"))?;
        offset += 1;
        let mut first = true;
        let mut looping = false;
        loop {
          let size = usize::from(
            *bytes
              .get(offset)
              .ok_or_else(|| invalid("Truncated GIF block"))?,
          );
          offset += 1;
          if size == 0 {
            break;
          }
          let block = bytes
            .get(offset..offset + size)
            .ok_or_else(|| invalid("Truncated GIF block"))?;
          if first {
            looping = label == 255 && (block == b"NETSCAPE2.0" || block == b"ANIMEXTS1.0");
          } else if looping && size == 3 && block[0] == 1 {
            let repeat = u16::from_le_bytes([block[1], block[2]]);
            plays = if repeat == 0 {
              0
            } else {
              u32::from(repeat) + 1
            };
          }
          first = false;
          offset += size;
        }
      }
      0x2c => {
        let header = bytes
          .get(offset..offset + 9)
          .ok_or_else(|| invalid("Truncated GIF frame"))?;
        offset += 9
          + if header[8] & 128 != 0 {
            3 * (1usize << ((header[8] & 7) + 1))
          } else {
            0
          };
        offset += 1;
        loop {
          let size = usize::from(
            *bytes
              .get(offset)
              .ok_or_else(|| invalid("Truncated GIF pixels"))?,
          );
          offset += 1;
          if size == 0 {
            break;
          }
          if bytes.get(offset..offset + size).is_none() {
            return Err(invalid("Truncated GIF pixels"));
          }
          offset += size;
        }
      }
      _ => return Err(invalid("Invalid GIF block")),
    }
  }
  Err(invalid("Missing GIF trailer"))
}
type DecodedImage = (Vec<(RgbaImage, u32)>, u32, &'static str);

fn decode(bytes: &[u8], source: &Path) -> Result<DecodedImage, Error> {
  // TGA has no reliable magic signature. Only an explicit TGA extension enables its decoder.
  let format = image::guess_format(bytes)
    .or_else(|error| {
      if source
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("tga"))
      {
        Ok(image::ImageFormat::Tga)
      } else {
        Err(error)
      }
    })
    .map_err(|error| invalid(error.to_string()))?;
  let mut limits = image::Limits::default();
  limits.max_alloc = Some(MAX_BYTES);
  if format == image::ImageFormat::Gif {
    let plays = gif_plays(bytes)?;
    let mut decoder = image::codecs::gif::GifDecoder::new(Cursor::new(bytes))
      .map_err(|e| invalid(e.to_string()))?;
    decoder
      .set_limits(limits)
      .map_err(|e| invalid(e.to_string()))?;
    let mut frames = Vec::new();
    let mut allocated = 0u64;
    for frame in decoder.into_frames() {
      let frame = frame.map_err(|e| invalid(e.to_string()))?;
      allocated += frame.buffer().as_raw().len() as u64;
      if frames.len() >= MAX_FRAMES || allocated > MAX_BYTES {
        return Err(invalid(
          "Image animation exceeds 512 frames or 128 MB decoded",
        ));
      }
      let (numerator, denominator) = frame.delay().numer_denom_ms();
      // Zero-delay GIF frames need a nonzero timeline interval in both preview and bake.
      let duration = numerator.div_ceil(denominator).max(10);
      frames.push((frame.into_buffer(), duration));
    }
    if frames.is_empty() {
      return Err(invalid("GIF contains no frames"));
    }
    Ok((frames, plays, "gif"))
  } else {
    let extension = match format {
      image::ImageFormat::Png => "png",
      image::ImageFormat::Jpeg => "jpg",
      image::ImageFormat::WebP => "webp",
      image::ImageFormat::Bmp => "bmp",
      image::ImageFormat::Tga => "tga",
      _ => return Err(invalid("Choose a PNG, JPEG, WebP, BMP, TGA or GIF image")),
    };
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits);
    let image = reader
      .decode()
      .map_err(|e| invalid(e.to_string()))?
      .to_rgba8();
    Ok((vec![(image, 0)], 1, extension))
  }
}
pub(super) fn import(root: &Path, source: &Path) -> Result<ModdingModelImage, Error> {
  let file = std::fs::File::open(source)?;
  if file.metadata()?.len() > MAX_BYTES {
    return Err(invalid("Image exceeds 128 MB"));
  }
  use std::io::Read;
  let mut bytes = Vec::new();
  file.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
  if bytes.len() as u64 > MAX_BYTES {
    return Err(invalid("Image exceeds 128 MB"));
  }
  let (frames, plays, extension) = decode(&bytes, source)?;
  let folder = format!("{PREFIX}{}", super::modding_edits::fingerprint(&bytes));
  let directory = contained(root, &folder)?;
  std::fs::create_dir_all(&directory)?;
  let path = format!("{folder}/original.{extension}");
  super::modding_edits::write_atomic(&contained(root, &path)?, &bytes)?;
  let mut output = ModdingModelImage {
    path,
    width: frames[0].0.width(),
    height: frames[0].0.height(),
    frames: Vec::new(),
    plays,
  };
  for (index, (image, duration_ms)) in frames.into_iter().enumerate() {
    let path = format!("{folder}/frame_{index:04}.png");
    let mut encoded = Cursor::new(Vec::new());
    image
      .write_to(&mut encoded, image::ImageFormat::Png)
      .map_err(|e| invalid(e.to_string()))?;
    super::modding_edits::write_atomic(&contained(root, &path)?, &encoded.into_inner())?;
    output
      .frames
      .push(ModdingModelImageFrame { path, duration_ms });
  }
  Ok(output)
}
/// Read only managed source originals. Decode again so stale editor metadata is never trusted.
pub(super) fn load(root: &Path, path: &str) -> Result<ModdingModelImage, Error> {
  if !path.starts_with(PREFIX)
    || !Path::new(path)
      .file_stem()
      .is_some_and(|stem| stem == "original")
  {
    return Err(invalid("Choose a managed image source"));
  }
  if path.ends_with("/original.json") {
    return projection::load(root, path);
  }
  let image = import(root, &contained(root, path)?)?;
  if image.path != path {
    return Err(invalid(
      "Managed image source changed outside DMM; import it again",
    ));
  }
  Ok(image)
}
pub(super) fn frame_pixels(
  root: &Path,
  image: &ModdingModelImage,
  frame: &ModdingModelImageFrame,
) -> Result<RgbaImage, Error> {
  let mut reader =
    image::ImageReader::open(contained(root, &frame.path)?)?.with_guessed_format()?;
  let mut limits = image::Limits::default();
  limits.max_alloc = Some(MAX_BYTES);
  limits.max_image_width = Some(image.width);
  limits.max_image_height = Some(image.height);
  reader.limits(limits);
  let pixels = reader
    .decode()
    .map_err(|e| invalid(e.to_string()))?
    .to_rgba8();
  if pixels.width() != image.width || pixels.height() != image.height {
    return Err(invalid(
      "Managed image frame dimensions changed outside DMM",
    ));
  }
  Ok(pixels)
}
pub(super) fn frame_at(
  image: &ModdingModelImage,
  elapsed_ms: u64,
) -> Option<&ModdingModelImageFrame> {
  let total: u64 = image
    .frames
    .iter()
    .map(|frame| u64::from(frame.duration_ms))
    .sum();
  if total == 0 {
    return image.frames.first();
  }
  if image.plays > 0 && elapsed_ms >= total * u64::from(image.plays) {
    return image.frames.last();
  }
  let mut time = elapsed_ms % total;
  image.frames.iter().find(|frame| {
    if time < u64::from(frame.duration_ms) {
      true
    } else {
      time -= u64::from(frame.duration_ms);
      false
    }
  })
}
#[tauri::command]
pub async fn import_modding_model_image(
  app: AppHandle,
  addon_id: String,
  path: String,
) -> Result<ModdingModelImage, Error> {
  let addon = resolve(&app, &addon_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    import(Path::new(&addon.content_path), Path::new(&path))
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;
  fn gif(repeat: Option<image::codecs::gif::Repeat>) -> Vec<u8> {
    let mut bytes = Vec::new();
    {
      let mut encoder = image::codecs::gif::GifEncoder::new(&mut bytes);
      if let Some(repeat) = repeat {
        encoder.set_repeat(repeat).unwrap();
      }
      for (color, delay) in [([255, 0, 0, 255], 30), ([0, 255, 0, 255], 90)] {
        encoder
          .encode_frame(image::Frame::from_parts(
            RgbaImage::from_pixel(2, 3, image::Rgba(color)),
            0,
            0,
            image::Delay::from_numer_denom_ms(delay, 1),
          ))
          .unwrap();
      }
    }
    bytes
  }
  #[test]
  fn preserves_animation_timing_pixels_and_loop_semantics() {
    for (repeat, plays) in [
      (None, 1),
      (Some(image::codecs::gif::Repeat::Finite(2)), 3),
      (Some(image::codecs::gif::Repeat::Infinite), 0),
    ] {
      let bytes = gif(repeat);
      let (frames, actual_plays, extension) = decode(&bytes, Path::new("fixture.gif")).unwrap();
      assert_eq!(actual_plays, plays);
      assert_eq!(extension, "gif");
      assert_eq!(frames.len(), 2);
      assert_eq!((frames[0].1, frames[1].1), (30, 90));
      assert_eq!(frames[0].0.get_pixel(0, 0).0, [255, 0, 0, 255]);
      assert_eq!(frames[1].0.get_pixel(0, 0).0, [0, 255, 0, 255]);
    }
  }
  #[test]
  fn managed_roundtrip_keeps_original_and_timeline() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("misleading.png");
    let bytes = gif(Some(image::codecs::gif::Repeat::Finite(1)));
    std::fs::write(&source, &bytes).unwrap();
    let image = import(root.path(), &source).unwrap();
    assert!(image.path.ends_with("original.gif"));
    assert_eq!(std::fs::read(root.path().join(&image.path)).unwrap(), bytes);
    assert_eq!(load(root.path(), &image.path).unwrap(), image);
    assert_eq!(frame_at(&image, 29), image.frames.first());
    assert_eq!(frame_at(&image, 30), image.frames.get(1));
    assert_eq!(frame_at(&image, 120), image.frames.first());
    assert_eq!(frame_at(&image, 240), image.frames.last());
    assert!(load(root.path(), "../../outside.png").is_err());
  }
  #[test]
  fn tga_import_and_managed_reload_preserve_pixels_and_reject_malformed_inputs() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("overlay.TGA");
    let pixels = RgbaImage::from_pixel(3, 2, image::Rgba([12, 34, 56, 78]));
    pixels
      .save_with_format(&source, image::ImageFormat::Tga)
      .unwrap();
    let bytes = std::fs::read(&source).unwrap();
    assert!(image::guess_format(&bytes).is_err());
    let imported = import(root.path(), &source).unwrap();
    assert!(imported.path.ends_with("original.tga"));
    assert_eq!(load(root.path(), &imported.path).unwrap(), imported);
    assert_eq!(
      frame_pixels(root.path(), &imported, &imported.frames[0]).unwrap(),
      pixels
    );
    assert!(decode(&bytes, Path::new("unrecognized.bin")).is_err());
    assert!(decode(&bytes[..10], Path::new("malformed.tga")).is_err());
    std::fs::write(&source, b"invalid TGA data").unwrap();
    assert!(import(root.path(), &source).is_err());
  }
  #[test]
  fn static_alpha_roundtrip_and_malformed_gif() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("alpha.png");
    RgbaImage::from_pixel(2, 2, image::Rgba([10, 20, 30, 40]))
      .save(&source)
      .unwrap();
    let image = import(root.path(), &source).unwrap();
    let frame = image::open(root.path().join(&image.frames[0].path))
      .unwrap()
      .to_rgba8();
    assert_eq!(frame.get_pixel(0, 0).0, [10, 20, 30, 40]);
    let mut truncated = gif(None);
    truncated.truncate(truncated.len() - 5);
    assert!(decode(&truncated, Path::new("truncated.gif")).is_err());
  }
}
