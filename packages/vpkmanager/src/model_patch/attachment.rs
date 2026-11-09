use super::*;

pub(super) struct Source {
    pub mesh: Value,
    pub mesh_shape: Encoding,
    pub block: usize,
    pub scene: usize,
    pub draw: usize,
    pub bone: Option<usize>,
    pub lods: u64,
    pub groups: u64,
}

fn uint(value: &Value) -> Result<u64> {
    match value {
        Value::Int(v) => u64::try_from(*v).map_err(|_| invalid("Negative attachment metadata")),
        Value::UInt(v) => Ok(*v),
        _ => Err(invalid("Invalid attachment metadata integer")),
    }
}
fn index(value: &Value, key: &str) -> Result<usize> {
    usize::try_from(uint(
        value
            .get(key)
            .ok_or_else(|| invalid(format!("Missing {key}")))?,
    )?)
    .map_err(|_| invalid("Attachment index exceeds platform limits"))
}
fn mask(data: &Value, key: &str, i: usize) -> Result<u64> {
    uint(
        array(data, key)?
            .get(i)
            .ok_or_else(|| invalid(format!("Missing {key} entry")))?,
    )
}
pub(super) fn clear(value: &mut Value, shape: &mut Encoding, key: &str) -> Result<()> {
    set(value, key, Value::Array(Vec::new()))?;
    shape
        .get_mut(key)
        .ok_or_else(|| invalid("Missing array encoding"))?
        .children = EncodingChildren::Array(Vec::new());
    Ok(())
}

pub(super) fn source(
    resource: &Resource<'_>,
    ctrl: &Value,
    shape: &Encoding,
    model: &Value,
    patch: &AttachedPatch<'_>,
) -> Result<Source> {
    let mut selected = None;
    let mut lods = 0;
    let mut groups = 0;
    for (i, mesh) in array(ctrl, "embedded_meshes")?.iter().enumerate() {
        let block = index(mesh, "m_nDataBlock")
            .map_err(|_| invalid("Attached stickers require modern embedded MVTX meshes"))?;
        let data = kv3::decode(
            resource
                .get_block_by_index(block)
                .ok_or_else(|| invalid("Missing host mesh"))?,
        )?;
        let mesh_index = index(mesh, "m_nMeshIndex")?;
        let mut host = None;
        for (scene, object) in array(&data, "m_sceneObjects")?.iter().enumerate() {
            for (draw, call) in array(object, "m_drawCalls")?.iter().enumerate() {
                if call
                    .get("m_material")
                    .and_then(Value::as_str)
                    .is_some_and(|m| {
                        m.trim_end_matches("_c")
                            .eq_ignore_ascii_case(patch.host_material.trim_end_matches("_c"))
                    })
                {
                    host = Some((scene, draw));
                    break;
                }
            }
            if host.is_some() {
                break;
            }
        }
        let Some((scene, draw)) = host else {
            continue;
        };
        lods |= mask(model, "m_refLODGroupMasks", mesh_index)?;
        let bones = data
            .get("m_skeleton")
            .map(|v| array(v, "m_bones"))
            .transpose()?
            .unwrap_or(&[]);
        let bone = if bones.is_empty() && patch.bone.is_empty() {
            None
        } else {
            let names = array(
                model
                    .get("m_modelSkeleton")
                    .ok_or_else(|| invalid("Missing model skeleton"))?,
                "m_boneName",
            )?;
            let global = names
                .iter()
                .position(|name| name.as_str() == Some(patch.bone));
            let remap = palette(model, mesh_index)?;
            let Some(bone) = global
                .and_then(|global| {
                    remap
                        .iter()
                        .position(|entry| uint(entry).ok() == Some(global as u64))
                })
                .filter(|bone| *bone < bones.len())
            else {
                continue;
            };
            Some(bone)
        };
        groups |= mask(model, "m_refMeshGroupMasks", mesh_index)?;
        if selected.is_none() {
            selected = Some(Source {
                mesh: mesh.clone(),
                mesh_shape: shape
                    .get("embedded_meshes")
                    .and_then(Encoding::as_array)
                    .and_then(|s| s.get(i))
                    .ok_or_else(|| invalid("Missing mesh encoding"))?
                    .clone(),
                block,
                scene,
                draw,
                bone,
                lods: 0,
                groups: 0,
            });
        }
    }
    let mut source = selected.ok_or_else(|| {
        invalid(format!(
            "No mesh draws {} with attachment bone {}",
            patch.host_material, patch.bone
        ))
    })?;
    source.lods = lods;
    source.groups = groups;
    Ok(source)
}

