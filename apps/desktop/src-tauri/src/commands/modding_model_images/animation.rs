//! PBR's native UV constants select a frame of a painted atlas using engine time.
use super::{Error, invalid};
use image::{RgbaImage, imageops};
use vpkmanager::source2::{
  kv3::{self, Value},
  resource::Resource,
  vfx_expr,
};

pub(crate) struct AnimationFrame {
  pub pixels: RgbaImage,
  pub duration_ms: u32,
}
pub(crate) struct AnimatedTexture {
  pub material: Vec<u8>,
  pub texture: Vec<u8>,
  pub frame_width: u32,
  pub frame_height: u32,
}
fn table<'a>(tree: &'a Value, key: &str) -> &'a [Value] {
  tree.get(key).and_then(Value::as_array).unwrap_or(&[])
}
fn vector(tree: &Value, key: &str, default: [f64; 4]) -> [f64; 4] {
  table(tree, "m_vectorParams")
    .iter()
    .find(|entry| entry.get("m_name").and_then(Value::as_str) == Some(key))
    .and_then(|entry| entry.get("m_value"))
    .and_then(Value::as_array)
    .map(|values| {
      std::array::from_fn(|i| values.get(i).and_then(Value::as_f64).unwrap_or(default[i]))
    })
    .unwrap_or(default)
}
fn replace_entry(
  tree: &mut Value,
  table: &str,
  name: &str,
  key: &str,
  value: Value,
) -> Result<(), Error> {
  let Value::Object(fields) = tree else {
    return Err(invalid("Invalid material object"));
  };
  if !fields.iter().any(|(field, _)| field == table) {
    fields.push((table.into(), Value::Array(Vec::new())));
  }
  let Some(Value::Array(entries)) = fields
    .iter_mut()
    .find(|(field, _)| field == table)
    .map(|(_, value)| value)
  else {
    return Err(invalid("Invalid material parameter table"));
  };
  entries.retain(|entry| entry.get("m_name").and_then(Value::as_str) != Some(name));
  entries.push(Value::Object(vec![
    ("m_name".into(), Value::String(name.into())),
    (key.into(), value),
  ]));
  Ok(())
}
fn expression(offsets: &[f64], durations: &[u32], plays: u32) -> String {
  let total: u64 = durations.iter().map(|value| u64::from(*value)).sum();
  let total_seconds = total as f64 / 1000.;
  let clock = format!("frac(time()/{total_seconds:.6})*{total_seconds:.6}");
  let mut result = format!("{:.9}", offsets[0]);
  let mut boundary = 0u64;
  for index in 1..offsets.len() {
    boundary += u64::from(durations[index - 1]);
    let difference = offsets[index] - offsets[index - 1];
    if difference != 0. {
      result.push_str(&format!(
        "+step({:.6},{clock})*({difference:.9})",
        boundary as f64 / 1000.
      ));
    }
  }
  if plays == 0 {
    result
  } else {
    format!(
      "(time()>={:.6}?{:.9}:({result}))",
      total_seconds * f64::from(plays),
      offsets[offsets.len() - 1]
    )
  }
}
pub(crate) struct AtlasLayout {
  pub frame_width: u32,
  pub frame_height: u32,
  columns: u32,
  atlas_width: u32,
  atlas_height: u32,
}
pub(crate) fn layout(width: u32, height: u32, count: usize) -> Result<AtlasLayout, Error> {
  if !(2..=128).contains(&count) || width == 0 || height == 0 || width > 8192 || height > 8192 {
    return Err(invalid("Invalid animation dimensions"));
  }
  let columns = (count as f64).sqrt().ceil() as u32;
  let rows = (count as u32).div_ceil(columns);
  let scale = ((16. * 1024. * 1024.
    / (f64::from(width + 4) * f64::from(height + 4) * f64::from(columns * rows)))
  .sqrt())
  .min(1.)
  .min(8192. / f64::from((width + 4) * columns))
  .min(8192. / f64::from((height + 4) * rows));
  let mut cell_width = (f64::from(width) * scale).floor() as u32 + 4;
  let mut cell_height = (f64::from(height) * scale).floor() as u32 + 4;
  while u64::from(cell_width) * u64::from(cell_height) * u64::from(columns * rows)
    > 16 * 1024 * 1024
    || cell_width * columns > 8192
    || cell_height * rows > 8192
  {
    if cell_width * columns >= cell_height * rows {
      cell_width = cell_width.saturating_sub(1);
    } else {
      cell_height = cell_height.saturating_sub(1);
    }
  }
  let atlas_width = cell_width * columns;
  let atlas_height = cell_height * rows;
  if cell_width < 5 || cell_height < 5 {
    return Err(invalid("Texture is too small for this animation atlas"));
  }
  let frame_width = cell_width - 4;
  let frame_height = cell_height - 4;
  Ok(AtlasLayout {
    frame_width,
    frame_height,
    columns,
    atlas_width,
    atlas_height,
  })
}
/// Frames contain the entire painted base-color map, including static layers.
/// Full-resolution cells are preserved within the 16 megapixel, 8192-pixel atlas limits.
pub(crate) fn bake(
  original_material: &[u8],
  original_texture: &[u8],
  frames: &[AnimationFrame],
  plays: u32,
) -> Result<AnimatedTexture, Error> {
  if plays != 0 {
    return Err(invalid(
      "In-game image animation requires Repeat forever because the engine shares one animation clock. Convert this image to infinite looping before saving the model",
    ));
  }
  if frames.len() < 2 || frames.len() > 128 || frames.iter().any(|frame| frame.duration_ms == 0) {
    return Err(invalid(
      "Animated textures require 2 to 128 frames with positive durations",
    ));
  }
  let resource = Resource::parse(original_material).map_err(|e| invalid(e.to_string()))?;
  let data = resource.data_block().map_err(|e| invalid(e.to_string()))?;
  let (mut tree, encoding) = kv3::decode_preserving(data).map_err(|e| invalid(e.to_string()))?;
  if tree.get("m_shaderName").and_then(Value::as_str) != Some("pbr.vfx") {
    return Err(invalid(
      "Animated image painting currently requires the native pbr.vfx material",
    ));
  }
  for (key, expected) in [
    ("g_vAlbedoTexcoordScale1", [1., 1., 0., 0.]),
    ("g_vAlbedoTexcoordOffset1", [0.; 4]),
    ("g_vAlbedoScrollSpeed1", [0.; 4]),
  ] {
    if vector(&tree, key, expected) != expected {
      return Err(invalid(
        "Animated painting requires default base-color UV scale, offset and scroll",
      ));
    }
  }
  if table(&tree, "m_dynamicParams").iter().any(|entry| {
    entry
      .get("m_name")
      .and_then(Value::as_str)
      .is_some_and(|name| {
        name.starts_with("g_vAlbedoTexcoord")
          || name == "g_vAlbedoScrollSpeed1"
          || name == "g_flAlbedoTexcoordRotation1"
      })
  }) || table(&tree, "m_floatParams").iter().any(|entry| {
    entry.get("m_name").and_then(Value::as_str) == Some("g_flAlbedoTexcoordRotation1")
      && entry.get("m_flValue").and_then(Value::as_f64).unwrap_or(0.) != 0.
  }) {
    return Err(invalid(
      "Animated painting cannot replace existing dynamic or rotated base-color UVs",
    ));
  }
  let (width, height) = (frames[0].pixels.width(), frames[0].pixels.height());
  if width == 0 || height == 0 || width > 8192 || height > 8192 {
    return Err(invalid("Invalid animation dimensions"));
  }
  let AtlasLayout {
    frame_width,
    frame_height,
    columns,
    atlas_width,
    atlas_height,
  } = layout(width, height, frames.len())?;
  let (cell_width, cell_height) = (frame_width + 4, frame_height + 4);
  let mut atlas = RgbaImage::new(atlas_width, atlas_height);
  let mut x = Vec::new();
  let mut y = Vec::new();
  for (index, frame) in frames.iter().enumerate() {
    if frame.pixels.width() != width || frame.pixels.height() != height {
      return Err(invalid(
        "Painted animation frames must match the original texture dimensions",
      ));
    }
    let resized = imageops::resize(
      &frame.pixels,
      frame_width,
      frame_height,
      imageops::FilterType::Lanczos3,
    );
    let left = (index as u32 % columns) * cell_width;
    let top = (index as u32 / columns) * cell_height;
    // Extruded borders prevent neighboring frame colors entering ordinary bilinear samples.
    for dy in 0..cell_height {
      for dx in 0..cell_width {
        atlas.put_pixel(
          left + dx,
          top + dy,
          *resized.get_pixel(
            dx.saturating_sub(2).min(frame_width - 1),
            dy.saturating_sub(2).min(frame_height - 1),
          ),
        );
      }
    }
    x.push(
      f64::from(left + 2) / f64::from(atlas_width)
        - (1. - f64::from(frame_width) / f64::from(atlas_width)) / 2.,
    );
    y.push(
      f64::from(top + 2) / f64::from(atlas_height)
        - (1. - f64::from(frame_height) / f64::from(atlas_height)) / 2.,
    );
  }
  let durations: Vec<_> = frames.iter().map(|frame| frame.duration_ms).collect();
  let source = format!(
    "float2({}, {})",
    expression(&x, &durations, plays),
    expression(&y, &durations, plays)
  );
  let expression = vfx_expr::compile(&source).map_err(|e| invalid(e.to_string()))?;
  replace_entry(
    &mut tree,
    "m_dynamicParams",
    "g_vAlbedoTexcoordOffset1",
    "m_value",
    Value::Binary(expression.bytecode),
  )?;
  replace_entry(
    &mut tree,
    "m_vectorParams",
    "g_vAlbedoTexcoordScale1",
    "m_value",
    Value::Array(vec![
      Value::Double(f64::from(frame_width) / f64::from(atlas_width)),
      Value::Double(f64::from(frame_height) / f64::from(atlas_height)),
      Value::Double(0.),
      Value::Double(0.),
    ]),
  )?;
  let scale = [
    f64::from(frame_width) / f64::from(atlas_width),
    f64::from(frame_height) / f64::from(atlas_height),
  ];
  let offsets: Vec<[f64; 2]> = x
    .iter()
    .zip(&y)
    .map(|(x, y)| [x + (1. - scale[0]) / 2., y + (1. - scale[1]) / 2.])
    .collect();
  let metadata = serde_json::json!({"version":1,"scale":scale,"offsets":offsets,"durationsMs":durations,"plays":0});
  replace_entry(
    &mut tree,
    "m_stringAttributes",
    "DmmAnimatedAlbedo",
    "m_value",
    Value::String(serde_json::to_string(&metadata).map_err(|e| invalid(e.to_string()))?),
  )?;
  // PBR compiles UV transforms out unless this feature selects S_ENABLE_TEXTURE_TRANSFORMS.
  replace_entry(
    &mut tree,
    "m_intParams",
    "F_ENABLE_TEXTURE_TRANSFORMS",
    "m_nValue",
    Value::Int(1),
  )?;
  let format = kv3::Format::from_payload(data).map_err(|e| invalid(e.to_string()))?;
  let encoded = kv3::wire::encode_preserving_v5(&tree, &encoding, &format)
    .map_err(|e| invalid(e.to_string()))?;
  let material = resource
    .rebuild_with_data_preserving(&encoded)
    .map_err(|e| invalid(e.to_string()))?;
  let info = vpkmanager::source2::inspect(original_texture).map_err(|e| invalid(e.to_string()))?;
  let texture = vpkmanager::source2::texture::encode_vtex_png_rgba8888(
    &vpkmanager::source2::Image {
      width: atlas_width,
      height: atlas_height,
      data: vpkmanager::source2::ImageData::Rgba8(atlas.into_raw()),
    },
    info.flags,
  )
  .map_err(|e| invalid(e.to_string()))?;
  Ok(AnimatedTexture {
    material,
    texture,
    frame_width,
    frame_height,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::path::Path;
  #[test]
  fn atlas_preserves_resolution_until_hardware_budget_requires_downscaling() {
    let small = layout(64, 32, 2).unwrap();
    assert_eq!((small.frame_width, small.frame_height), (64, 32));
    for dimensions in [(4096, 4096, 128), (8192, 32, 128), (32, 8192, 128)] {
      let atlas = layout(dimensions.0, dimensions.1, dimensions.2).unwrap();
      assert!(u64::from(atlas.atlas_width) * u64::from(atlas.atlas_height) <= 16 * 1024 * 1024);
      assert!(atlas.atlas_width <= 8192 && atlas.atlas_height <= 8192);
    }
  }
  #[test]
  fn maximum_frame_timeline_compiles_without_register_overflow() {
    let offsets: Vec<_> = (0..128).map(|index| f64::from(index % 12) / 12.).collect();
    let durations = vec![30; 128];
    let source = expression(&offsets, &durations, 0);
    let compiled = vfx_expr::compile(&format!("float2({source},{source})")).unwrap();
    assert!(vfx_expr::decompile::<&str>(&compiled.bytecode, &[]).is_ok());
  }
  #[test]
  fn unequal_durations_and_finite_repeats_generate_native_expressions() {
    let source = expression(&[-0.25, 0.25], &[30, 90], 2);
    assert!(source.contains("time()>=0.240000?0.250000000"));
    assert!(source.contains("step(0.030000,frac(time()/0.120000)*0.120000)"));
    let compiled = vfx_expr::compile(&format!("float2({source},0)")).unwrap();
    let decompiled = vfx_expr::decompile::<&str>(&compiled.bytecode, &[]).unwrap();
    assert!(decompiled.contains("step"));
    assert!(decompiled.contains("time()"));
    assert!(!expression(&[-0.25, 0.25], &[30, 90], 0).contains('?'));
  }
  #[test]
  #[ignore = "Requires native CSDK-compiled VMAT and VTEX fixtures"]
  fn native_compiler_fixture_roundtrip_retains_shader_and_atlas_frames() {
    let material_path =
      std::env::var("DMM_ANIMATION_MATERIAL_FIXTURE").expect("Set native VMAT fixture");
    let texture_path =
      std::env::var("DMM_ANIMATION_TEXTURE_FIXTURE").expect("Set native VTEX fixture");
    let material = std::fs::read(material_path).unwrap();
    let texture = std::fs::read(texture_path).unwrap();
    let original = vpkmanager::source2::decode(&texture).unwrap();
    // The compiler probe itself has animated UVs; remove only the probe-owned constants.
    let resource = Resource::parse(&material).unwrap();
    let data = resource.data_block().unwrap();
    let (mut tree, encoding) = kv3::decode_preserving(data).unwrap();
    if let Some(Value::Array(entries)) = tree.get_mut("m_dynamicParams") {
      entries.clear();
    }
    if let Some(Value::Array(entries)) = tree.get_mut("m_vectorParams") {
      entries.clear();
    }
    let format = kv3::Format::from_payload(data).unwrap();
    let material = resource
      .rebuild_with_data_preserving(
        &kv3::wire::encode_preserving_v5(&tree, &encoding, &format).unwrap(),
      )
      .unwrap();
    let frames: Vec<_> = [([255, 0, 0, 255], 30), ([0, 255, 0, 255], 90)]
      .into_iter()
      .map(|(pixel, duration_ms)| AnimationFrame {
        pixels: RgbaImage::from_pixel(original.width, original.height, image::Rgba(pixel)),
        duration_ms,
      })
      .collect();
    let result = bake(&material, &texture, &frames, 0).unwrap();
    assert!(bake(&material, &texture, &frames, 1).is_err());
    let resource = Resource::parse(&result.material).unwrap();
    let tree = kv3::decode(resource.data_block().unwrap()).unwrap();
    assert_eq!(
      tree.get("m_shaderName").and_then(Value::as_str),
      Some("pbr.vfx")
    );
    let attributes = tree
      .get("m_stringAttributes")
      .and_then(Value::as_array)
      .unwrap();
    let metadata = attributes
      .iter()
      .find(|attribute| {
        attribute.get("m_name").and_then(Value::as_str) == Some("DmmAnimatedAlbedo")
      })
      .unwrap()
      .get("m_value")
      .and_then(Value::as_str)
      .unwrap();
    let metadata: serde_json::Value = serde_json::from_str(metadata).unwrap();
    assert_eq!(metadata["durationsMs"], serde_json::json!([30, 90]));
    assert_eq!(metadata["version"], 1);
    assert!(
      table(&tree, "m_intParams").iter().any(|parameter| parameter
        .get("m_name")
        .and_then(Value::as_str)
        == Some("F_ENABLE_TEXTURE_TRANSFORMS")
        && parameter.get("m_nValue").and_then(Value::as_int) == Some(1))
    );
    let expressions = vpkmanager::model_edit::material::material_expressions(&tree);
    assert!(
      expressions
        .iter()
        .any(|(name, source)| name == "g_vAlbedoTexcoordOffset1" && source.contains("step"))
    );
    let texture_resource = Resource::parse(&result.texture).unwrap();
    let end = texture_resource
      .blocks()
      .iter()
      .map(|block| block.offset + block.size)
      .max()
      .unwrap();
    assert_eq!(
      u32::from_le_bytes(result.texture[..4].try_into().unwrap()),
      end
    );
    let decoded = vpkmanager::source2::decode(&result.texture).unwrap();
    let vpkmanager::source2::ImageData::Rgba8(pixels) = decoded.data else {
      panic!("Expected LDR image");
    };
    assert!(pixels[0] > 240 && pixels[1] < 10);
    let next = ((result.frame_width + 4) as usize) * 4;
    assert!(pixels[next] < 10 && pixels[next + 1] > 240);
    assert!(bake(&result.material, &result.texture, &frames, 0).is_err());
    if let Ok(directory) = std::env::var("DMM_ANIMATION_PROOF_OUTPUT") {
      std::fs::create_dir_all(&directory).unwrap();
      std::fs::write(
        Path::new(&directory).join("animated.vmat_c"),
        result.material,
      )
      .unwrap();
      std::fs::write(Path::new(&directory).join("atlas.vtex_c"), result.texture).unwrap();
    }
  }
}
