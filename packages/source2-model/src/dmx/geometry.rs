//! Edit source positions in place without reserializing skinning or other DMX attributes.
use super::binary::{invalid, position_spans};
use crate::Result;
use std::collections::BTreeSet;

pub struct SourceGeometry {
    pub meshes: Vec<SourceMesh>,
}
pub struct SourceMesh {
    /// Stable within this source file. Shared bind states are exposed only once.
    pub state: usize,
    pub positions: Vec<[f32; 3]>,
    pub matrix: [f32; 16],
    position_attribute: String,
}
pub struct VertexEdit {
    pub state: usize,
    pub vertex: usize,
    pub position: [f32; 3],
}

pub fn inspect(bytes: &[u8]) -> Result<SourceGeometry> {
    let (elements, spans) = if is_text(bytes) {
        let (elements, spans) = super::text::parse_with_spans(bytes)?;
        (
            elements,
            spans
                .into_iter()
                .map(|(state, name, ranges)| (state, name, 0..ranges.len() * 12))
                .collect(),
        )
    } else {
        position_spans(bytes)?
    };
    let mut seen = BTreeSet::new();
    let mut meshes = Vec::new();
    let identity = [
        1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1.,
    ];
    let start = elements[0]
        .reference("model")
        .or_else(|| elements[0].reference("skeleton"))
        .unwrap_or(0);
    let mut pending = vec![(start, identity, Vec::new())];
    let mut visited = 0;
    while let Some((index, parent, mut ancestors)) = pending.pop() {
        visited += 1;
        if visited > 100_000 || ancestors.len() >= 64 || ancestors.contains(&index) {
            return Err(invalid("cyclic or excessively nested scene"));
        }
        ancestors.push(index);
        let element = &elements[index];
        let matrix =
            crate::skeleton::mat4_mul(&parent, &super::mesh::transform(element, &elements)?);
        for child in element.references("children").iter().flatten().rev() {
            pending.push((*child, matrix, ancestors.clone()));
        }
        let mesh = &elements[element.reference("shape").unwrap_or(index)];
        if mesh.kind != "DmeMesh" {
            continue;
        }
        let state = mesh
            .reference("bindState")
            .or_else(|| mesh.reference("currentState"))
            .ok_or_else(|| invalid("mesh has no vertex state"))?;
        if !seen.insert(state) {
            if meshes
                .iter()
                .any(|mesh: &SourceMesh| mesh.state == state && mesh.matrix != matrix)
            {
                return Err(invalid(
                    "instanced vertex states with different transforms are not editable",
                ));
            }
            continue;
        }
        let (name, values) = ["position$0", "positions", "position"]
            .iter()
            .find_map(|name| elements[state].numbers(name).map(|values| (*name, values)))
            .ok_or_else(|| invalid("mesh has no positions"))?;
        if !spans
            .iter()
            .any(|(index, attribute, _)| *index == state && attribute == name)
            || !values.len().is_multiple_of(3)
            || values.iter().any(|v| !v.is_finite())
        {
            return Err(invalid("editable positions must be finite vector3 arrays"));
        }
        meshes.push(SourceMesh {
            state,
            matrix,
            position_attribute: name.to_owned(),
            positions: values.as_chunks::<3>().0.to_vec(),
        });
    }
    if meshes.is_empty() {
        return Err(invalid("source has no editable meshes"));
    }
    Ok(SourceGeometry { meshes })
}

