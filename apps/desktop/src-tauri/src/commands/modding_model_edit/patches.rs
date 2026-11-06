mod background;
use super::super::modding_model_images;
use super::*;
use vpkmanager::{
  model_patch::{self, AttachedPatch, PatchMaterial, PatchVertex},
  source2::{
    Image, ImageData,
    texture::{encode_vtex_bc7, format::TextureFlags},
  },
};

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub enum ModdingPatchShape {
  Conform,
  Flat,
  Curve,
  Dome,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingPatchBackground {
  pub color: String,
  pub tolerance: f64,
  pub softness: f64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub edge_connected: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub gap_protection: Option<f64>,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingModelPatch {
  pub id: String,
  pub image: String,
  pub bone: String,
  pub position: [f64; 3],
  pub rotation: [f64; 4],
  pub size: [f64; 2],
  pub shape: ModdingPatchShape,
  pub curvature: f64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub contour: Option<Vec<f64>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub conformity: Option<f64>,
  pub thickness: f64,
  pub offset: f64,
  pub roughness: f64,
  pub glow: f64,
  pub crop: [f64; 4],
  pub background: Option<ModdingPatchBackground>,
}

pub(super) fn validate(patches: &[ModdingModelPatch]) -> Result<(), Error> {
  if patches.len() > 8 {
    return Err(invalid(
      "A material supports at most eight attached stickers",
    ));
  }
  let mut ids = BTreeSet::new();
  for p in patches {
    relative(&p.image, false)?;
    if p.id.is_empty()
      || p.id.len() > 64
      || !p.id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
      || !ids.insert(&p.id)
      || !p.image.starts_with("materials/dmm_images/")
      || p.bone.len() > 128
      || p
        .position
        .iter()
        .any(|v| !v.is_finite() || v.abs() > 10000.)
      || p.rotation.iter().any(|v| !v.is_finite())
      || (p.rotation.iter().map(|v| v * v).sum::<f64>() - 1.).abs() > 0.01
      || p
        .size
        .iter()
        .any(|v| !v.is_finite() || !(0.01..=1000.).contains(v))
      || !p.curvature.is_finite()
      || !(0.0..=1.).contains(&p.curvature)
      || p
        .contour
        .as_ref()
        .is_some_and(|v| v.len() != 169 || v.iter().any(|h| !h.is_finite() || h.abs() > 1000.))
      || p
        .conformity
        .is_some_and(|v| !v.is_finite() || !(0.0..=1.0).contains(&v))
      || !p.thickness.is_finite()
      || !(0.0..=10.).contains(&p.thickness)
      || !p.offset.is_finite()
      || !(-5.0..=20.).contains(&p.offset)
      || !p.roughness.is_finite()
      || !(0.0..=1.).contains(&p.roughness)
      || !p.glow.is_finite()
      || !(0.0..=10.).contains(&p.glow)
      || p
        .crop
        .iter()
        .any(|v| !v.is_finite() || !(0.0..=1.).contains(v))
      || p.crop[0] >= p.crop[2]
      || p.crop[1] >= p.crop[3]
      || p.background.as_ref().is_some_and(|b| {
        !hex(&b.color)
          || !b.tolerance.is_finite()
          || !(0.0..=1.).contains(&b.tolerance)
          || b
            .gap_protection
            .is_some_and(|v| !v.is_finite() || !(0.0..=0.05).contains(&v))
          || !b.softness.is_finite()
          || !(0.0..=1.).contains(&b.softness)
      })
    {
      return Err(invalid("Invalid attached sticker settings"));
    }
  }
  Ok(())
}

fn rotate(q: [f64; 4], v: [f64; 3]) -> [f64; 3] {
  let [x, y, z, w] = q;
  let t = [
    2. * (y * v[2] - z * v[1]),
    2. * (z * v[0] - x * v[2]),
    2. * (x * v[1] - y * v[0]),
  ];
  [
    v[0] + w * t[0] + y * t[2] - z * t[1],
    v[1] + w * t[1] + z * t[0] - x * t[2],
    v[2] + w * t[2] + x * t[1] - y * t[0],
  ]
}
fn transform(matrix: &[f32; 16], v: [f64; 3], point: bool) -> [f32; 3] {
  std::array::from_fn(|axis| {
    (0..3)
      .map(|c| matrix[c * 4 + axis] * v[c] as f32)
      .sum::<f32>()
      + if point { matrix[12 + axis] } else { 0. }
  })
}
fn normalize(v: [f64; 3]) -> [f64; 3] {
  let length = v.iter().map(|v| v * v).sum::<f64>().sqrt();
  v.map(|v| v / length)
}

pub(super) fn geometry(p: &ModdingModelPatch, bind: &[f32; 16]) -> (Vec<PatchVertex>, Vec<u16>) {
  let segments: usize = if matches!(p.shape, ModdingPatchShape::Flat) {
    1
  } else {
    12
  };
  let rows: usize = if matches!(
    p.shape,
    ModdingPatchShape::Dome | ModdingPatchShape::Conform
  ) {
    12
  } else {
    1
  };
  let rise = p.curvature * p.size[0].min(p.size[1]) * 0.25;
  let mut vertices = Vec::new();
  let mut indices = Vec::new();
  let mut point = |x: f64, y: f64, z: f64, normal: [f64; 3], tangent: [f64; 3], uv: [f32; 2]| {
    let local = rotate(p.rotation, [x, y, z + p.offset]);
    let position = transform(
      bind,
      std::array::from_fn(|i| local[i] + p.position[i]),
      true,
    );
    let normal = transform(bind, rotate(p.rotation, normal), false);
    let tangent = transform(bind, rotate(p.rotation, tangent), false);
    vertices.push(PatchVertex {
      position: [position[0], -position[2], position[1]],
      normal: [normal[0], -normal[2], normal[1]],
      tangent: [tangent[0], -tangent[2], tangent[1], 1.],
      uv,
    });
  };
  for y in 0..=rows {
    for x in 0..=segments {
      let u = x as f64 / segments as f64;
      let v = y as f64 / rows as f64;
      let curved = !matches!(p.shape, ModdingPatchShape::Flat);
      let dome = matches!(
        p.shape,
        ModdingPatchShape::Dome | ModdingPatchShape::Conform
      );
      let z = if curved {
        rise * (1. - (u * 2. - 1.).powi(2)) * if dome { 1. - (v * 2. - 1.).powi(2) } else { 1. }
      } else {
        0.
      };
      let dx = if curved {
        -4. * rise * (u * 2. - 1.) / p.size[0] * if dome { 1. - (v * 2. - 1.).powi(2) } else { 1. }
      } else {
        0.
      };
      let dy = if dome {
        -4. * rise * (v * 2. - 1.) / p.size[1] * (1. - (u * 2. - 1.).powi(2))
      } else {
        0.
      };
      let contour = |x: usize, y: usize| {
        if matches!(p.shape, ModdingPatchShape::Conform) {
          p.contour
            .as_ref()
            .map(|v| v[y * 13 + x] * p.conformity.unwrap_or(1.))
            .unwrap_or(0.)
        } else {
          0.
        }
      };
      let left = x.saturating_sub(1);
      let right = (x + 1).min(segments);
      let bottom = y.saturating_sub(1);
      let top = (y + 1).min(rows);
      let dx = dx
        + (contour(right, y) - contour(left, y))
          / ((right - left) as f64 * p.size[0] / segments as f64);
      let dy = dy
        + (contour(x, top) - contour(x, bottom))
          / ((top - bottom) as f64 * p.size[1] / rows as f64);
      let z = z + contour(x, y);
      point(
        (u - 0.5) * p.size[0],
        (v - 0.5) * p.size[1],
        z,
        normalize([-dx, -dy, 1.]),
        normalize([1., 0., dx]),
        [u as f32, 1. - v as f32],
      );
    }
  }
  for y in 0..rows {
    for x in 0..segments {
      let a = (y * (segments + 1) + x) as u16;
      let b = a + 1;
      let c = a + (segments + 1) as u16;
      indices.extend_from_slice(&[a, b, c, b, c + 1, c]);
    }
  }
  // A thin closed shell remains visible at glancing angles and from behind.
  if p.thickness > 0. {
    let front = vertices.len();
    for i in 0..front {
      let mut v = vertices[i].clone();
      let normal = transform(bind, rotate(p.rotation, [0., 0., 1.]), false);
      v.position[0] -= normal[0] * p.thickness as f32;
      v.position[1] += normal[2] * p.thickness as f32;
      v.position[2] -= normal[1] * p.thickness as f32;
      v.normal = v.normal.map(|v| -v);
      vertices.push(v);
    }
    let front_indices = indices.clone();
    for t in front_indices.as_chunks::<3>().0 {
      indices.extend_from_slice(&[
        t[0] + front as u16,
        t[2] + front as u16,
        t[1] + front as u16,
      ]);
    }
    let mut edges = Vec::new();
    for x in 0..segments {
      edges.push((x, x + 1));
      let a = rows * (segments + 1) + x;
      edges.push((a + 1, a));
    }
    for y in 0..rows {
      let a = y * (segments + 1);
      edges.push((a + segments + 1, a));
      edges.push((a + segments, a + 2 * segments + 1));
    }
    for (a, b) in edges {
      let a = a as u16;
      let b = b as u16;
      let n = front as u16;
      indices.extend_from_slice(&[a, a + n, b, b, a + n, b + n]);
    }
  }
  (vertices, indices)
}

fn frame(
  root: &Path,
  image: &modding_model_images::ModdingModelImage,
  index: usize,
  patch: &ModdingModelPatch,
) -> Result<image::RgbaImage, Error> {
  let mut pixels = modding_model_images::frame_pixels(root, image, &image.frames[index])?;
  if let Some(key) = &patch.background {
    background::apply(&mut pixels, key);
  }
  let [left, top, right, bottom] = patch.crop;
  let x = (left * f64::from(pixels.width())).round() as u32;
  let y = (top * f64::from(pixels.height())).round() as u32;
  let right = (right * f64::from(pixels.width())).round() as u32;
  let bottom = (bottom * f64::from(pixels.height())).round() as u32;
  if right <= x || bottom <= y {
    return Err(invalid("Sticker crop is empty"));
  }
  Ok(image::imageops::crop_imm(&pixels, x, y, right - x, bottom - y).to_image())
}

pub(super) struct PatchOutput {
  pub model: Vec<u8>,
  pub files: BTreeMap<String, Vec<u8>>,
  pub signatures: BTreeMap<String, String>,
}

pub(super) fn bake(
  addon: &ModdingAddon,
  model: &[u8],
  host: &str,
  patch: &ModdingModelPatch,
  template: &[u8],
  previous: &storage::Saved,
) -> Result<PatchOutput, Error> {
  validate(std::slice::from_ref(patch))?;
  let root = Path::new(&addon.content_path);
  let source = modding_model_images::load(root, &patch.image)?;
  if source.frames.len() > 128 {
    return Err(invalid(
      "Attached animated stickers support at most 128 frames",
    ));
  }
  let parsed =
    source2_model::Resource::parse(model.to_vec()).map_err(|e| invalid(e.to_string()))?;
  let skeleton =
    source2_model::skeleton::parse_model_skeleton(&parsed).map_err(|e| invalid(e.to_string()))?;
  let identity = [
    1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1.,
  ];
  let bind = if patch.bone.is_empty() {
    &identity
  } else if let Some(skeleton) = &skeleton {
    skeleton
      .bones
      .iter()
      .find(|b| b.name == patch.bone)
      .map(|b| &b.model_bind_matrix)
      .ok_or_else(|| invalid("Sticker attachment bone is missing"))?
  } else {
    &identity
  };
  let (vertices, indices) = geometry(patch, bind);
  let prefix = format!("materials/dmm_model_edits/patch_{}", patch.id);
  let material_path = format!("{prefix}.vmat");
  let color_path = format!("{prefix}_color.vtex");
  let normal_path = format!("{prefix}_normal.vtex");
  let black_path = "materials/dmm_model_edits/patch_black.vtex";
  let white_path = "materials/dmm_model_edits/patch_white.vtex";
  let flags = TextureFlags::SUGGEST_CLAMP_S | TextureFlags::SUGGEST_CLAMP_T;
  let solid = |pixel: [u8; 4]| {
    encode_vtex_bc7(
      &Image {
        width: 4,
        height: 4,
        data: ImageData::Rgba8(pixel.repeat(16)),
      },
      flags,
    )
    .map_err(|e| invalid(e.to_string()))
  };
  let mut material = model_patch::material(
    template,
    PatchMaterial {
      name: &material_path,
      color: &color_path,
      normal: &normal_path,
      black: black_path,
      white: white_path,
      glow: patch.glow,
    },
  )
  .map_err(|e| invalid(e.to_string()))?;
  let mut files = BTreeMap::new();
  let mut signatures = BTreeMap::new();
  let signature = fingerprint(
    &serde_json::to_vec(&(
      "patch-atlas-bc7-v3",
      &patch.image,
      &patch.crop,
      &patch.background,
    ))
    .map_err(|e| invalid(e.to_string()))?,
  );
  let output_path = format!("{color_path}_c");
  let cached = if let Some(record) = previous
    .resources
    .get(&output_path)
    .filter(|r| r.input.as_ref() == Some(&signature))
  {
    let bytes = storage::read(&contained(Path::new(&addon.game_path), &output_path)?)?;
    if fingerprint(&bytes) != record.applied {
      return Err(invalid("Sticker texture changed outside DMM"));
    }
    Some(bytes)
  } else {
    None
  };
  let texture = if source.frames.len() > 1 {
    let width = ((patch.crop[2] * f64::from(source.width)).round()
      - (patch.crop[0] * f64::from(source.width)).round())
    .max(1.) as u32;
    let height = ((patch.crop[3] * f64::from(source.height)).round()
      - (patch.crop[1] * f64::from(source.height)).round())
    .max(1.) as u32;
    let baked = modding_model_images::animation::bake_with(
      &material,
      &solid([255; 4])?,
      (width, height),
      &source
        .frames
        .iter()
        .map(|f| f.duration_ms)
        .collect::<Vec<_>>(),
      0,
      cached,
      |i| frame(root, &source, i, patch),
    )?;
    material = baked.material;
    baked.texture
  } else if let Some(cached) = cached {
    cached
  } else {
    let pixels = frame(root, &source, 0, patch)?;
    encode_vtex_bc7(
      &Image {
        width: pixels.width(),
        height: pixels.height(),
        data: ImageData::Rgba8(pixels.into_raw()),
      },
      flags,
    )
    .map_err(|e| invalid(e.to_string()))?
  };
  files.insert(output_path.clone(), texture);
  signatures.insert(output_path, signature);
  files.insert(
    format!("{normal_path}_c"),
    solid([128, 128, 255, (patch.roughness * 255.).round() as u8])?,
  );
  files.insert(format!("{black_path}_c"), solid([0, 0, 0, 0])?);
  files.insert(format!("{white_path}_c"), solid([255; 4])?);
  files.insert(format!("{material_path}_c"), material);
  let model = model_patch::attach(
    model,
    &[AttachedPatch {
      host_material: host,
      material: &material_path,
      bone: &patch.bone,
      vertices: &vertices,
      indices: &indices,
    }],
  )
  .map_err(|e| invalid(e.to_string()))?;
  Ok(PatchOutput {
    model,
    files,
    signatures,
  })
}
