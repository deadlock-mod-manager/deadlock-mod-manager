use serde_json::Value;

use crate::skeleton::BoneTransform;
use crate::error::{Result, Source2Error};
use crate::skeleton::Skeleton;

use super::ModelGlb;

fn u32_at(bytes: &[u8], offset: usize) -> Result<u32> {
    let value = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| Source2Error::Decode("GLB header is truncated".into()))?;
    Ok(u32::from_le_bytes(value.try_into().unwrap()))
}

fn pad_four(bytes: &mut Vec<u8>, value: u8) {
    while !bytes.len().is_multiple_of(4) {
        bytes.push(value);
    }
}

/// Replace the GLB skeleton's local bind transforms with a sampled pose.
/// Geometry, materials and skin weights remain untouched, so the browser and
/// the native renderer evaluate exactly the same skinning inputs.
pub fn pose_model_glb(
    model: &ModelGlb,
    skeleton: &Skeleton,
    pose: &[BoneTransform],
) -> Result<ModelGlb> {
    if u32_at(&model.glb, 0)? != 0x4654_6c67 || u32_at(&model.glb, 4)? != 2 {
        return Err(Source2Error::Decode("invalid GLB header".into()));
    }
    let json_len = u32_at(&model.glb, 12)? as usize;
    if u32_at(&model.glb, 16)? != 0x4e4f_534a {
        return Err(Source2Error::Decode("GLB has no JSON chunk".into()));
    }
    let json_end = 20usize
        .checked_add(json_len)
        .filter(|end| *end <= model.glb.len())
        .ok_or_else(|| Source2Error::Decode("GLB JSON chunk is truncated".into()))?;
    let bin_len = u32_at(&model.glb, json_end)? as usize;
    if u32_at(&model.glb, json_end + 4)? != 0x004e_4942 {
        return Err(Source2Error::Decode("GLB has no BIN chunk".into()));
    }
    let bin_start = json_end + 8;
    let bin = model
        .glb
        .get(bin_start..bin_start + bin_len)
        .ok_or_else(|| Source2Error::Decode("GLB BIN chunk is truncated".into()))?;

    let mut document: Value = serde_json::from_slice(&model.glb[20..json_end])
        .map_err(|error| Source2Error::Decode(format!("invalid GLB JSON: {error}")))?;
    let nodes = document
        .get_mut("nodes")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| Source2Error::Decode("GLB has no nodes".into()))?;
    for (bone, transform) in skeleton.bones.iter().zip(pose) {
        let Some(node) = nodes
            .iter_mut()
            .find(|node| node.get("name").and_then(Value::as_str) == Some(bone.name.as_str()))
        else {
            continue;
        };
        node["translation"] = serde_json::json!(transform.translation);
        node["rotation"] = serde_json::json!(transform.rotation);
        node["scale"] = serde_json::json!(transform.scale);
    }

    let mut json = serde_json::to_vec(&document)
        .map_err(|error| Source2Error::Decode(format!("GLB JSON encode failed: {error}")))?;
    pad_four(&mut json, b' ');
    let total_len = 12 + 8 + json.len() + 8 + bin.len();
    let mut glb = Vec::with_capacity(total_len);
    glb.extend_from_slice(&0x4654_6c67u32.to_le_bytes());
    glb.extend_from_slice(&2u32.to_le_bytes());
    glb.extend_from_slice(&(total_len as u32).to_le_bytes());
    glb.extend_from_slice(&(json.len() as u32).to_le_bytes());
    glb.extend_from_slice(&0x4e4f_534au32.to_le_bytes());
    glb.extend_from_slice(&json);
    glb.extend_from_slice(&(bin.len() as u32).to_le_bytes());
    glb.extend_from_slice(&0x004e_4942u32.to_le_bytes());
    glb.extend_from_slice(bin);
    Ok(ModelGlb {
        vertex_count: model.vertex_count,
        index_count: model.index_count,
        glb,
    })
}