/// Only the twelve position bytes of each requested vertex may change.
pub fn apply(bytes: &[u8], edits: &[VertexEdit]) -> Result<Vec<u8>> {
    let geometry = inspect(bytes)?;
    let text_spans = if is_text(bytes) {
        Some(super::text::parse_with_spans(bytes)?.1)
    } else {
        None
    };
    let spans = if text_spans.is_some() {
        Vec::new()
    } else {
        position_spans(bytes)?.1
    };
    let mut replacements = Vec::new();
    let mut output = bytes.to_vec();
    let mut seen = BTreeSet::new();
    for edit in edits {
        if !seen.insert((edit.state, edit.vertex)) || edit.position.iter().any(|v| !v.is_finite()) {
            return Err(invalid("duplicate or non-finite vertex edit"));
        }
        let mesh = geometry
            .meshes
            .iter()
            .find(|mesh| mesh.state == edit.state)
            .ok_or_else(|| invalid("vertex state is not editable"))?;
        if edit.vertex >= mesh.positions.len() {
            return Err(invalid("vertex index out of range"));
        }
        if let Some(spans) = &text_spans {
            let (_, _, ranges) = spans
                .iter()
                .find(|(state, name, _)| *state == edit.state && name == &mesh.position_attribute)
                .ok_or_else(|| invalid("position payload unavailable"))?;
            let range = ranges
                .get(edit.vertex)
                .ok_or_else(|| invalid("vertex index out of range"))?;
            replacements.push((
                range.clone(),
                format!(
                    "\"{} {} {}\"",
                    edit.position[0], edit.position[1], edit.position[2]
                ),
            ));
            continue;
        }
        let (_, _, span) = spans
            .iter()
            .find(|(state, name, _)| *state == edit.state && name == &mesh.position_attribute)
            .ok_or_else(|| invalid("position payload unavailable"))?;
        let start = span.start + edit.vertex * 12;
        for (axis, value) in edit.position.iter().enumerate() {
            output[start + axis * 4..start + (axis + 1) * 4].copy_from_slice(&value.to_le_bytes());
        }
    }
    replacements.sort_by_key(|(range, _)| std::cmp::Reverse(range.start));
    for (range, value) in replacements {
        output.splice(range, value.bytes());
    }
    Ok(output)
}