fn append(data: &mut Value, shape: &mut Encoding, key: &str, value: Value) -> Result<usize> {
    let entry = shape
        .get(key)
        .and_then(Encoding::as_array)
        .and_then(|a| a.first())
        .cloned()
        .ok_or_else(|| invalid(format!("Missing {key} encoding template")))?;
    push(data, shape, key, value, entry)
}

pub(super) fn palette(model: &Value, mesh_index: usize) -> Result<&[Value]> {
    let starts = array(model, "m_remappingTableStarts")?;
    let table = array(model, "m_remappingTable")?;
    let start = starts
        .get(mesh_index)
        .map(uint)
        .transpose()?
        .ok_or_else(|| invalid("Missing source remap start"))? as usize;
    let end = starts
        .get(mesh_index + 1)
        .map(uint)
        .transpose()?
        .map(|end| end as usize)
        .unwrap_or(table.len());
    table
        .get(start..end)
        .ok_or_else(|| invalid("Invalid source bone remap"))
}

pub(super) fn register(
    model: &mut Value,
    shape: &mut Encoding,
    source: &Value,
    patch: &AttachedPatch<'_>,
    lods: u64,
    groups: u64,
) -> Result<usize> {
    let mesh_index = index(source, "m_nMeshIndex")?;
    let starts = array(model, "m_remappingTableStarts")?;
    let table = array(model, "m_remappingTable")?;
    let start = usize::try_from(uint(
        starts
            .get(mesh_index)
            .ok_or_else(|| invalid("Missing source remap start"))?,
    )?)
    .map_err(|_| invalid("Invalid remap offset"))?;
    let end = starts
        .get(mesh_index + 1)
        .map(uint)
        .transpose()?
        .map(usize::try_from)
        .transpose()
        .map_err(|_| invalid("Invalid remap end"))?
        .unwrap_or(table.len());
    let remap = table
        .get(start..end)
        .ok_or_else(|| invalid("Invalid source bone remap"))?
        .to_vec();
    let offset = table.len();
    let next = starts.len();
    if array(model, "m_refLODGroupMasks")?.len() != next
        || array(model, "m_refMeshGroupMasks")?.len() != next
    {
        return Err(invalid("Model mesh registry lengths disagree"));
    }
    for entry in remap {
        append(model, shape, "m_remappingTable", entry)?;
    }
    append(model, shape, "m_remappingTableStarts", number(offset))?;
    append(model, shape, "m_refLODGroupMasks", Value::UInt(lods))?;
    append(model, shape, "m_refMeshGroupMasks", Value::UInt(groups))?;
    if !patch.bone.is_empty() {
        if lods > 255 {
            return Err(invalid("Unsupported model LOD count for attachment bones"));
        }
        let skeleton = model
            .get_mut("m_modelSkeleton")
            .ok_or_else(|| invalid("Missing model skeleton"))?;
        let names = array(skeleton, "m_boneName")?;
        let anchor = names
            .iter()
            .position(|b| b.as_str() == Some(patch.bone))
            .ok_or_else(|| invalid("Attachment bone is absent from the model skeleton"))?;
        let count = names.len();
        let mut active = std::collections::BTreeSet::from([anchor]);
        for vertex in patch.skin.into_iter().flatten() {
            for (bone, weight) in vertex.bones.iter().zip(vertex.weights) {
                if weight > 0. {
                    active.insert(usize::from(*bone));
                }
            }
        }
        for mut bone in active {
            let mut rooted = false;
            for _ in 0..count {
                let flag = uint(
                    array(skeleton, "m_nFlag")?
                        .get(bone)
                        .ok_or_else(|| invalid("Missing bone flags"))?,
                )?;
                let parent = array(skeleton, "m_nParent")?
                    .get(bone)
                    .cloned()
                    .ok_or_else(|| invalid("Missing bone parent"))?;
                let Some(Value::Array(flags)) = skeleton.get_mut("m_nFlag") else {
                    unreachable!()
                };
                // Keep the requested bone and its ancestors evaluated where the new mesh draws.
                flags[bone] = Value::UInt(flag | 0x80 | (lods << 10));
                if parent == Value::Int(-1) {
                    rooted = true;
                    break;
                }
                bone =
                    usize::try_from(uint(&parent)?).map_err(|_| invalid("Invalid parent index"))?;
            }
            if !rooted {
                return Err(invalid("Attachment bone hierarchy contains a cycle"));
            }
        }
    }
    Ok(next)
}
