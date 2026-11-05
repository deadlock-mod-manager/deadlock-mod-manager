use std::collections::HashMap;

use super::binary::{Element, Value, invalid};
use crate::{
    Result,
    skeleton::{mat4_from_trs, mat4_mul},
    vmesh::{DecodedPrimitive, write_index_bytes},
};

const IDENTITY: [f32; 16] = [
    1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1.,
];

pub(super) fn transform(element: &Element, elements: &[Element]) -> Result<[f32; 16]> {
    let Some(index) = element.reference("transform") else {
        return Ok(IDENTITY);
    };
    let value = &elements[index];
    let position = value.numbers("position").unwrap_or(&[0., 0., 0.]);
    let orientation = value.numbers("orientation").unwrap_or(&[0., 0., 0., 1.]);
    let position: [f32; 3] = position
        .try_into()
        .map_err(|_| invalid("invalid transform position"))?;
    let mut rotation: [f32; 4] = orientation
        .try_into()
        .map_err(|_| invalid("invalid transform orientation"))?;
    let length = rotation.iter().map(|v| v * v).sum::<f32>().sqrt();
    if !length.is_finite() || length <= f32::EPSILON {
        return Err(invalid("invalid transform quaternion"));
    }
    rotation.iter_mut().for_each(|v| *v /= length);
    Ok(mat4_from_trs(position, rotation, [1., 1., 1.]))
}

fn convert(value: &[f32], matrix: &[f32; 16], point: bool) -> [f32; 3] {
    let translation = if point { 1. } else { 0. };
    let xyz: [f32; 3] = std::array::from_fn(|row| {
        matrix[row] * value[0]
            + matrix[4 + row] * value[1]
            + matrix[8 + row] * value[2]
            + matrix[12 + row] * translation
    });
    [xyz[0], xyz[2], -xyz[1]]
}

fn channel<'a>(state: &'a Element, names: &[&str]) -> Option<(&'a str, &'a [f32])> {
    names.iter().find_map(|name| {
        state
            .attributes
            .get_key_value(*name)
            .and_then(|(name, value)| match value {
                Value::Numbers(values) => Some((name.as_str(), values.as_slice())),
                _ => None,
            })
    })
}

fn expand(
    state: &Element,
    name: &str,
    values: &[f32],
    width: usize,
    corners: usize,
) -> Result<Vec<f32>> {
    if !values.len().is_multiple_of(width) {
        return Err(invalid("invalid vertex channel width"));
    }
    let indices = state.integers(&format!("{name}Indices"));
    if indices.is_some_and(|values| values.len() != corners) {
        return Err(invalid("vertex index channel length mismatch"));
    }
    let mut result = Vec::with_capacity(corners * width);
    for corner in 0..corners {
        let index = match indices {
            Some(values) => {
                usize::try_from(values[corner]).map_err(|_| invalid("negative vertex index"))?
            }
            None => corner,
        };
        let value = values
            .get(
                index
                    .checked_mul(width)
                    .ok_or_else(|| invalid("vertex index overflow"))?..,
            )
            .and_then(|values| values.get(..width))
            .ok_or_else(|| invalid("vertex channel index out of range"))?;
        result.extend_from_slice(value);
    }
    Ok(result)
}