fn is_text(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(512)]
        .windows(10)
        .any(|value| value == b"keyvalues2")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_edits_reload_without_touching_other_bytes() {
        for bytes in [
            include_bytes!("../../tests/fixtures/source-quad-binary2.dmx").as_slice(),
            include_bytes!("../../tests/fixtures/source-quad-binary4.dmx").as_slice(),
            include_bytes!("../../tests/fixtures/source-quad-binary5.dmx").as_slice(),
            include_bytes!("../../tests/fixtures/source-quad-binary9.dmx").as_slice(),
        ] {
            let source = inspect(bytes).unwrap();
            let mesh = &source.meshes[0];
            let result = apply(
                bytes,
                &[VertexEdit {
                    state: mesh.state,
                    vertex: 1,
                    position: [12., 3., -2.],
                }],
            )
            .unwrap();
            let reloaded = inspect(&result).unwrap();
            assert_eq!(reloaded.meshes[0].positions[1], [12., 3., -2.]);
            assert_eq!(reloaded.meshes[0].positions[0], mesh.positions[0]);
            let (_, spans) = position_spans(bytes).unwrap();
            let (_, _, span) = spans
                .iter()
                .find(|(state, name, _)| *state == mesh.state && name == &mesh.position_attribute)
                .unwrap();
            let changed = span.start + 12..span.start + 24;
            for (offset, (before, after)) in bytes.iter().zip(&result).enumerate() {
                if !changed.contains(&offset) {
                    assert_eq!(before, after, "non-position byte changed at {offset}");
                }
            }
            let restored = apply(
                &result,
                &[VertexEdit {
                    state: mesh.state,
                    vertex: 1,
                    position: mesh.positions[1],
                }],
            )
            .unwrap();
            assert_eq!(restored, bytes);
            crate::dmx::decode_dmx_glb(&result).unwrap();
        }
    }
    #[test]
    fn text_source_edits_preserve_every_other_token() {
        let bytes = include_bytes!("../../tests/fixtures/source-quad-keyvalues2.dmx");
        let bytes = std::str::from_utf8(bytes).unwrap().replace("\"flipVCoordinates\"", "\"jointWeights\" \"float_array\" [\"0.25\", \"0.75\"]\n\"jointIndices\" \"int_array\" [\"0\", \"1\"]\n\"flipVCoordinates\"");
        let bytes = bytes.as_bytes();
        let source = inspect(bytes).unwrap();
        let result = apply(
            bytes,
            &[VertexEdit {
                state: source.meshes[0].state,
                vertex: 1,
                position: [12., 3., -2.],
            }],
        )
        .unwrap();
        let expected =
            std::str::from_utf8(bytes)
                .unwrap()
                .replacen("\"1.0 0.0 0.0\"", "\"12 3 -2\"", 1);
        assert_eq!(result, expected.as_bytes());
        assert_eq!(
            inspect(&result).unwrap().meshes[0].positions[1],
            [12., 3., -2.]
        );
        crate::dmx::decode_dmx_glb(&result).unwrap();
    }

    #[test]
    fn preview_exports_exact_source_vertex_bindings() {
        let bytes = include_bytes!("../../tests/fixtures/source-quad-binary9.dmx");
        let source = inspect(bytes).unwrap();
        let preview = crate::dmx::decode_dmx_glb(bytes).unwrap();
        let length = u32::from_le_bytes(preview.glb[12..16].try_into().unwrap()) as usize;
        let json: serde_json::Value =
            serde_json::from_slice(&preview.glb[20..20 + length]).unwrap();
        let primitive = &json["meshes"][0]["primitives"][0];
        assert_eq!(
            primitive["extras"]["sourceGeometryState"],
            source.meshes[0].state
        );
        let indices = primitive["extras"]["sourceGeometryVertices"]
            .as_array()
            .unwrap();
        assert_eq!(indices.len(), 4);
        assert!(indices.iter().all(|index| index.as_u64().unwrap() < 4));
    }

    #[test]
    fn invalid_edits_are_rejected() {
        let bytes = include_bytes!("../../tests/fixtures/source-quad-binary9.dmx");
        let source = inspect(bytes).unwrap();
        for vertex in [usize::MAX, 4] {
            assert!(
                apply(
                    bytes,
                    &[VertexEdit {
                        state: source.meshes[0].state,
                        vertex,
                        position: [0.; 3]
                    }]
                )
                .is_err()
            );
        }
        assert!(
            apply(
                bytes,
                &[VertexEdit {
                    state: source.meshes[0].state,
                    vertex: 0,
                    position: [f32::NAN; 3]
                }]
            )
            .is_err()
        );
    }
}

pub(super) fn attach_bindings(glb: &[u8], bindings: &[(usize, Vec<u32>)]) -> Result<Vec<u8>> {
    let json_length = u32::from_le_bytes(glb[12..16].try_into().unwrap()) as usize;
    let json_end = 20 + json_length;
    let mut document: serde_json::Value =
        serde_json::from_slice(&glb[20..json_end]).map_err(|_| invalid("invalid preview JSON"))?;
    if let Some(primitives) = document["meshes"][0]["primitives"].as_array_mut() {
        for (primitive, (state, vertices)) in primitives.iter_mut().zip(bindings) {
            primitive["extras"]["sourceGeometryState"] = serde_json::json!(state);
            primitive["extras"]["sourceGeometryVertices"] = serde_json::json!(vertices);
        }
    }
    let mut json =
        serde_json::to_vec(&document).map_err(|_| invalid("cannot encode geometry bindings"))?;
    while !json.len().is_multiple_of(4) {
        json.push(b' ');
    }
    let mut output = glb[..12].to_vec();
    output.extend_from_slice(&(json.len() as u32).to_le_bytes());
    output.extend_from_slice(&0x4E4F534Au32.to_le_bytes());
    output.extend_from_slice(&json);
    output.extend_from_slice(&glb[json_end..]);
    let length = output.len() as u32;
    output[8..12].copy_from_slice(&length.to_le_bytes());
    Ok(output)
}
