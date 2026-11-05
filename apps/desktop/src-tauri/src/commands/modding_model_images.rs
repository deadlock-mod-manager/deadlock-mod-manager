//! Managed image sources keep their original bytes and GIF disposal-composited frames.
pub(crate) mod animation;
mod cache;
pub(crate) mod projection;

use super::modding_workspace::{contained, resolve};
use crate::{app_runtime::AppHandle, errors::Error};
use image::{AnimationDecoder, ImageDecoder, ImageEncoder, RgbaImage};
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
fn decode_each(
  bytes: &[u8],
  source: &Path,
  mut emit: impl FnMut(RgbaImage, u32) -> Result<(), Error>,
) -> Result<(u32, &'static str), Error> {
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
    let mut count = 0;
    let mut allocated = 0u64;
    for frame in decoder.into_frames() {
      let frame = frame.map_err(|e| invalid(e.to_string()))?;
      allocated += frame.buffer().as_raw().len() as u64;
      if count >= MAX_FRAMES || allocated > MAX_BYTES {
        return Err(invalid(
          "Image animation exceeds 512 frames or 128 MB decoded",
        ));
      }
      let (numerator, denominator) = frame.delay().numer_denom_ms();
      // Zero-delay GIF frames need a nonzero timeline interval in both preview and bake.
      let duration = numerator.div_ceil(denominator).max(10);
      emit(frame.into_buffer(), duration)?;
      count += 1;
    }
    if count == 0 {
      return Err(invalid("GIF contains no frames"));
    }
    Ok((plays, "gif"))
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
    emit(image, 0)?;
    Ok((1, extension))
  }
}

/// Managed intermediates favor encoding speed; the original and all RGBA pixels remain lossless.
fn encode_png(image: &RgbaImage) -> Result<Vec<u8>, Error> {
  use image::codecs::png::{CompressionType, FilterType, PngEncoder};
  let mut bytes = Vec::new();
  PngEncoder::new_with_quality(&mut bytes, CompressionType::Fast, FilterType::Adaptive)
    .write_image(
      image.as_raw(),
      image.width(),
      image.height(),
      image::ExtendedColorType::Rgba8,
    )
    .map_err(|error| invalid(error.to_string()))?;
  Ok(bytes)
}

#[cfg(test)]
type DecodedImage = (Vec<(RgbaImage, u32)>, u32, &'static str);
#[cfg(test)]
fn decode(bytes: &[u8], source: &Path) -> Result<DecodedImage, Error> {
  let mut frames = Vec::new();
  let (plays, extension) = decode_each(bytes, source, |image, duration| {
    frames.push((image, duration));
    Ok(())
  })?;
  Ok((frames, plays, extension))
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
  let folder = format!("{PREFIX}{}", super::modding_edits::fingerprint(&bytes));
  let directory = contained(root, &folder)?;
  if let Some(image) = cache::get(&directory)? {
    return Ok(image);
  }
  std::fs::create_dir_all(&directory)?;
  let mut output = ModdingModelImage {
    path: String::new(),
    width: 0,
    height: 0,
    frames: Vec::new(),
    plays: 1,
  };
  let mut hashes = Vec::new();
  let (plays, extension) = decode_each(&bytes, source, |image, duration_ms| {
    let index = output.frames.len();
    if index == 0 {
      output.width = image.width();
      output.height = image.height();
    }
    let path = format!("{folder}/frame_{index:04}.png");
    let encoded = encode_png(&image)?;
    let hash = super::modding_edits::fingerprint(&encoded);
    if hashes.last() == Some(&hash) {
      output
        .frames
        .last_mut()
        .expect("matching hash has a frame")
        .duration_ms += duration_ms;
      return Ok(());
    }
    hashes.push(hash);
    super::modding_edits::write_atomic(&contained(root, &path)?, &encoded)?;
    output
      .frames
      .push(ModdingModelImageFrame { path, duration_ms });
    Ok(())
  })?;
  output.path = format!("{folder}/original.{extension}");
  output.plays = plays;
  super::modding_edits::write_atomic(&contained(root, &output.path)?, &bytes)?;
  cache::insert(directory, output.clone(), hashes);
  Ok(output)
}
/// Validate source identity before reusing decoded metadata and hashed frame files.
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
  let source = contained(root, path)?;
  if let Some(image) = cache::get(source.parent().expect("managed source has a directory"))?
    && image.path == path
  {
    return Ok(image);
  }
  use std::io::Read;
  let mut bytes = Vec::new();
  std::fs::File::open(&source)?
    .take(MAX_BYTES + 1)
    .read_to_end(&mut bytes)?;
  if bytes.len() as u64 > MAX_BYTES
    || Path::new(path)
      .parent()
      .and_then(Path::file_name)
      .and_then(|name| name.to_str())
      != Some(&super::modding_edits::fingerprint(&bytes))
  {
    return Err(invalid(
      "Managed image source changed outside DMM; import it again",
    ));
  }
  drop(bytes);
  let image = import(root, &source)?;
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
  fn cached_load_preserves_frames_and_repairs_changed_derivatives_without_trusting_a_changed_source()
   {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("animation.gif");
    std::fs::write(&source, gif(Some(image::codecs::gif::Repeat::Infinite))).unwrap();
    let imported = import(root.path(), &source).unwrap();
    let frame_path = root.path().join(&imported.frames[0].path);
    let recorded = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(100);
    std::fs::File::options()
      .write(true)
      .open(&frame_path)
      .unwrap()
      .set_modified(recorded)
      .unwrap();
    assert_eq!(load(root.path(), &imported.path).unwrap(), imported);
    assert_eq!(
      std::fs::metadata(&frame_path).unwrap().modified().unwrap(),
      recorded
    );
    std::fs::write(&frame_path, b"corrupted derivative").unwrap();
    assert_eq!(load(root.path(), &imported.path).unwrap(), imported);
    assert_eq!(
      frame_pixels(root.path(), &imported, &imported.frames[0])
        .unwrap()
        .get_pixel(0, 0)
        .0,
      [255, 0, 0, 255]
    );
    let original = root.path().join(&imported.path);
    std::fs::write(&original, gif(None)).unwrap();
    assert!(load(root.path(), &imported.path).is_err());
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

  #[test]
  fn consecutive_duplicate_frames_share_pixels_and_keep_the_total_duration() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("duplicate.gif");
    {
      let mut encoder =
        image::codecs::gif::GifEncoder::new(std::fs::File::create(&source).unwrap());
      for delay in [30, 90] {
        encoder
          .encode_frame(image::Frame::from_parts(
            RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255])),
            0,
            0,
            image::Delay::from_numer_denom_ms(delay, 1),
          ))
          .unwrap();
      }
    }
    let imported = import(root.path(), &source).unwrap();
    assert_eq!(imported.frames.len(), 1);
    assert_eq!(imported.frames[0].duration_ms, 120);
    assert_eq!(load(root.path(), &imported.path).unwrap(), imported);
  }
}