fn mesh(
    element: &Element,
    elements: &[Element],
    matrix: &[f32; 16],
    materials: &mut Vec<String>,
) -> Result<Vec<DecodedPrimitive>> {
    if matches!(
        element.attributes.get("visible"),
        Some(Value::Boolean(false))
    ) {
        return Ok(Vec::new());
    }
    let state = element
        .reference("bindState")
        .or_else(|| element.reference("currentState"))
        .ok_or_else(|| invalid("mesh has no vertex state"))?;
    let state = &elements[state];
    let (name, values) = channel(state, &["position$0", "positions", "position"])
        .ok_or_else(|| invalid("mesh has no positions"))?;
    let corners = state
        .integers(&format!("{name}Indices"))
        .map_or(values.len() / 3, |v| v.len());
    if corners == 0 || corners > 4_000_000 {
        return Err(invalid("invalid vertex count"));
    }
    let mut positions = expand(state, name, values, 3, corners)?;
    for value in positions.as_chunks_mut::<3>().0 {
        *value = convert(value, matrix, true);
    }
    if positions.iter().any(|value| !value.is_finite()) {
        return Err(invalid("transformed positions are not finite"));
    }
    let normals = channel(state, &["normal$0", "normals", "normal"])
        .map(|(name, values)| -> Result<Vec<f32>> {
            let mut values = expand(state, name, values, 3, corners)?;
            for value in values.as_chunks_mut::<3>().0 {
                let mut normal = convert(value, matrix, false);
                let length = normal.iter().map(|v| v * v).sum::<f32>().sqrt();
                if length > f32::EPSILON {
                    normal.iter_mut().for_each(|v| *v /= length);
                }
                value.copy_from_slice(&normal);
            }
            Ok(values)
        })
        .transpose()?;
    let texcoords = channel(state, &["texcoord$0", "textureCoordinates", "texcoord"])
        .map(|(name, values)| -> Result<Vec<f32>> {
            let mut values = expand(state, name, values, 2, corners)?;
            if matches!(
                state.attributes.get("flipVCoordinates"),
                Some(Value::Boolean(true))
            ) {
                for value in values.as_chunks_mut::<2>().0 {
                    value[1] = 1. - value[1];
                }
            }
            Ok(values)
        })
        .transpose()?;
    let mut primitives = Vec::new();
    let mut vertex_count = 0;
    let mut index_count = 0;
    for face_set in element.references("faceSets").iter().flatten() {
        let faces = elements[*face_set]
            .integers("faces")
            .ok_or_else(|| invalid("face set has no indices"))?;
        let mut polygon = Vec::new();
        let mut triangles = Vec::new();
        for &index in faces {
            if index == -1 {
                triangulate(&polygon, &positions, &mut triangles)?;
                polygon.clear();
            } else {
                let index = usize::try_from(index).map_err(|_| invalid("invalid face index"))?;
                if index >= corners {
                    return Err(invalid("face index out of range"));
                }
                if polygon.len() >= 1024 {
                    return Err(invalid("polygon exceeds 1024 corners"));
                }
                polygon.push(index as u32);
            }
        }
        if !polygon.is_empty() {
            return Err(invalid("unterminated face"));
        }
        if triangles.is_empty() {
            continue;
        }
        let material = elements[*face_set]
            .reference("material")
            .and_then(|index| elements[index].string("mtlName"))
            .map_or(0, |path| {
                let path = path.replace('\\', "/").to_ascii_lowercase();
                let index = materials
                    .iter()
                    .position(|item| item == &path)
                    .unwrap_or_else(|| {
                        materials.push(path);
                        materials.len() - 1
                    });
                index + 1
            });
        let mut remap = HashMap::new();
        let mut primitive = DecodedPrimitive {
            source_vertices: Vec::new(),
            positions: Vec::new(),
            normals: normals.as_ref().map(|_| Vec::new()),
            texcoords: texcoords.as_ref().map(|_| Vec::new()),
            colors: None,
            joints: None,
            weights: None,
            indices: Vec::new(),
            index_component: 0,
            index_count: triangles.len(),
            material,
            mesh_group_mask: u64::MAX,
        };
        let mut indices = Vec::with_capacity(triangles.len());
        for index in triangles {
            let next = remap.len() as u32;
            let vertex = *remap.entry(index).or_insert_with(|| {
                let index = index as usize;
                let source = state
                    .integers(&format!("{name}Indices"))
                    .map_or(index as u32, |indices| indices[index] as u32);
                primitive.source_vertices.push(source);
                primitive
                    .positions
                    .extend_from_slice(&positions[index * 3..index * 3 + 3]);
                if let (Some(source), Some(target)) = (&normals, &mut primitive.normals) {
                    target.extend_from_slice(&source[index * 3..index * 3 + 3]);
                }
                if let (Some(source), Some(target)) = (&texcoords, &mut primitive.texcoords) {
                    target.extend_from_slice(&source[index * 2..index * 2 + 2]);
                }
                next
            });
            indices.push(vertex);
        }
        (primitive.indices, primitive.index_component) = write_index_bytes(&indices, remap.len());
        vertex_count += remap.len();
        index_count += indices.len();
        if vertex_count > 4_000_000 || index_count > 12_000_000 {
            return Err(invalid("source geometry exceeds preview limits"));
        }
        primitives.push(primitive);
    }
    Ok(primitives)
}

#[cfg(test)]
pub(super) fn decode(elements: &[Element]) -> Result<Vec<DecodedPrimitive>> {
    decode_with_materials(elements).map(|(primitives, _)| primitives)
}

#[cfg(test)]
pub(super) fn decode_with_materials(
    elements: &[Element],
) -> Result<(Vec<DecodedPrimitive>, Vec<String>)> {
    decode_with_bindings(elements).map(|(primitives, materials, _)| (primitives, materials))
}

