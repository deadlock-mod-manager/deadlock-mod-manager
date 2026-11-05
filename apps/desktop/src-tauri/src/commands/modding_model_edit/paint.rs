//! Native, replayable texture painting. Blend equations adapted from Deadlock Playground;
//! see LICENSE.deadlock-playground. The base texture and its alpha remain immutable.
use super::super::modding_model_images::{self, ModdingModelImage};
use super::*;
use base64::Engine;
use vpkmanager::source2::{Image, ImageData};

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub enum ModdingPaintBlend {
  Normal,
  Multiply,
  Screen,
  Overlay,
}
#[derive(Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingPaintStroke {
  pub color: [u8; 3],
  pub radius: f32,
  pub hardness: f32,
  pub opacity: f32,
  pub erase: bool,
  pub points: Vec<[f32; 2]>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub fill_tolerance: Option<f32>,
}
#[derive(Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingPaintLayer {
  pub id: String,
  pub name: String,
  pub visible: bool,
  pub opacity: f32,
  pub blend: ModdingPaintBlend,
  pub strokes: Vec<ModdingPaintStroke>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub image: Option<String>,
}
#[derive(Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingModelPaint {
  pub layers: Vec<ModdingPaintLayer>,
}
pub(super) fn validate(paint: &ModdingModelPaint) -> Result<(), Error> {
  let unit = |v: f32| v.is_finite() && (0.0..=1.0).contains(&v);
  let mut points = 0usize;
  let mut strokes = 0usize;
  let mut stamps = 0usize;
  let mut identities = BTreeSet::new();
  if paint.layers.len() > 8 {
    return Err(invalid("Painting supports at most 8 layers"));
  }
  for layer in &paint.layers {
    if layer.id.is_empty()
      || layer.id.len() > 64
      || !identities.insert(&layer.id)
      || layer.name.len() > 80
      || !unit(layer.opacity)
    {
      return Err(invalid("Invalid paint layer"));
    }
    if let Some(path) = &layer.image {
      relative(path, false)?;
      if !path.starts_with("materials/dmm_images/") || path.len() > 240 {
        return Err(invalid("Invalid managed image path"));
      }
    }
    for stroke in &layer.strokes {
      if stroke.points.is_empty()
        || !stroke.radius.is_finite()
        || !(0.002..=0.25).contains(&stroke.radius)
        || !unit(stroke.opacity)
        || !unit(stroke.hardness)
        || stroke.fill_tolerance.is_some_and(|value| !unit(value))
        || stroke.points.iter().flatten().any(|v| !unit(*v))
      {
        return Err(invalid("Invalid paint stroke"));
      }
      points += stroke.points.len();
      strokes += 1;
      stamps += 1;
      for pair in stroke.points.windows(2) {
        let distance = (pair[1][0] - pair[0][0]).hypot(pair[1][1] - pair[0][1]);
        stamps += (distance / (stroke.radius * 0.25)).ceil() as usize;
      }
    }
  }
  if points > 4096 || strokes > 128 || stamps > 32768 {
    return Err(invalid(
      "Paint document exceeds the stroke budget; simplify or remove a layer",
    ));
  }
  Ok(())
}
fn composite(bottom: &[u8], top: &[u8], opacity: f32, mode: ModdingPaintBlend) -> [u8; 4] {
  let alpha = f32::from(top[3]) / 255. * opacity;
  let mut result = [bottom[0], bottom[1], bottom[2], bottom[3]];
  for channel in 0..3 {
    let base = linear(bottom[channel]);
    result[channel] =
      encoded(base * (1. - alpha) + blend(base, linear(top[channel]), mode) * alpha);
  }
  result
}

