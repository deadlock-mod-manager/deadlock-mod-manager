//! Reads the cloth setup (`m_pFeModel`) out of a model's PHYS block.
//!
//! Source 2 simulates cloth as a set of point masses ("nodes") tied together by
//! distance constraints ("rods"). Static nodes follow the animated skeleton;
//! dynamic nodes swing under gravity and collide with capsules and spheres
//! fixed to static nodes. This keeps only what a preview needs to reproduce
//! that motion, converted to the glTF axes the exported model uses.

use crate::kv3::{self, KvValue};
use crate::nm_anim::{source_quat_to_gltf, source_vec3_to_gltf};
use crate::{Resource, Result};

#[derive(Debug, Clone)]
pub struct ClothNode {
    /// The skeleton bone (or cloth control point) this node drives.
    pub name: String,
    /// Index of the node this one hangs from, or -1 for the model root.
    pub parent: i32,
    /// Static nodes follow the animation and are never moved by the solver.
    pub is_static: bool,
    /// Model-space bind position and rotation, in glTF axes.
    pub bind_position: [f32; 3],
    pub bind_rotation: [f32; 4],
    /// Downward acceleration in model units per second squared.
    pub gravity: f32,
    pub damping: f32,
    /// How much of the animated motion carries into the node each step.
    pub animation_force_attraction: f32,
    /// How strongly the node is pulled back to its animated position.
    pub animation_vertex_attraction: f32,
    pub collision_radius: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct ClothRod {
    pub nodes: [u16; 2],
    pub min_distance: f32,
    pub max_distance: f32,
    /// Share of the correction applied to the first node.
    pub weight0: f32,
    pub relaxation: f32,
}

/// Keeps a node within `max_distance` of its animated position.
#[derive(Debug, Clone, Copy)]
pub struct ClothStrayRadius {
    pub node: u16,
    pub max_distance: f32,
    pub relaxation: f32,
}

/// A capsule whose ends may have different radii, in the local frame of `node`.
/// Each sphere is `[x, y, z, radius]`.
#[derive(Debug, Clone, Copy)]
pub struct ClothCollider {
    pub node: u16,
    pub spheres: [[f32; 4]; 2],
}

/// Authored frame for a cloth bone: X = x0 - x1, Y = y0 - y1.
#[derive(Debug, Clone, Copy)]
pub struct ClothNodeBase {
    pub node: u16,
    pub x0: u16,
    pub x1: u16,
    pub y0: u16,
    pub y1: u16,
    /// Rotation from the reconstructed frame to the bone, in glTF axes.
    pub q_adjust: [f32; 4],
}

#[derive(Debug, Clone, Default)]
pub struct ClothModel {
    pub nodes: Vec<ClothNode>,
    pub rods: Vec<ClothRod>,
    pub stray_radii: Vec<ClothStrayRadius>,
    pub colliders: Vec<ClothCollider>,
    pub node_bases: Vec<ClothNodeBase>,
}

fn array<'a>(value: &'a KvValue, key: &str) -> &'a [KvValue] {
    value.get(key).and_then(KvValue::as_array).unwrap_or(&[])
}

fn field(value: &KvValue, key: &str) -> f32 {
    value.get(key).and_then(KvValue::as_f32).unwrap_or(0.0)
}

fn node_pair(value: &KvValue) -> Option<[u16; 2]> {
    let pair = value.get("nNode")?.as_f32_array::<2>()?;
    Some([pair[0] as u16, pair[1] as u16])
}

fn local_sphere(sphere: [f32; 4]) -> [f32; 4] {
    let [x, y, z] = source_vec3_to_gltf([sphere[0], sphere[1], sphere[2]]);
    [x, y, z, sphere[3]]
}

fn name(value: &KvValue) -> String {
    match value {
        KvValue::String(name) => name.clone(),
        KvValue::Binary(bytes) => {
            let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
            String::from_utf8_lossy(&bytes[..end]).into_owned()
        }
        _ => String::new(),
    }
}

