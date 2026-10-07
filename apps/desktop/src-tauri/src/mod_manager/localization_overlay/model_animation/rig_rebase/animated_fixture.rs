//! Opt-in corpus proof using real current NM clips and the authored weighted mesh.
use super::*;
use source2_model::{nm_anim::NmAnimation, vmesh::RenderModel};

fn sample_worlds(animation: &NmAnimation, time: f32) -> BTreeMap<String, Transform> {
  let samples = animation.sample_pose(time, true).unwrap();
  let mut worlds: Vec<Transform> = Vec::new();
  for (i, sample) in samples.iter().enumerate() {
    // The independent decoder returns glTF Y-up; this proof uses Source Z-up.
    let [x, y, z] = sample.translation.map(f64::from);
    let [a, b, c, d] = sample.rotation.map(f64::from);
    assert!(
      sample
        .scale
        .iter()
        .all(|s| (*s - sample.scale[0]).abs() < 0.00001)
    );
    let local = Transform::new([x, -z, y], [a, -c, b, d], f64::from(sample.scale[0])).unwrap();
    let parent = animation.skeleton.parent_indices[i];
    worlds.push(if parent < 0 {
      local
    } else {
      worlds[parent as usize].compose(local)
    });
  }
  animation
    .skeleton
    .bone_names
    .iter()
    .zip(worlds)
    .map(|(n, w)| (n.to_ascii_lowercase(), w))
    .collect()
}

fn skin_vertices(
  render: &RenderModel,
  rig: &Kv3Value,
  pose: &BTreeMap<String, Transform>,
) -> Vec<[f64; 3]> {
  let binds = worlds(rig).unwrap();
  let indices = indices(rig).unwrap();
  let skeleton = render.skeleton.as_ref().unwrap();
  let matrices: Vec<_> = skeleton
    .bones
    .iter()
    .map(|b| {
      let name = b.name.to_ascii_lowercase();
      pose[&name].compose(binds[indices[&name]].inverse())
    })
    .collect();
  let mut vertices = Vec::new();
  for mesh in &render.primitives {
    let joints = mesh.joints.as_ref().unwrap();
    let weights = mesh.weights.as_ref().unwrap();
    let lanes = joints.len() / (mesh.positions.len() / 3);
    assert_eq!(weights.len(), joints.len());
    for (i, p) in mesh.positions.as_chunks::<3>().0.iter().enumerate() {
      let p = [f64::from(p[0]), -f64::from(p[2]), f64::from(p[1])];
      let mut vertex = [0.; 3];
      for lane in 0..lanes {
        let j = i * lanes + lane;
        let point = matrices[usize::from(joints[j])].point(p);
        for axis in 0..3 {
          vertex[axis] += f64::from(weights[j]) * point[axis];
        }
      }
      vertices.push(vertex);
    }
  }
  vertices
}

pub(in super::super) fn verify(
  source: &[u8],
  current: &[u8],
  repaired: &[u8],
  animation: &NmAnimation,
) {
  let independent = source2_model::resource::Resource::parse(source.to_vec()).unwrap();
  let render =
    source2_model::vmesh::decode_embedded_model_render_model_from_resource(&independent, &[])
      .unwrap();
  let (_, authored, _) = decode_compiled_data(source, "authored animation proof").unwrap();
  let (_, canonical, _) = decode_compiled_data(current, "canonical animation proof").unwrap();
  let (_, result, _) = decode_compiled_data(repaired, "repaired animation proof").unwrap();
  let mut canonical_error: f64 = 0.;
  for time in [
    0.,
    animation.clip.duration_seconds * 0.5,
    animation.clip.duration_seconds * 0.9,
  ] {
    let pose = sample_worlds(animation, time);
    let expected = skin_vertices(&render, &authored, &pose);
    let actual = skin_vertices(&render, &result, &pose);
    let wrong = skin_vertices(&render, &canonical, &pose);
    for ((a, b), c) in expected.iter().zip(actual).zip(wrong) {
      for axis in 0..3 {
        assert!(
          (a[axis] - b[axis]).abs() < 0.005,
          "animated vertex changed: {}",
          (a[axis] - b[axis]).abs()
        );
        canonical_error = canonical_error.max((a[axis] - c[axis]).abs());
      }
    }
  }
  // This fixture must expose the seated-vs-standing binding error, not just parse.
  assert!(
    canonical_error > 100.,
    "fixture did not expose articulated bind-frame error"
  );
  println!(
    "{}: authored animated vertices preserved; canonical bind replacement error {canonical_error:.2}",
    animation.clip_path
  );
}