fn fill(
  pixels: &mut [u8],
  width: usize,
  height: usize,
  base: &[u8],
  layer: &ModdingPaintLayer,
  stroke: &ModdingPaintStroke,
  tolerance: f32,
) {
  let reference = base
    .as_chunks::<4>()
    .0
    .iter()
    .zip(pixels.as_chunks::<4>().0.iter())
    .flat_map(|(bottom, top)| composite(bottom, top, layer.opacity, layer.blend))
    .collect::<Vec<_>>();
  let x = ((stroke.points[0][0] * width as f32) as usize).min(width - 1);
  let y = ((stroke.points[0][1] * height as f32) as usize).min(height - 1);
  let seed = &reference[(y * width + x) * 4..][..4];
  let threshold = (tolerance * 255.).round() as u8;
  let mut visited = vec![false; width * height];
  let matches = |index: usize| {
    reference[index * 4..][..4]
      .iter()
      .zip(seed)
      .all(|(a, b)| a.abs_diff(*b) <= threshold)
  };
  let mut pending = vec![(x, y)];
  while let Some((x, y)) = pending.pop() {
    if visited[y * width + x] || !matches(y * width + x) {
      continue;
    }
    let mut left = x;
    while left > 0 && !visited[y * width + left - 1] && matches(y * width + left - 1) {
      left -= 1;
    }
    let mut right = x;
    while right + 1 < width && !visited[y * width + right + 1] && matches(y * width + right + 1) {
      right += 1;
    }
    for current in left..=right {
      let index = y * width + current;
      visited[index] = true;
      let pixel = &mut pixels[index * 4..][..4];
      let old = f32::from(pixel[3]) / 255.;
      let alpha = stroke.opacity;
      if stroke.erase {
        pixel[3] = (old * (1. - alpha) * 255.).round() as u8;
      } else {
        let next = alpha + old * (1. - alpha);
        if next > 0. {
          for (channel, value) in pixel.iter_mut().take(3).enumerate() {
            *value = encoded(
              (linear(stroke.color[channel]) * alpha + linear(*value) * old * (1. - alpha)) / next,
            );
          }
        }
        pixel[3] = (next * 255.).round() as u8;
      }
    }
    for adjacent in [y.checked_sub(1), (y + 1 < height).then_some(y + 1)]
      .into_iter()
      .flatten()
    {
      let mut in_span = false;
      for current in left..=right {
        let index = adjacent * width + current;
        let eligible = !visited[index] && matches(index);
        if eligible && !in_span {
          pending.push((current, adjacent));
        }
        in_span = eligible;
      }
    }
  }
}
fn linear(v: u8) -> f32 {
  static VALUES: std::sync::OnceLock<[f32; 256]> = std::sync::OnceLock::new();
  VALUES.get_or_init(|| {
    std::array::from_fn(|i| {
      let v = i as f32 / 255.;
      if v <= 0.04045 {
        v / 12.92
      } else {
        ((v + 0.055) / 1.055).powf(2.4)
      }
    })
  })[usize::from(v)]
}
fn encoded(v: f32) -> u8 {
  let v = v.clamp(0., 1.);
  let v = if v <= 0.0031308 {
    v * 12.92
  } else {
    1.055 * v.powf(1. / 2.4) - 0.055
  };
  (v * 255.).round() as u8
}
fn blend(bottom: f32, top: f32, mode: ModdingPaintBlend) -> f32 {
  match mode {
    ModdingPaintBlend::Normal => top,
    ModdingPaintBlend::Multiply => bottom * top,
    ModdingPaintBlend::Screen => 1. - (1. - bottom) * (1. - top),
    ModdingPaintBlend::Overlay if bottom < 0.5 => 2. * bottom * top,
    ModdingPaintBlend::Overlay => 1. - 2. * (1. - bottom) * (1. - top),
  }
}
fn stroke(pixels: &mut [u8], width: usize, height: usize, stroke: &ModdingPaintStroke) {
  let rx = stroke.radius * width as f32;
  let ry = stroke.radius * height as f32;
  let mut coverage = vec![0f32; width * height];
  let mut bounds = [width, height, 0, 0];
  let mut dab = |point: [f32; 2]| {
    let cx = point[0] * width as f32;
    let cy = point[1] * height as f32;
    let x0 = (cx - rx).floor().max(0.) as usize;
    let y0 = (cy - ry).floor().max(0.) as usize;
    let x1 = ((cx + rx).ceil() as usize).min(width);
    let y1 = ((cy + ry).ceil() as usize).min(height);
    bounds = [
      bounds[0].min(x0),
      bounds[1].min(y0),
      bounds[2].max(x1),
      bounds[3].max(y1),
    ];
    for y in y0..y1 {
      for x in x0..x1 {
        let distance = ((x as f32 + 0.5 - cx) / rx).hypot((y as f32 + 0.5 - cy) / ry);
        let value = if distance <= stroke.hardness {
          1.
        } else {
          ((1. - distance) / (1. - stroke.hardness).max(0.0001)).clamp(0., 1.)
        };
        let index = y * width + x;
        coverage[index] = coverage[index].max(value);
      }
    }
  };
  dab(stroke.points[0]);
  for pair in stroke.points.windows(2) {
    let dx = pair[1][0] - pair[0][0];
    let dy = pair[1][1] - pair[0][1];
    let steps = (dx.hypot(dy) / (stroke.radius * 0.25)).ceil().max(1.) as usize;
    for step in 1..=steps {
      let t = step as f32 / steps as f32;
      dab([pair[0][0] + dx * t, pair[0][1] + dy * t]);
    }
  }
  for y in bounds[1]..bounds[3] {
    for x in bounds[0]..bounds[2] {
      let alpha = coverage[y * width + x] * stroke.opacity;
      if alpha == 0. {
        continue;
      }
      let pixel = &mut pixels[(y * width + x) * 4..][..4];
      let old = f32::from(pixel[3]) / 255.;
      if stroke.erase {
        pixel[3] = (old * (1. - alpha) * 255.).round() as u8;
      } else {
        let next = alpha + old * (1. - alpha);
        for (c, channel) in pixel.iter_mut().take(3).enumerate() {
          *channel = encoded(
            (linear(stroke.color[c]) * alpha + linear(*channel) * old * (1. - alpha)) / next,
          );
        }
        pixel[3] = (next * 255.).round() as u8;
      }
    }
  }
}
#[cfg(test)]
fn apply(image: &mut Image, paint: &ModdingModelPaint) -> Result<(), Error> {
  apply_resolved(image, paint, None, &BTreeMap::new(), 0)
}
pub(super) fn sources(
  paint: &ModdingModelPaint,
  root: &Path,
) -> Result<BTreeMap<String, ModdingModelImage>, Error> {
  let mut sources = BTreeMap::new();
  for path in paint
    .layers
    .iter()
    .filter(|layer| layer.visible && layer.opacity > 0.)
    .filter_map(|layer| layer.image.as_ref())
  {
    if !sources.contains_key(path) {
      sources.insert(path.clone(), modding_model_images::load(root, path)?);
    }
  }
  if sources.values().any(|source| source.frames.len() > 128) {
    return Err(invalid("Animated painting supports at most 128 frames"));
  }
  if sources
    .values()
    .filter(|source| source.frames.len() > 1)
    .count()
    > 1
  {
    return Err(invalid(
      "Painting currently supports one animated image source per material",
    ));
  }
  Ok(sources)
}
#[cfg(test)]
fn apply_at(
  image: &mut Image,
  paint: &ModdingModelPaint,
  root: &Path,
  elapsed_ms: u64,
) -> Result<(), Error> {
  let sources = sources(paint, root)?;
  apply_resolved(image, paint, Some(root), &sources, elapsed_ms)
}
pub(super) fn apply_resolved(
  image: &mut Image,
  paint: &ModdingModelPaint,
  root: Option<&Path>,
  sources: &BTreeMap<String, ModdingModelImage>,
  elapsed_ms: u64,
) -> Result<(), Error> {
  PreparedPaint::new(paint, root, sources, image.width, image.height)?.apply(image, elapsed_ms)
}

