use super::*;
use source2_model::vmesh::{MaterialAlphaMode, PreviewTexture};
use vpkmanager::model_patch::PatchSkin;

fn invalid(error: impl std::fmt::Display) -> Error {
  super::invalid(error.to_string())
}

#[derive(Clone, Copy)]
struct SurfaceVertex {
  position: [f32; 3],
  skin: PatchSkin,
}
type SurfaceTriangle = [SurfaceVertex; 3];
fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
  std::array::from_fn(|i| a[i] - b[i])
}
fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
  (0..3).map(|i| a[i] * b[i]).sum()
}
fn coordinates(point: [f32; 3], triangle: &SurfaceTriangle) -> ([f32; 3], f32) {
  let [a, b, c] = triangle.map(|v| v.position);
  let ab = sub(b, a);
  let ac = sub(c, a);
  let ap = sub(point, a);
  let aa = dot(ab, ab);
  let bb = dot(ac, ac);
  let cross = dot(ab, ac);
  let denominator = aa * bb - cross * cross;
  if denominator > f32::EPSILON {
    let v = (bb * dot(ap, ab) - cross * dot(ap, ac)) / denominator;
    let w = (aa * dot(ap, ac) - cross * dot(ap, ab)) / denominator;
    if v >= 0. && w >= 0. && v + w <= 1. {
      let closest = std::array::from_fn(|i| a[i] + ab[i] * v + ac[i] * w);
      return (
        [1. - v - w, v, w],
        dot(sub(point, closest), sub(point, closest)),
      );
    }
  }
  let mut best = ([1., 0., 0.], f32::INFINITY);
  for (start, end) in [(0, 1), (1, 2), (2, 0)] {
    let origin = triangle[start].position;
    let edge = sub(triangle[end].position, origin);
    let length = dot(edge, edge);
    let t = if length > 0. {
      (dot(sub(point, origin), edge) / length).clamp(0., 1.)
    } else {
      0.
    };
    let closest = std::array::from_fn(|i| origin[i] + edge[i] * t);
    let distance = dot(sub(point, closest), sub(point, closest));
    if distance < best.1 {
      let mut weights = [0.; 3];
      weights[start] = 1. - t;
      weights[end] = t;
      best = (weights, distance);
    }
  }
  best
}
fn nearest(surface: &[SurfaceTriangle], vertex: &PatchVertex) -> Option<PatchSkin> {
  // Patch buffers use Source 2 coordinates; the decoder exposes glTF coordinates.
  let point = [vertex.position[0], vertex.position[2], -vertex.position[1]];
  let normal = [vertex.normal[0], vertex.normal[2], -vertex.normal[1]];
  let mut aligned = None;
  let mut fallback = None;
  for triangle in surface {
    let (weights, distance) = coordinates(point, triangle);
    if fallback.as_ref().is_none_or(|(_, _, d)| distance < *d) {
      fallback = Some((triangle, weights, distance));
    }
    let ab = sub(triangle[1].position, triangle[0].position);
    let ac = sub(triangle[2].position, triangle[0].position);
    let face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if dot(face, normal) > 0. && aligned.as_ref().is_none_or(|(_, _, d)| distance < *d) {
      aligned = Some((triangle, weights, distance));
    }
  }
  let (triangle, barycentric, _) = aligned.or(fallback)?;
  let mut mixed = BTreeMap::<u16, f32>::new();
  for (vertex, amount) in triangle.iter().zip(barycentric) {
    for (bone, weight) in vertex.skin.bones.into_iter().zip(vertex.skin.weights) {
      *mixed.entry(bone).or_default() += weight * amount;
    }
  }
  let mut mixed = mixed
    .into_iter()
    .filter(|(_, w)| *w > 0.)
    .collect::<Vec<_>>();
  mixed.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
  mixed.truncate(4);
  let total = mixed.iter().map(|(_, w)| w).sum::<f32>();
  Some(PatchSkin {
    bones: std::array::from_fn(|i| mixed.get(i).map_or(0, |(bone, _)| *bone)),
    weights: std::array::from_fn(|i| mixed.get(i).map_or(0., |(_, w)| w / total)),
  })
}