pub(super) fn decode_with_bindings(
    elements: &[Element],
) -> Result<(Vec<DecodedPrimitive>, Vec<String>, Vec<(usize, Vec<u32>)>)> {
    let root = &elements[0];
    let start = root
        .reference("model")
        .or_else(|| root.reference("skeleton"))
        .unwrap_or(0);
    let mut pending = vec![(start, IDENTITY, Vec::new(), None)];
    let mut primitives = Vec::new();
    let mut bindings = Vec::new();
    let mut bones = Vec::new();
    let mut materials = Vec::new();
    let mut vertices = 0;
    let mut indices = 0;
    let mut visited = 0;
    while let Some((index, parent, mut ancestors, parent_joint)) = pending.pop() {
        visited += 1;
        if visited > 100_000 {
            return Err(invalid("scene traversal exceeds preview limits"));
        }
        if ancestors.len() >= 64 || ancestors.contains(&index) {
            return Err(invalid("cyclic or excessively nested scene"));
        }
        ancestors.push(index);
        let element = &elements[index];
        if let Some(axis) = element.reference("axisSystem") {
            let axis = &elements[axis];
            for (name, expected) in [("upAxis", 3), ("forwardParity", 1), ("coordSys", 0)] {
                if matches!(axis.attributes.get(name),Some(Value::Integer(value)) if *value != expected)
                {
                    return Err(invalid(
                        "source preview currently requires the Source Z-up axis system",
                    ));
                }
            }
        }
        let matrix = mat4_mul(&parent, &transform(element, elements)?);
        let joint = if element.kind == "DmeJoint" {
            let position = convert(&[0.; 3], &matrix, true);
            if position.iter().any(|v| !v.is_finite()) {
                return Err(invalid("joint position is not finite"));
            }
            if let Some(parent) = parent_joint {
                bones.push((parent, position));
            }
            Some(position)
        } else {
            parent_joint
        };
        let shape = element.reference("shape").unwrap_or(index);
        if elements[shape].kind == "DmeMesh" {
            let decoded = mesh(&elements[shape], elements, &matrix, &mut materials)?;
            vertices += decoded.iter().map(|v| v.positions.len() / 3).sum::<usize>();
            indices += decoded.iter().map(|v| v.index_count).sum::<usize>();
            if vertices > 4_000_000 || indices > 12_000_000 {
                return Err(invalid("source geometry exceeds preview limits"));
            }
            let state = elements[shape]
                .reference("bindState")
                .or_else(|| elements[shape].reference("currentState"))
                .ok_or_else(|| invalid("mesh has no vertex state"))?;
            bindings.extend(
                decoded
                    .iter()
                    .map(|primitive| (state, primitive.source_vertices.clone())),
            );
            primitives.extend(decoded);
        }
        for child in element.references("children").iter().flatten().rev() {
            pending.push((*child, matrix, ancestors.clone(), joint));
        }
    }
    if primitives.is_empty() {
        if elements.iter().any(|element| element.kind == "DmeMesh") {
            return Err(invalid("no drawable mesh geometry"));
        }
        primitives.push(skeleton_preview(&bones)?);
    }
    Ok((primitives, materials, bindings))
}