/// Static layers are decoded, resized and stroked once for the whole animation.
pub(super) struct PreparedPaint<'a> {
  paint: &'a ModdingModelPaint,
  root: Option<&'a Path>,
  sources: &'a BTreeMap<String, ModdingModelImage>,
  layers: Vec<Option<Vec<u8>>>,
}

impl<'a> PreparedPaint<'a> {
  pub(super) fn new(
    paint: &'a ModdingModelPaint,
    root: Option<&'a Path>,
    sources: &'a BTreeMap<String, ModdingModelImage>,
    width: u32,
    height: u32,
  ) -> Result<Self, Error> {
    validate(paint)?;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > 16 * 1024 * 1024 {
      return Err(invalid("Paint image exceeds 16 megapixels"));
    }
    let mut prepared = Self {
      paint,
      root,
      sources,
      layers: Vec::new(),
    };
    let mut cached_bytes = 0usize;
    let frame_bytes = width as usize * height as usize * 4;
    for layer in &paint.layers {
      let animated = layer
        .image
        .as_ref()
        .and_then(|path| sources.get(path))
        .is_some_and(|source| source.frames.len() > 1);
      if !layer.visible
        || layer.opacity == 0.
        || animated
        || layer.strokes.iter().any(|s| s.fill_tolerance.is_some())
        || cached_bytes + frame_bytes > 16 * 1024 * 1024
      {
        prepared.layers.push(None);
        continue;
      }
      let mut pixels = prepared.layer_pixels(layer, width, height, 0)?;
      for s in &layer.strokes {
        stroke(&mut pixels, width as usize, height as usize, s);
      }
      prepared.layers.push(Some(pixels));
      cached_bytes += frame_bytes;
    }
    Ok(prepared)
  }