fn node_bases(fe: &KvValue, node_count: usize) -> Vec<ClothNodeBase> {
    let index = |base: &KvValue, key: &str| {
        let node = u16::try_from(base.get(key)?.as_u32()?).ok()?;
        ((node as usize) < node_count).then_some(node)
    };
    array(fe, "m_NodeBases")
        .iter()
        .filter_map(|base| {
            let adjustment = match base.get("qAdjust") {
                Some(value) => value.as_f32_array::<4>()?,
                None => [0.0, 0.0, 0.0, 1.0],
            };
            let length_squared: f32 = adjustment.iter().map(|value| value * value).sum();
            if !length_squared.is_finite() || length_squared <= f32::EPSILON {
                return None;
            }
            Some(ClothNodeBase {
                node: index(base, "nNode")?,
                x0: index(base, "nNodeX0")?,
                x1: index(base, "nNodeX1")?,
                y0: index(base, "nNodeY0")?,
                y1: index(base, "nNodeY1")?,
                q_adjust: source_quat_to_gltf(adjustment),
            })
        })
        .collect()
}

/// The model's cloth, or `None` when it has no simulated nodes.
pub fn parse_model_cloth(resource: &Resource) -> Result<Option<ClothModel>> {
    let Some(bytes) = resource.block_bytes("PHYS") else {
        return Ok(None);
    };
    let physics = kv3::parse(bytes)?;
    let Some(fe) = physics
        .get("m_pFeModel")
        .filter(|fe| !matches!(fe, KvValue::Null))
    else {
        return Ok(None);
    };
    let node_count = fe
        .get("m_nNodeCount")
        .and_then(KvValue::as_f32)
        .map_or(0, |count| count as usize);
    let static_count = fe
        .get("m_nStaticNodes")
        .and_then(KvValue::as_f32)
        .map_or(0, |count| count as usize);
    let names = array(fe, "m_CtrlName");
    let poses = array(fe, "m_InitPose");
    if node_count == 0 || static_count >= node_count || names.len() < node_count {
        return Ok(None);
    }
    let parents = array(fe, "m_SkelParents");
    let inverse_masses = array(fe, "m_NodeInvMasses");
    let integrators = array(fe, "m_NodeIntegrator");
    // Collision radii cover only the dynamic nodes, which follow the static ones.
    let radii = array(fe, "m_NodeCollisionRadii");
    let gravity_scale = fe
        .get("m_flDefaultGravityScale")
        .and_then(KvValue::as_f32)
        .unwrap_or(1.0);

    let nodes = (0..node_count)
        .map(|index| {
            let pose = poses
                .get(index)
                .and_then(KvValue::as_f32_array::<8>)
                .unwrap_or([0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
            let integrator = integrators.get(index);
            let inverse_mass = inverse_masses
                .get(index)
                .and_then(KvValue::as_f32)
                .unwrap_or(0.0);
            ClothNode {
                name: name(&names[index]),
                parent: parents
                    .get(index)
                    .and_then(KvValue::as_f32)
                    .map_or(-1, |parent| parent as i32)
                    .min(node_count as i32 - 1),
                is_static: index < static_count || inverse_mass <= 0.0,
                bind_position: source_vec3_to_gltf([pose[0], pose[1], pose[2]]),
                bind_rotation: source_quat_to_gltf([pose[4], pose[5], pose[6], pose[7]]),
                gravity: integrator.map_or(360.0, |value| field(value, "flGravity"))
                    * gravity_scale,
                damping: integrator.map_or(0.0, |value| field(value, "flPointDamping")),
                animation_force_attraction: integrator
                    .map_or(0.0, |value| field(value, "flAnimationForceAttraction")),
                animation_vertex_attraction: integrator
                    .map_or(0.0, |value| field(value, "flAnimationVertexAttraction")),
                collision_radius: index
                    .checked_sub(static_count)
                    .and_then(|dynamic| radii.get(dynamic))
                    .and_then(KvValue::as_f32)
                    .unwrap_or(0.0),
            }
        })
        .collect();
    let in_range = |pair: [u16; 2]| pair.iter().all(|&node| (node as usize) < node_count);

    let rods = array(fe, "m_Rods")
        .iter()
        .filter_map(|rod| {
            let nodes = node_pair(rod).filter(|pair| in_range(*pair))?;
            Some(ClothRod {
                nodes,
                min_distance: field(rod, "flMinDist"),
                max_distance: field(rod, "flMaxDist"),
                weight0: field(rod, "flWeight0"),
                relaxation: field(rod, "flRelaxationFactor"),
            })
        })
        .collect();
    let stray_radii = array(fe, "m_AnimStrayRadii")
        .iter()
        .filter_map(|stray| {
            let [node, _] = node_pair(stray).filter(|pair| in_range(*pair))?;
            Some(ClothStrayRadius {
                node,
                max_distance: field(stray, "flMaxDist"),
                relaxation: field(stray, "flRelaxationFactor"),
            })
        })
        .collect();
    let rigid_node = |rigid: &KvValue| {
        rigid
            .get("nNode")
            .and_then(KvValue::as_f32)
            .map(|node| node as u16)
            .filter(|&node| (node as usize) < node_count)
    };
    let capsules = array(fe, "m_TaperedCapsuleRigids")
        .iter()
        .filter_map(|rigid| {
            let spheres = rigid.get("vSphere")?.as_array()?;
            Some(ClothCollider {
                node: rigid_node(rigid)?,
                spheres: [
                    local_sphere(spheres.first()?.as_f32_array::<4>()?),
                    local_sphere(spheres.get(1)?.as_f32_array::<4>()?),
                ],
            })
        });
    let spheres = array(fe, "m_SphereRigids").iter().filter_map(|rigid| {
        let sphere = local_sphere(rigid.get("vSphere")?.as_f32_array::<4>()?);
        Some(ClothCollider {
            node: rigid_node(rigid)?,
            spheres: [sphere, sphere],
        })
    });

    Ok(Some(ClothModel {
        nodes,
        rods,
        stray_radii,
        colliders: capsules.chain(spheres).collect(),
        node_bases: node_bases(fe, node_count),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn object<const N: usize>(entries: [(&str, KvValue); N]) -> KvValue {
        KvValue::Object(
            entries
                .into_iter()
                .map(|(key, value)| (key.into(), value))
                .collect(),
        )
    }

    fn base(node: KvValue, adjustment: KvValue) -> KvValue {
        object([
            ("nNode", node),
            ("nNodeX0", KvValue::UInt(2)),
            ("nNodeX1", KvValue::UInt(1)),
            ("nNodeY0", KvValue::UInt(3)),
            ("nNodeY1", KvValue::UInt(1)),
            ("qAdjust", adjustment),
        ])
    }

    fn quaternion(values: [f64; 4]) -> KvValue {
        KvValue::Array(values.into_iter().map(KvValue::Float).collect())
    }

    #[test]
    fn reads_authored_node_bases_in_gltf_axes() {
        let half = std::f64::consts::FRAC_1_SQRT_2;
        let fe = object([(
            "m_NodeBases",
            KvValue::Array(vec![base(
                KvValue::Int(1),
                quaternion([0.0, 0.0, half, half]),
            )]),
        )]);
        let bases = node_bases(&fe, 4);
        assert_eq!(bases.len(), 1);
        let base = bases[0];
        assert_eq!(
            [base.node, base.x0, base.x1, base.y0, base.y1],
            [1, 2, 1, 3, 1]
        );
        let expected = [
            0.0,
            std::f32::consts::FRAC_1_SQRT_2,
            0.0,
            std::f32::consts::FRAC_1_SQRT_2,
        ];
        for (actual, expected) in base.q_adjust.into_iter().zip(expected) {
            assert!((actual - expected).abs() < 1e-6);
        }
    }

    #[test]
    fn ignores_invalid_indices_and_adjustments() {
        let identity = quaternion([0.0, 0.0, 0.0, 1.0]);
        let fe = object([(
            "m_NodeBases",
            KvValue::Array(vec![
                base(KvValue::Int(-1), identity.clone()),
                base(KvValue::UInt(4), identity.clone()),
                base(KvValue::UInt(65537), identity.clone()),
                base(KvValue::Float(1.5), identity.clone()),
                base(KvValue::UInt(1), quaternion([0.0; 4])),
                base(KvValue::UInt(1), quaternion([f64::NAN, 0.0, 0.0, 1.0])),
                base(KvValue::UInt(1), KvValue::Array(vec![])),
                base(KvValue::UInt(1), identity),
            ]),
        )]);
        assert_eq!(node_bases(&fe, 4).len(), 1);
        assert!(node_bases(&fe, 3).is_empty());
    }

    #[test]
    fn bases_are_optional_and_missing_adjustment_defaults_to_identity() {
        assert!(node_bases(&object([]), 4).is_empty());
        let mut base = base(KvValue::UInt(1), KvValue::Null);
        if let KvValue::Object(ref mut fields) = base {
            fields.remove("qAdjust");
        }
        let fe = object([("m_NodeBases", KvValue::Array(vec![base]))]);
        let adjustment = node_bases(&fe, 4)[0].q_adjust;
        for (actual, expected) in adjustment.into_iter().zip([0.0, 0.0, 0.0, 1.0]) {
            assert!((actual - expected).abs() < 1e-6);
        }
    }
}
