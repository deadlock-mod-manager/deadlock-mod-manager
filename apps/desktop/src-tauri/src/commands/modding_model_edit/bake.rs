use super::*;
use storage::{ResourceState, Saved};
use vpkmanager::model_edit::{TextureEdit, edit_texture_with_image, hide_materials};

fn rgb(hex: &str) -> [f64; 3] {
  std::array::from_fn(|i| {
    let value = f64::from(u8::from_str_radix(&hex[1 + i * 2..3 + i * 2], 16).unwrap_or(0)) / 255.;
    if value <= 0.04045 {
      value / 12.92
    } else {
      ((value + 0.055) / 1.055).powf(2.4)
    }
  })
}
fn hue(hex: &str) -> f64 {
  let [r, g, b] = rgb(hex);
  let peak = r.max(g).max(b);
  let delta = peak - r.min(g).min(b);
  if delta == 0. {
    return 0.;
  }
  (if peak == r {
    60. * ((g - b) / delta)
  } else if peak == g {
    60. * ((b - r) / delta + 2.)
  } else {
    60. * ((r - g) / delta + 4.)
  })
  .rem_euclid(360.)
}
fn compiled(path: &str) -> String {
  if path.ends_with("_c") {
    path.into()
  } else {
    format!("{path}_c")
  }
}
fn bytes<'a>(
  addon: &ModdingAddon,
  previous: &Saved,
  archive: &VpkArchive,
  originals: &'a mut BTreeMap<String, Vec<u8>>,
  path: &str,
  refresh: bool,
) -> Result<&'a [u8], Error> {
  if !originals.contains_key(path) {
    let current = archive
      .extract_entry_limited(path, 256 * 1024 * 1024)
      .map_err(|e| invalid(e.to_string()))?;
    let data = match previous.resources.get(path) {
      Some(record) if !refresh || fingerprint(&current) == record.applied => {
        storage::original(addon, previous, archive, path)?
      }
      _ => current,
    };
    if originals
      .values()
      .map(Vec::len)
      .sum::<usize>()
      .saturating_add(data.len())
      > 256 * 1024 * 1024
    {
      return Err(invalid(
        "Model originals exceed 256 MB; edit a smaller model",
      ));
    }
    originals.insert(path.into(), data);
  }
  originals
    .get(path)
    .map(Vec::as_slice)
    .ok_or_else(|| invalid("Missing model edit original"))
}

fn stage_output(
  output: &mut BTreeMap<String, Vec<u8>>,
  path: String,
  bytes: Vec<u8>,
) -> Result<(), Error> {
  if output
    .values()
    .map(Vec::len)
    .sum::<usize>()
    .saturating_add(bytes.len())
    > 256 * 1024 * 1024
  {
    return Err(invalid(
      "Model edit output exceeds 256 MB; edit a smaller model",
    ));
  }
  output.insert(path, bytes);
  Ok(())
}