pub(super) fn inherit(
  model: &[u8],
  host: &str,
  vertices: &[PatchVertex],
) -> Result<Option<Vec<PatchSkin>>, Error> {
  let resource = source2_model::Resource::parse(model.to_vec()).map_err(invalid)?;
  let materials = vpkmanager::material_repair::drawn_materials(model).map_err(invalid)?;
  let textures = materials
    .into_iter()
    .map(|name| PreviewTexture {
      material: Some(name.clone()),
      name,
      source2: None,
      tint_mask_png: None,
      png: Vec::new(),
      normal_png: None,
      orm_png: None,
      emissive_png: None,
      self_illum_mask_png: None,
      vertex_color: false,
      double_sided: false,
      base_color_factor: [1.; 4],
      metalness_factor: 0.,
      alpha_mode: MaterialAlphaMode::Opaque,
      alpha_cutoff: 0.5,
      emissive_factor: None,
      emissive_strength: 1.,
      outline: None,
      source2_effect: None,
      effect_mask_png: None,
    })
    .collect::<Vec<_>>();
  let render =
    source2_model::vmesh::decode_embedded_model_render_model_from_resource(&resource, &textures)
      .map_err(invalid)?;
  let mut surface = Vec::new();
  for primitive in &render.primitives {
    if !render
      .materials
      .get(primitive.material)
      .is_some_and(|material| material.name.trim_end_matches("_c") == host.trim_end_matches("_c"))
    {
      continue;
    }
    let (Some(joints), Some(weights)) = (&primitive.joints, &primitive.weights) else {
      continue;
    };
    // Shared buffers may contain other materials: sample only this draw's triangles.
    for face in primitive.indices.as_chunks::<3>().0 {
      surface.push(std::array::from_fn(|corner| {
        let i = face[corner] as usize;
        SurfaceVertex {
          position: std::array::from_fn(|axis| primitive.positions[i * 3 + axis]),
          skin: PatchSkin {
            bones: std::array::from_fn(|slot| joints[i * 4 + slot]),
            weights: std::array::from_fn(|slot| weights[i * 4 + slot]),
          },
        }
      }));
    }
  }
  if surface.is_empty() {
    return Ok(None);
  }
  let front = vertices
    .iter()
    .take(169)
    .filter_map(|vertex| nearest(&surface, vertex))
    .collect::<Vec<_>>();
  // Thickness adds a mirrored shell, not a second independent attachment.
  Ok(Some(
    (0..vertices.len())
      .map(|i| front[i % front.len()])
      .collect(),
  ))
}

#[cfg(test)]
mod tests {
  use super::*;
  fn vertex(x: f32, y: f32, bone: u16) -> SurfaceVertex {
    SurfaceVertex {
      position: [x, y, 0.],
      skin: PatchSkin {
        bones: [bone, 0, 0, 0],
        weights: [1., 0., 0., 0.],
      },
    }
  }
  fn patch(x: f32, y: f32) -> PatchVertex {
    PatchVertex {
      position: [x, 0., y],
      normal: [0., -1., 0.],
      tangent: [1., 0., 0., 1.],
      uv: [0.; 2],
    }
  }
  #[test]
  fn attachment_interpolates_the_triangle_instead_of_snapping_to_a_vertex() {
    let surface = [[vertex(0., 0., 1), vertex(2., 0., 2), vertex(0., 2., 3)]];
    let skin = nearest(&surface, &patch(0.5, 0.5)).unwrap();
    assert_eq!(skin.bones, [1, 2, 3, 0]);
    assert_eq!(skin.weights, [0.5, 0.25, 0.25, 0.]);
    assert_eq!(coordinates([1., -1., 0.], &surface[0]).0, [0.5, 0.5, 0.]);
    assert!(nearest(&[], &patch(0., 0.)).is_none());
  }
  #[test]
  fn opposite_facing_surfaces_only_provide_a_fallback() {
    let front = [vertex(0., 0., 1), vertex(2., 0., 1), vertex(0., 2., 1)];
    let back = [vertex(0., 0., 9), vertex(0., 2., 9), vertex(2., 0., 9)];
    assert_eq!(
      nearest(&[back, front], &patch(0.5, 0.5)).unwrap().bones[0],
      1
    );
    assert_eq!(nearest(&[back], &patch(0.5, 0.5)).unwrap().bones[0], 9);
  }
}