  fn layer_pixels(
    &self,
    layer: &ModdingPaintLayer,
    width: u32,
    height: u32,
    elapsed_ms: u64,
  ) -> Result<Vec<u8>, Error> {
    let Some(path) = &layer.image else {
      return Ok(vec![0; width as usize * height as usize * 4]);
    };
    let root = self
      .root
      .ok_or_else(|| invalid("Managed image layers require an addon root"))?;
    let source = self
      .sources
      .get(path)
      .ok_or_else(|| invalid("Missing managed paint image"))?;
    let frame = modding_model_images::frame_at(source, elapsed_ms)
      .ok_or_else(|| invalid("Image has no frames"))?;
    let image = modding_model_images::frame_pixels(root, source, frame)?;
    if image.width() == width && image.height() == height {
      return Ok(image.into_raw());
    }
    Ok(
      image::imageops::resize(&image, width, height, image::imageops::FilterType::Lanczos3)
        .into_raw(),
    )
  }

  pub(super) fn apply(&self, image: &mut Image, elapsed_ms: u64) -> Result<(), Error> {
    let (width, height) = (image.width as usize, image.height as usize);
    if width == 0 || height == 0 || width.saturating_mul(height) > 16 * 1024 * 1024 {
      return Err(invalid("Paint image exceeds 16 megapixels"));
    }
    let ImageData::Rgba8(base) = &mut image.data else {
      return Err(invalid("Painting requires an LDR texture"));
    };
    if base.len() != width * height * 4 {
      return Err(invalid("Invalid paint image length"));
    }
    for (index, layer) in self
      .paint
      .layers
      .iter()
      .enumerate()
      .filter(|(_, l)| l.visible && l.opacity > 0.)
    {
      let mut generated;
      let pixels = if let Some(pixels) = &self.layers[index] {
        pixels
      } else {
        generated = self.layer_pixels(layer, width as u32, height as u32, elapsed_ms)?;
        for s in &layer.strokes {
          if let Some(tolerance) = s.fill_tolerance {
            fill(&mut generated, width, height, base, layer, s, tolerance);
          } else {
            stroke(&mut generated, width, height, s);
          }
        }
        &generated
      };
      for (bottom, top) in base
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(pixels.as_chunks::<4>().0)
      {
        let alpha = f32::from(top[3]) / 255. * layer.opacity;
        if alpha == 0. {
          continue;
        }
        if alpha == 1. && layer.blend == ModdingPaintBlend::Normal {
          bottom[..3].copy_from_slice(&top[..3]);
          continue;
        }
        for c in 0..3 {
          let b = linear(bottom[c]);
          bottom[c] = encoded(b * (1. - alpha) + blend(b, linear(top[c]), layer.blend) * alpha);
        }
      }
    }
    Ok(())
  }
}
pub(super) fn base(addon: &ModdingAddon, material: &str) -> Result<Image, Error> {
  relative(material, false)?;
  if !material.ends_with(".vmat") {
    return Err(invalid("Select a model material"));
  }
  let current = archive(addon)?;
  let saved = storage::load(addon)?;
  let original = storage::original(addon, &saved, &current, &format!("{material}_c"))?;
  let layout = material_layout(&original).map_err(|e| invalid(e.to_string()))?;
  let (_, texture) = layout
    .color
    .filter(|_| layout.pbr)
    .ok_or_else(|| invalid("Material has no paintable albedo"))?;
  let texture = if texture.ends_with("_c") {
    texture
  } else {
    format!("{texture}_c")
  };
  let bytes = current
    .extract_entry_limited(&texture, 256 * 1024 * 1024)
    .map_err(|e| invalid(e.to_string()))?;
  if !vpkmanager::model_edit::texture_editable(&bytes) {
    return Err(invalid("Texture format is not paintable"));
  }
  vpkmanager::source2::decode(&bytes).map_err(|e| invalid(e.to_string()))
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingPaintPreviewFrame {
  pub rgba_base64: String,
  pub duration_ms: u32,
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingPaintPreview {
  pub frames: Vec<ModdingPaintPreviewFrame>,
  pub plays: u32,
  pub width: u32,
  pub height: u32,
  pub frame_width: u32,
  pub frame_height: u32,
}

pub(super) fn animation_base(original: Image, count: usize) -> Result<Image, Error> {
  let layout = modding_model_images::animation::layout(original.width, original.height, count)?;
  resize_base(original, layout.frame_width, layout.frame_height)
}

fn resize_base(original: Image, width: u32, height: u32) -> Result<Image, Error> {
  if original.width == width && original.height == height {
    return Ok(original);
  }
  let ImageData::Rgba8(pixels) = original.data else {
    return Err(invalid("LDR required"));
  };
  let buffer = image::RgbaImage::from_raw(original.width, original.height, pixels)
    .ok_or_else(|| invalid("Invalid paint base"))?;
  let buffer = image::imageops::resize(
    &buffer,
    width,
    height,
    image::imageops::FilterType::Triangle,
  );
  Ok(Image {
    width,
    height,
    data: ImageData::Rgba8(buffer.into_raw()),
  })
}
#[tauri::command]
pub async fn preview_modding_model_paint(
  app: AppHandle,
  addon_id: String,
  material: String,
  paint: ModdingModelPaint,
) -> Result<ModdingPaintPreview, Error> {
  validate(&paint)?;
  let addon = super::super::modding_workspace::resolve(&app, &addon_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    let original = base(&addon, &material)?;
    let original_size = (original.width, original.height);
    let root = Path::new(&addon.content_path);
    let sources = sources(&paint, root)?;
    let animation = sources.values().find(|source| source.frames.len() > 1);
    let durations: Vec<u32> = animation
      .map(|source| {
        source
          .frames
          .iter()
          .map(|frame| frame.duration_ms)
          .collect()
      })
      .unwrap_or_else(|| vec![0]);
    let plays = animation.map_or(1, |source| source.plays);
    let (frame_width, frame_height) = if let Some(animation) = animation {
      let layout = modding_model_images::animation::layout(
        original_size.0,
        original_size.1,
        animation.frames.len(),
      )?;
      (layout.frame_width, layout.frame_height)
    } else {
      original_size
    };
    // Animated previews use the same bounded cells as the native export atlas.
    let scale = (1024. / f64::from(frame_width.max(frame_height))).min(1.);
    let width = (f64::from(frame_width) * scale).round().max(1.) as u32;
    let height = (f64::from(frame_height) * scale).round().max(1.) as u32;
    let preview = resize_base(original, width, height)?;
    let mut frames = Vec::new();
    let mut elapsed = 0u64;
    let prepared = PreparedPaint::new(&paint, Some(root), &sources, width, height)?;
    for duration_ms in durations {
      let mut frame = preview.clone();
      prepared.apply(&mut frame, elapsed)?;
      let ImageData::Rgba8(pixels) = frame.data else {
        unreachable!()
      };
      frames.push(ModdingPaintPreviewFrame {
        rgba_base64: base64::engine::general_purpose::STANDARD.encode(pixels),
        duration_ms,
      });
      elapsed += u64::from(duration_ms);
    }
    Ok(ModdingPaintPreview {
      frames,
      plays,
      width,
      height,
      frame_width,
      frame_height,
    })
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

#[cfg(test)]
mod tests;