pub(super) fn apply(
  addon: &ModdingAddon,
  mut saved: Saved,
  refresh: bool,
  expected: Option<(String, String)>,
) -> Result<(), Error> {
  let previous = storage::load(addon)?;
  if !refresh {
    storage::verify(addon, &previous)?;
  }
  let current = archive(addon)?;
  let mut originals = BTreeMap::new();
  let mut output = BTreeMap::new();
  let mut signatures = BTreeMap::new();
  let mut materials: BTreeMap<String, ModdingModelPartEdit> = BTreeMap::new();
  for (model, edits) in &saved.models {
    validate_model_path(model)?;
    validate_edits(edits)?;
    let original = bytes(addon, &previous, &current, &mut originals, model, refresh)?;
    let actual =
      vpkmanager::material_repair::drawn_materials(original).map_err(|e| invalid(e.to_string()))?;
    if edits.len() != actual.len()
      || edits.iter().any(|e| {
        !actual
          .iter()
          .any(|m| m.trim_end_matches("_c") == e.material)
      })
    {
      return Err(invalid(format!(
        "Compiled model materials changed: {model}. Restore or reload its model edits before compiling again"
      )));
    }
    let hidden: Vec<_> = edits
      .iter()
      .filter(|e| e.hidden)
      .map(|e| e.material.clone())
      .collect();
    if !hidden.is_empty() {
      stage_output(
        &mut output,
        model.clone(),
        hide_materials(original, &hidden).map_err(|e| invalid(e.to_string()))?,
      )?;
    }
    for edit in edits {
      let mut edit = edit.clone();
      edit.hidden = false;
      if !changed(&edit) {
        continue;
      }
      if materials
        .get(&edit.material)
        .is_some_and(|other| *other != edit)
      {
        return Err(invalid(format!(
          "{} is shared with another edited model. Use the same material settings in both models",
          edit.material
        )));
      }
      materials.insert(edit.material.clone(), edit);
    }
  }
  for (material, edit) in materials {
    let path = compiled(&material);
    let original = bytes(addon, &previous, &current, &mut originals, &path, refresh)?.to_vec();
    let layout = material_layout(&original).map_err(|e| invalid(e.to_string()))?;
    if !layout.pbr || ((edit.roughness.is_some() || edit.metalness.is_some()) && !layout.finishable)
    {
      return Err(invalid(format!(
        "Unsupported shader or animated finish in {material}"
      )));
    }
    let mut patches: BTreeMap<String, (String, TextureEdit)> = BTreeMap::new();
    let color_slot = layout.color.as_ref().map(|(slot, _)| slot.clone());
    if edit.tint.is_some()
      || edit.recolor.is_some()
      || edit.pattern.is_some()
      || edit.paint.is_some()
    {
      let (slot, texture) = layout
        .color
        .ok_or_else(|| invalid("Material has no editable albedo"))?;
      let patch = TextureEdit {
        pattern: edit.pattern.as_ref().map(|p| {
          vpkmanager::Pattern::new(
            vpkmanager::PatternStyle::parse(&p.style).expect("validated pattern"),
            p.intensity as f32,
            p.phase as f32,
          )
        }),
        tint: edit.tint.as_deref().map(rgb),
        recolor: edit
          .recolor
          .as_ref()
          .map(|r| [hue(&r.color), r.saturation, r.brightness]),
        ..Default::default()
      };
      patches.insert(slot, (texture, patch));
    }
    for (binding, value) in [
      (layout.roughness, edit.roughness),
      (layout.metalness, edit.metalness),
    ] {
      if let Some(value) = value {
        let (slot, texture, channel) =
          binding.ok_or_else(|| invalid("Material has no editable finish binding"))?;
        patches
          .entry(slot)
          .or_insert_with(|| (texture, TextureEdit::default()))
          .1
          .channels[channel] = Some(value);
      }
    }
    let (tree, _, _) =
      vpkmanager::material_repair::decode(&original).map_err(|e| invalid(e.to_string()))?;
    for property in &edit.parameters {
      if let Some((slot, channels)) =
        vpkmanager::model_edit::material::texture_binding(&property.name)
      {
        let texture = vpkmanager::model_edit::material::texture_path(&tree, slot)
          .ok_or_else(|| invalid(format!("Missing texture binding: {slot}")))?;
        let patch = &mut patches
          .entry(slot.into())
          .or_insert_with(|| (texture.into(), TextureEdit::default()))
          .1;
        for (channel, index) in channels {
          patch.channels[*channel] = Some(property.values[*index]);
        }
      }
    }
    let mut edited = original;
    let mut animated_bake = None;
    for (slot, (texture, patch)) in patches {
      let texture = compiled(&texture);
      relative(&texture, false)?;
      let original = current
        .extract_entry_limited(&texture, 256 * 1024 * 1024)
        .map_err(|e| invalid(e.to_string()))?;
      let key = fingerprint(format!("{material}:{slot}").as_bytes());
      let variant = format!("materials/dmm_model_edits/{key}.vtex");
      let variant_path = compiled(&variant);
      let signature = fingerprint(
        &serde_json::to_vec(&(
          "streamed-bc7-v1",
          &slot,
          fingerprint(&original),
          patch.tint,
          patch.recolor,
          patch.channels,
          edit.pattern.as_ref(),
          edit
            .paint
            .as_ref()
            .filter(|_| color_slot.as_deref() == Some(&slot)),
        ))
        .map_err(|e| invalid(e.to_string()))?,
      );
      let target = contained(Path::new(&addon.game_path), &variant_path)?;
      if target.exists() && !previous.resources.contains_key(&variant_path) {
        return Err(invalid(format!(
          "Model edit output already exists: {variant_path}"
        )));
      }
      let paint = edit
        .paint
        .as_ref()
        .filter(|_| color_slot.as_deref() == Some(&slot));
      let source_images = paint
        .map(|paint| paint::sources(paint, Path::new(&addon.content_path)))
        .transpose()?
        .unwrap_or_default();
      let animation = source_images
        .values()
        .find(|source| source.frames.len() > 1);
      let data = if let (Some(paint), Some(animation)) = (paint, animation) {
        if animation.frames.len() > 128 {
          return Err(invalid("Animated painting supports at most 128 frames"));
        }
        let base = paint::animation_base(
          vpkmanager::source2::decode(&original).map_err(|e| invalid(e.to_string()))?,
          animation.frames.len(),
        )?;
        let cached = match previous.resources.get(&variant_path) {
          Some(record) if record.input.as_deref() == Some(&signature) && target.is_file() => {
            let bytes = storage::read(&target)?;
            if fingerprint(&bytes) != record.applied {
              return Err(invalid("Edited texture changed outside DMM"));
            }
            Some(bytes)
          }
          _ => None,
        };
        animated_bake = Some((
          variant_path.clone(),
          original,
          base,
          paint.clone(),
          patch,
          animation.plays,
          source_images,
          cached,
        ));
        None
      } else {
        Some(match previous.resources.get(&variant_path) {
          Some(record) if record.input.as_deref() == Some(&signature) && target.is_file() => {
            let cached = storage::read(&target)?;
            if fingerprint(&cached) != record.applied {
              return Err(invalid("Edited texture changed outside DMM"));
            }
            cached
          }
          _ => {
            let painted = if let Some(paint) = edit
              .paint
              .as_ref()
              .filter(|_| color_slot.as_deref() == Some(&slot))
            {
              let mut image =
                vpkmanager::source2::decode(&original).map_err(|e| invalid(e.to_string()))?;
              if image.width < 128 || image.height < 128 {
                let vpkmanager::source2::ImageData::Rgba8(pixels) = &image.data else {
                  return Err(invalid("LDR required"));
                };
                let buffer = image::RgbaImage::from_raw(image.width, image.height, pixels.clone())
                  .ok_or_else(|| invalid("Invalid paint base"))?;
                let buffer =
                  image::imageops::resize(&buffer, 256, 256, image::imageops::FilterType::Nearest);
                image = vpkmanager::source2::Image {
                  width: 256,
                  height: 256,
                  data: vpkmanager::source2::ImageData::Rgba8(buffer.into_raw()),
                };
              }
              paint::apply_resolved(
                &mut image,
                paint,
                Some(Path::new(&addon.content_path)),
                &source_images,
                0,
              )?;
              Some(image)
            } else {
              None
            };
            edit_texture_with_image(&original, patch, painted)
              .map_err(|e| invalid(e.to_string()))?
          }
        })
      };
      signatures.insert(variant_path.clone(), signature);
      if let Some(data) = data {
        stage_output(&mut output, variant_path, data)?;
      }
      let resource_id =
        vpkmanager::resource_id::resource_id(&variant).map_err(|e| invalid(e.to_string()))?;
      edited = vpkmanager::material_repair::replace_texture_parameter(
        &edited,
        &slot,
        &(resource_id, variant),
      )
      .map_err(|e| invalid(e.to_string()))?;
    }
    for (name, value) in [
      ("TextureRoughness1", edit.roughness),
      ("TextureMetalness1", edit.metalness),
    ] {
      if let Some(value) = value {
        edited = vpkmanager::material_repair::set_static_vector(&edited, name, [value; 3])
          .map_err(|e| invalid(e.to_string()))?;
      }
    }
    for parameter in edit
      .parameters
      .iter()
      .filter(|p| vpkmanager::model_edit::material::texture_binding(&p.name).is_none())
    {
      edited = vpkmanager::model_edit::material::set_parameter(
        &edited,
        &parameter.name,
        &parameter.values,
      )
      .map_err(|e| invalid(e.to_string()))?;
    }
    if let Some(pattern) = &edit.pattern {
      edited = vpkmanager::model_edit::material::set_parameter(
        &edited,
        "g_vAlbedoScrollSpeed1",
        &[pattern.scroll[0], pattern.scroll[1], 0., 0.],
      )
      .map_err(|e| invalid(e.to_string()))?;
    }
    for expr in &edit.expressions {
      edited = vpkmanager::model_edit::material::set_expression(&edited, &expr.name, &expr.source)
        .map_err(|e| invalid(e.to_string()))?;
    }
    if let Some((
      texture_path,
      original_texture,
      base,
      paint,
      patch,
      plays,
      source_images,
      cached,
    )) = animated_bake
    {
      let animation = source_images
        .values()
        .find(|source| source.frames.len() > 1)
        .expect("animated bake has a source timeline");
      let durations: Vec<_> = animation
        .frames
        .iter()
        .map(|frame| frame.duration_ms)
        .collect();
      let mut elapsed = 0u64;
      let prepared = if cached.is_none() {
        Some(paint::PreparedPaint::new(
          &paint,
          Some(Path::new(&addon.content_path)),
          &source_images,
          base.width,
          base.height,
        )?)
      } else {
        None
      };
      let baked = super::super::modding_model_images::animation::bake_with(
        &edited,
        &original_texture,
        (base.width, base.height),
        &durations,
        plays,
        cached,
        |index| {
          let mut image = base.clone();
          prepared
            .as_ref()
            .expect("uncached bake prepares paint")
            .apply(&mut image, elapsed)?;
          elapsed += u64::from(durations[index]);
          let image = vpkmanager::model_edit::edit_image(image, patch)
            .map_err(|error| invalid(error.to_string()))?;
          let vpkmanager::source2::ImageData::Rgba8(pixels) = image.data else {
            return Err(invalid("LDR required"));
          };
          let pixels = image::RgbaImage::from_raw(image.width, image.height, pixels)
            .ok_or_else(|| invalid("Invalid painted animation frame"))?;
          if pixels.width() == base.width && pixels.height() == base.height {
            Ok(pixels)
          } else {
            Ok(image::imageops::resize(
              &pixels,
              base.width,
              base.height,
              image::imageops::FilterType::Lanczos3,
            ))
          }
        },
      )?;
      log::debug!(
        "[Workbench] Animated texture {texture_path}: {}x{} per frame",
        baked.frame_width,
        baked.frame_height
      );
      edited = baked.material;
      stage_output(&mut output, texture_path, baked.texture)?;
    }
    stage_output(&mut output, path, edited)?;
  }
  let mut files = BTreeMap::new();
  let mut resources = BTreeMap::new();
  for (path, data) in &output {
    let target = contained(Path::new(&addon.game_path), path)?;
    let generated = path.starts_with("materials/dmm_model_edits/");
    let (original, local) = if generated {
      (None, false)
    } else {
      let original = bytes(addon, &previous, &current, &mut originals, path, refresh)?;
      files.insert(
        storage::original_path(addon, path)?,
        Some(original.to_vec()),
      );
      (
        Some(fingerprint(original)),
        previous.resources.get(path).map_or(target.is_file(), |r| {
          r.local
            || (refresh
              && target.is_file()
              && storage::read(&target).is_ok_and(|b| fingerprint(&b) != r.applied))
        }),
      )
    };
    resources.insert(
      path.clone(),
      ResourceState {
        original,
        local,
        applied: fingerprint(data),
        input: signatures.remove(path),
      },
    );
    files.insert(target, Some(data.clone()));
  }
  for (path, record) in &previous.resources {
    if resources.contains_key(path) {
      continue;
    }
    let original = if record.local {
      Some(bytes(addon, &previous, &current, &mut originals, path, refresh)?.to_vec())
    } else {
      None
    };
    files.insert(contained(Path::new(&addon.game_path), path)?, original);
  }
  saved.resources = resources;
  let state = serde_json::to_vec_pretty(&saved).map_err(|e| invalid(e.to_string()))?;
  if state.len() > 1024 * 1024 {
    return Err(invalid(
      "Model edit manifest exceeds 1 MB; simplify paint layers",
    ));
  }
  files.insert(
    contained(Path::new(&addon.content_path), storage::STATE)?,
    Some(state),
  );
  if let Some((model, expected)) = expected {
    let latest = storage::load(addon)?;
    let (actual, _, _) = inspect(addon, &model, &latest, &current)?;
    if actual != expected {
      return Err(invalid(
        "Model inputs changed while saving. Reload before trying again",
      ));
    }
  }
  storage::write_transaction(files)
}