fn skeleton_preview(bones: &[([f32; 3], [f32; 3])]) -> Result<DecodedPrimitive> {
    let mut positions = Vec::new();
    let mut indices = Vec::new();
    let mut min = [f32::INFINITY; 3];
    let mut max = [f32::NEG_INFINITY; 3];
    for &(start, end) in bones {
        for point in [start, end] {
            for axis in 0..3 {
                min[axis] = min[axis].min(point[axis]);
                max[axis] = max[axis].max(point[axis]);
            }
        }
    }
    let radius_limit = (0..3)
        .map(|axis| (max[axis] - min[axis]).powi(2))
        .sum::<f32>()
        .sqrt()
        * 0.001;
    for &(start, end) in bones {
        let delta: [f32; 3] = std::array::from_fn(|i| end[i] - start[i]);
        let length = delta.iter().map(|v| v * v).sum::<f32>().sqrt();
        if !length.is_finite() {
            return Err(invalid("invalid skeleton bone length"));
        }
        if length <= f32::EPSILON {
            continue;
        }
        let direction = delta.map(|v| v / length);
        let axis = if direction[1].abs() < 0.9 {
            [0., 1., 0.]
        } else {
            [1., 0., 0.]
        };
        let cross = |a: [f32; 3], b: [f32; 3]| {
            [
                a[1] * b[2] - a[2] * b[1],
                a[2] * b[0] - a[0] * b[2],
                a[0] * b[1] - a[1] * b[0],
            ]
        };
        let side = cross(direction, axis);
        let side_length = side.iter().map(|v| v * v).sum::<f32>().sqrt();
        let side = side.map(|v| v / side_length);
        let up = cross(direction, side);
        let radius = (length * 0.04).min(radius_limit);
        let base = (positions.len() / 3) as u32;
        positions.extend_from_slice(&start);
        positions.extend_from_slice(&end);
        for (basis, sign) in [(side, 1.), (up, 1.), (side, -1.), (up, -1.)] {
            let ring: [f32; 3] =
                std::array::from_fn(|i| start[i] + delta[i] * 0.2 + basis[i] * radius * sign);
            positions.extend_from_slice(&ring);
        }
        for i in 0..4 {
            let a = base + 2 + i;
            let b = base + 2 + (i + 1) % 4;
            indices.extend_from_slice(&[base, b, a, base + 1, a, b]);
        }
    }
    if indices.is_empty() {
        return Err(invalid("file contains no drawable mesh or skeleton bones"));
    }
    let index_count = indices.len();
    let (indices, index_component) = write_index_bytes(&indices, positions.len() / 3);
    Ok(DecodedPrimitive {
        source_vertices: Vec::new(),
        positions,
        normals: None,
        texcoords: None,
        colors: None,
        joints: None,
        weights: None,
        indices,
        index_component,
        index_count,
        material: 0,
        mesh_group_mask: 0,
    })
}

fn cross(a: [f32; 2], b: [f32; 2], c: [f32; 2]) -> f32 {
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

fn triangulate(polygon: &[u32], positions: &[f32], output: &mut Vec<u32>) -> Result<()> {
    if polygon.len() < 3 {
        return Ok(());
    }
    if polygon.len() == 3 {
        output.extend_from_slice(polygon);
        return Ok(());
    }
    let point = |index: u32| {
        let i = index as usize * 3;
        [positions[i], positions[i + 1], positions[i + 2]]
    };
    let mut normal = [0f32; 3];
    for i in 0..polygon.len() {
        let a = point(polygon[i]);
        let b = point(polygon[(i + 1) % polygon.len()]);
        for axis in 0..3 {
            normal[axis] +=
                (a[(axis + 1) % 3] - b[(axis + 1) % 3]) * (a[(axis + 2) % 3] + b[(axis + 2) % 3]);
        }
    }
    let drop_axis = (0..3)
        .max_by(|a, b| normal[*a].abs().total_cmp(&normal[*b].abs()))
        .unwrap();
    let projected = |index: u32| {
        let p = point(index);
        [p[(drop_axis + 1) % 3], p[(drop_axis + 2) % 3]]
    };
    let area = polygon
        .iter()
        .enumerate()
        .map(|(i, index)| {
            let a = projected(*index);
            let b = projected(polygon[(i + 1) % polygon.len()]);
            a[0] * b[1] - b[0] * a[1]
        })
        .sum::<f32>();
    if area.abs() <= f32::EPSILON {
        return Ok(());
    }
    let sign = area.signum();
    let mut remaining = polygon.to_vec();
    while remaining.len() > 3 {
        let ear = (0..remaining.len())
            .find(|&i| {
                let a = projected(remaining[(i + remaining.len() - 1) % remaining.len()]);
                let b = projected(remaining[i]);
                let c = projected(remaining[(i + 1) % remaining.len()]);
                if cross(a, b, c) * sign <= 0. {
                    return false;
                }
                !remaining.iter().enumerate().any(|(j, index)| {
                    if j == i
                        || j == (i + 1) % remaining.len()
                        || j == (i + remaining.len() - 1) % remaining.len()
                    {
                        return false;
                    }
                    let p = projected(*index);
                    cross(a, b, p) * sign >= 0.
                        && cross(b, c, p) * sign >= 0.
                        && cross(c, a, p) * sign >= 0.
                })
            })
            .ok_or_else(|| invalid("polygon cannot be triangulated"))?;
        output.extend_from_slice(&[
            remaining[(ear + remaining.len() - 1) % remaining.len()],
            remaining[ear],
            remaining[(ear + 1) % remaining.len()],
        ]);
        remaining.remove(ear);
    }
    output.extend(remaining);
    Ok(())
}
