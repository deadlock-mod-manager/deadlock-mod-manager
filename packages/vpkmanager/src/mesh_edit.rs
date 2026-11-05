//! Removing parts of a compiled model (`.vmdl_c` / `.vmesh_c`) from the game.
//!
//! A part is removed by zeroing the `m_nIndexCount` of every draw call that uses
//! one of its materials: a draw call with no indices submits no primitives, so
//! the part stops rendering while the vertex and index buffers stay untouched.
//! Matching on material rather than mesh name reaches every LOD, because the
//! lower-detail meshes draw the same materials as LOD0.
//!
//! As in [`crate::particle_edit`], the tree is only used to locate the counts;
//! they are patched in place on a byte-faithful re-wrap of each mesh block,
//! because a re-encoded block loses value flags the engine's loader needs.

use std::collections::HashSet;

use crate::error::{Result, VpkManagerError};
use crate::source2::kv3::{self, Seg, Value};
use crate::source2::resource::Resource;

/// Draw-call material paths are written with and without the compiled `_c`
/// suffix and in either slash direction, so both sides compare on this form.
fn material_key(path: &str) -> String {
    let lower = path.replace('\\', "/").to_ascii_lowercase();
    lower.strip_suffix("_c").map(str::to_owned).unwrap_or(lower)
}

/// The `m_nIndexCount` path of every draw call in `mesh` drawn with a material
/// in `hidden`.
fn hidden_index_counts(mesh: &Value, hidden: &HashSet<String>) -> Vec<Vec<Seg>> {
    let Some(scene_objects) = mesh.get("m_sceneObjects").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut paths = Vec::new();
    for (scene_index, scene_object) in scene_objects.iter().enumerate() {
        let Some(draw_calls) = scene_object.get("m_drawCalls").and_then(Value::as_array) else {
            continue;
        };
        for (draw_index, draw_call) in draw_calls.iter().enumerate() {
            let material = draw_call
                .get("m_material")
                .or_else(|| draw_call.get("m_pMaterial"))
                .and_then(Value::as_str);
            if material.is_some_and(|material| hidden.contains(&material_key(material))) {
                paths.push(vec![
                    Seg::Key("m_sceneObjects".into()),
                    Seg::Index(scene_index),
                    Seg::Key("m_drawCalls".into()),
                    Seg::Index(draw_index),
                    Seg::Key("m_nIndexCount".into()),
                ]);
            }
        }
    }
    paths
}

/// Stop every draw call using one of `materials` from rendering.
///
/// Mesh data lives in the `MDAT` blocks of a model with embedded meshes and in
/// the `DATA` block of a standalone `.vmesh_c`; both are searched. Returns
/// `Ok(None)` when no draw call uses those materials, so the caller can tell a
/// resource that does not draw the part from a failed edit.
pub fn hide_draw_calls(resource_bytes: &[u8], materials: &[String]) -> Result<Option<Vec<u8>>> {
    let hidden = materials
        .iter()
        .map(|material| material_key(material))
        .collect::<HashSet<_>>();
    let resource = Resource::parse(resource_bytes)?;
    let mut patched_blocks = Vec::new();
    for (index, block) in resource.blocks().iter().enumerate() {
        if block.kind != *b"MDAT" && block.kind != *b"DATA" {
            continue;
        }
        let data = resource
            .get_block_by_index(index)
            .ok_or_else(|| VpkManagerError::Invalid(format!("mesh block {index} is truncated")))?;
        let edits = hidden_index_counts(&kv3::decode(data)?, &hidden)
            .into_iter()
            .map(|path| (path, 0))
            .collect::<Vec<_>>();
        if edits.is_empty() {
            continue;
        }
        let patched = kv3::set_scalars(data, &edits).map_err(|error| {
            VpkManagerError::Invalid(format!("draw call patch failed: {error}"))
        })?;
        patched_blocks.push((index, patched));
    }
    if patched_blocks.is_empty() {
        return Ok(None);
    }
    // Rebuilding keeps block order and count, so the indices found above still
    // address the same blocks after each swap.
    let mut output = resource_bytes.to_vec();
    for (index, patched) in patched_blocks {
        output = Resource::parse(&output)?.rebuild_with_block(index, &patched)?;
    }
    Ok(Some(output))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn object(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (key.to_owned(), value))
                .collect(),
        )
    }

    fn resource(blocks: Vec<([u8; 4], Vec<u8>)>) -> Vec<u8> {
        let mut bytes = vec![0; 16 + blocks.len() * 12];
        bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
        bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
        bytes[12..16].copy_from_slice(&u32::try_from(blocks.len()).unwrap().to_le_bytes());
        for (index, (kind, data)) in blocks.into_iter().enumerate() {
            let table = 16 + index * 12;
            bytes[table..table + 4].copy_from_slice(&kind);
            let relative = u32::try_from(bytes.len() - (table + 4)).unwrap();
            bytes[table + 4..table + 8].copy_from_slice(&relative.to_le_bytes());
            bytes[table + 8..table + 12]
                .copy_from_slice(&u32::try_from(data.len()).unwrap().to_le_bytes());
            bytes.extend(data);
        }
        let length = u32::try_from(bytes.len()).unwrap();
        bytes[..4].copy_from_slice(&length.to_le_bytes());
        bytes
    }

    fn mesh(materials: &[&str]) -> Vec<u8> {
        let draw_calls = materials
            .iter()
            .map(|material| {
                object(vec![
                    ("m_material", Value::String((*material).into())),
                    ("m_nStartIndex", Value::Int(0)),
                    ("m_nIndexCount", Value::Int(300)),
                ])
            })
            .collect();
        let value = object(vec![(
            "m_sceneObjects",
            Value::Array(vec![object(vec![(
                "m_drawCalls",
                Value::Array(draw_calls),
            )])]),
        )]);
        kv3::encode(&value, &kv3::Format([43; 16]))
    }

    fn index_counts(bytes: &[u8], block: usize) -> Vec<i64> {
        let resource = Resource::parse(bytes).unwrap();
        let value = kv3::decode(resource.get_block_by_index(block).unwrap()).unwrap();
        value.get("m_sceneObjects").unwrap().as_array().unwrap()[0]
            .get("m_drawCalls")
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .map(|draw| draw.get("m_nIndexCount").unwrap().as_int().unwrap())
            .collect()
    }

    #[test]
    fn hides_the_part_in_every_lod_and_nothing_else() {
        let model = resource(vec![
            (
                *b"MDAT",
                mesh(&["materials/body.vmat", "materials/hat.vmat"]),
            ),
            (*b"MVTX", vec![1, 2, 3]),
            (
                *b"MDAT",
                mesh(&["materials/hat.vmat", "materials/body.vmat"]),
            ),
        ]);
        let output = hide_draw_calls(&model, &["Materials\\Hat.vmat_c".into()])
            .unwrap()
            .unwrap();
        assert_eq!(index_counts(&output, 0), vec![300, 0]);
        assert_eq!(index_counts(&output, 2), vec![0, 300]);
        let output = Resource::parse(&output).unwrap();
        assert_eq!(output.get_block_by_index(1), Some(&[1, 2, 3][..]));
    }

    #[test]
    fn a_resource_without_the_part_is_left_alone() {
        let model = resource(vec![(*b"DATA", mesh(&["materials/body.vmat"]))]);
        assert!(
            hide_draw_calls(&model, &["materials/hat.vmat".into()])
                .unwrap()
                .is_none()
        );
    }
}
