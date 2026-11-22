//! Verified material parameter and model binding edits.
//! Callers supply an evidence-backed target mapping; this module does not infer intent.

use crate::source2::{
    kv3::{self, Encoding, EncodingChildren, Value},
    resource::Resource,
};
use std::collections::BTreeMap;
#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct RepairError(String);

macro_rules! error_conversion {
    ($($ty:ty),* $(,)?) => { $(impl From<$ty> for RepairError {
        fn from(value: $ty) -> Self { Self(value.to_string()) }
    })* };
}
error_conversion!(
    String,
    &str,
    crate::source2::DecodeError,
    crate::source2::EncodeError,
    std::num::TryFromIntError,
    std::array::TryFromSliceError,
    std::str::Utf8Error
);
pub type Result<T> = std::result::Result<T, RepairError>;

pub fn field<'a>(value: &'a Value, name: &str) -> Result<&'a Value> {
    value
        .get(name)
        .ok_or_else(|| format!("missing {name}").into())
}

fn named<'a>(value: &'a Value, table: &str, name: &str) -> Result<&'a Value> {
    let entries = field(value, table)?
        .as_array()
        .ok_or("expected parameter array")?;
    let mut matches = entries
        .iter()
        .filter(|entry| entry.get("m_name").and_then(Value::as_str) == Some(name));
    let entry = matches
        .next()
        .ok_or_else(|| format!("missing parameter {name}"))?;
    if matches.next().is_some() {
        return Err(format!("duplicate parameter {name}").into());
    }
    field(entry, parameter_value_key(table)?)
}

fn parameter_value_key(table: &str) -> Result<&'static str> {
    match table {
        "m_intParams" => Ok("m_nValue"),
        "m_floatParams" => Ok("m_flValue"),
        "m_vectorParams" => Ok("m_value"),
        _ => Err("unsupported parameter table".into()),
    }
}

pub fn decode(bytes: &[u8]) -> Result<(Value, Encoding, kv3::Format)> {
    let resource = Resource::parse(bytes)?;
    let data = resource.data_block()?;
    let (value, encoding) = kv3::decode_preserving(data)?;
    Ok((value, encoding, kv3::Format::from_payload(data)?))
}

fn equal(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Double(a), Value::Double(b)) => (a - b).abs() < 0.000001,
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| equal(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .zip(b)
                    .all(|((ka, a), (kb, b))| ka == kb && equal(a, b))
        }
        _ => left == right,
    }
}

fn rebuild(
    bytes: &[u8],
    value: &Value,
    encoding: &Encoding,
    format: &kv3::Format,
) -> Result<Vec<u8>> {
    let data = kv3::encode_preserving(value, encoding, format)?;
    let output = Resource::parse(bytes)?.rebuild_with_data_preserving(&data)?;
    let (actual, actual_encoding, actual_format) = decode(&output)?;
    if actual_format != *format
        || !equal(value, &actual)
        || !kv3::encoding_preserved(value, encoding, &actual_encoding)
    {
        return Err("rebuilt DATA failed value/encoding verification".into());
    }
    verify_blocks(bytes, &output, &[*b"DATA"])?;
    Ok(output)
}

fn verify_blocks(before: &[u8], after: &[u8], allowed: &[[u8; 4]]) -> Result<()> {
    let before = Resource::parse(before)?;
    let after = Resource::parse(after)?;
    if before.blocks().len() != after.blocks().len() {
        return Err("block registry changed".into());
    }
    for (index, (a, b)) in before.blocks().iter().zip(after.blocks()).enumerate() {
        if a.kind != b.kind
            || (!allowed.contains(&a.kind)
                && before.get_block_by_index(index) != after.get_block_by_index(index))
        {
            return Err(format!("unexpected change to block {index}").into());
        }
    }
    Ok(())
}

/// Port only the reviewed static glow edits. Current masks, shader features,
/// resource references and attribute indices stay intact. Health tint expressions
/// are removed because this mod explicitly requests static colors.
pub fn material_variant(current: &[u8], authored: &[u8], path: &str) -> Result<Vec<u8>> {
    let (mut target, mut encoding, format) = decode(current)?;
    let (source, _, _) = decode(authored)?;
    if field(&target, "m_shaderName")?.as_str() != Some("pbr.vfx")
        || field(&source, "m_shaderName")? != field(&target, "m_shaderName")?
        || named(&target, "m_intParams", "F_SELF_ILLUM")?.as_int() != Some(1)
        || named(&source, "m_intParams", "F_SELF_ILLUM")?.as_int() != Some(1)
    {
        return Err("incompatible emissive shader interface".into());
    }
    for (table, name) in [
        ("m_floatParams", "g_flSelfIllumScale1"),
        ("m_floatParams", "g_flSelfIllumAlbedoFactor1"),
        ("m_vectorParams", "g_vSelfIllumTint1"),
    ] {
        let replacement = named(&source, table, name)?.clone();
        let original = named(&target, table, name)?;
        let valid = match (&replacement, original) {
            (Value::Double(a), Value::Double(_)) => a.is_finite(),
            (Value::Array(a), Value::Array(b)) => {
                a.len() == 4
                    && b.len() == 4
                    && a.iter().all(|v| v.as_f64().is_some_and(f64::is_finite))
            }
            _ => false,
        };
        if !valid {
            return Err(format!("incompatible parameter {name}").into());
        }
        let Value::Array(entries) = target.get_mut(table).ok_or("missing parameter table")? else {
            return Err("invalid parameter table".into());
        };
        let entry = entries
            .iter_mut()
            .find(|v| v.get("m_name").and_then(Value::as_str) == Some(name))
            .ok_or("missing target parameter")?;
        *entry
            .get_mut(parameter_value_key(table)?)
            .ok_or("missing target value")? = replacement;
    }
    let Value::Array(expressions) = target
        .get_mut("m_dynamicParams")
        .ok_or("missing expressions")?
    else {
        return Err("invalid expressions".into());
    };
    let EncodingChildren::Array(expression_encodings) = &mut encoding
        .get_mut("m_dynamicParams")
        .ok_or("missing expression encoding")?
        .children
    else {
        return Err("invalid expression encoding".into());
    };
    if expressions.len() != expression_encodings.len() {
        return Err("expression encoding count mismatch".into());
    }
    for index in (0..expressions.len()).rev() {
        if matches!(
            expressions[index].get("m_name").and_then(Value::as_str),
            Some("g_vColorTint1" | "g_flSelfIllumScale1")
        ) {
            expressions.remove(index);
            expression_encodings.remove(index);
        }
    }
    *target
        .get_mut("m_materialName")
        .ok_or("missing material name")? = Value::String(path.to_owned());
    rebuild(current, &target, &encoding, &format)
}

pub fn references(bytes: &[u8]) -> Result<Vec<(u64, String)>> {
    let resource = Resource::parse(bytes)?;
    let data = resource.find_block(*b"RERL").ok_or("missing RERL")?;
    let read = |offset: usize, count: usize| data.get(offset..offset.checked_add(count)?);
    let start = u32::from_le_bytes(read(0, 4).ok_or("truncated RERL")?.try_into()?) as usize;
    let count = u32::from_le_bytes(read(4, 4).ok_or("truncated RERL")?.try_into()?) as usize;
    let end = start
        .checked_add(count.checked_mul(16).ok_or("RERL overflow")?)
        .ok_or("RERL overflow")?;
    if start < 8 || end > data.len() {
        return Err("RERL table out of bounds".into());
    }
    (0..count)
        .map(|index| {
            let offset = start + index * 16;
            let id = u64::from_le_bytes(read(offset, 8).ok_or("missing id")?.try_into()?);
            let relative = i64::from_le_bytes(
                read(offset + 8, 8)
                    .ok_or("missing name offset")?
                    .try_into()?,
            );
            let absolute = usize::try_from(
                i64::try_from(offset + 8)?
                    .checked_add(relative)
                    .ok_or("RERL name offset overflow")?,
            )?;
            let tail = data.get(absolute..).ok_or("RERL name out of bounds")?;
            let length = tail
                .iter()
                .position(|b| *b == 0)
                .ok_or("unterminated RERL name")?;
            Ok((id, std::str::from_utf8(&tail[..length])?.to_owned()))
        })
        .collect()
}

/// Preserve existing references and reject conflicting path/ID assignments.
pub fn add_references(bytes: &[u8], additions: &[(u64, String)]) -> Result<Vec<u8>> {
    let mut entries = references(bytes)?;
    for (id, path) in additions {
        if let Some((existing, _)) = entries.iter().find(|(_, name)| name == path) {
            if id != existing {
                return Err("conflicting resource ID".into());
            }
        } else {
            if entries.iter().any(|(existing, _)| id == existing) {
                return Err("resource ID collision".into());
            }
            entries.push((*id, path.clone()));
        }
    }
    let count = u32::try_from(entries.len())?;
    let mut data = vec![0; 8 + entries.len() * 16];
    data[..4].copy_from_slice(&8u32.to_le_bytes());
    data[4..8].copy_from_slice(&count.to_le_bytes());
    for (index, (id, path)) in entries.iter().enumerate() {
        let offset = 8 + index * 16;
        let relative = i64::try_from(data.len() - (offset + 8))?;
        data[offset..offset + 8].copy_from_slice(&id.to_le_bytes());
        data[offset + 8..offset + 16].copy_from_slice(&relative.to_le_bytes());
        data.extend_from_slice(path.as_bytes());
        data.push(0);
    }
    let resource = Resource::parse(bytes)?;
    let index = resource
        .blocks()
        .iter()
        .position(|b| b.kind == *b"RERL")
        .ok_or("missing RERL block")?;
    let output = resource.rebuild_with_block(index, &data)?;
    if references(&output)? != entries {
        return Err("RERL round trip failed".into());
    }
    verify_blocks(bytes, &output, &[*b"RERL"])?;
    Ok(output)
}

pub fn drawn_materials(bytes: &[u8]) -> Result<Vec<String>> {
    let resource = Resource::parse(bytes)?;
    let mut names = Vec::new();
    for (index, block) in resource.blocks().iter().enumerate() {
        if block.kind != *b"MDAT" {
            continue;
        }
        let value = kv3::decode(
            resource
                .get_block_by_index(index)
                .ok_or("missing mesh block")?,
        )?;
        for scene in field(&value, "m_sceneObjects")?
            .as_array()
            .ok_or("invalid scene objects")?
        {
            for draw in field(scene, "m_drawCalls")?
                .as_array()
                .ok_or("invalid draw calls")?
            {
                let name = draw
                    .get("m_material")
                    .or_else(|| draw.get("m_pMaterial"))
                    .and_then(Value::as_str)
                    .ok_or("missing draw material")?;
                if !names.iter().any(|existing| existing == name) {
                    names.push(name.to_owned());
                }
            }
        }
    }
    if names.is_empty() {
        return Err("no embedded draw materials".into());
    }
    Ok(names)
}

pub fn bind_variants(
    current: &[u8],
    template: &[u8],
    target: &str,
    roles: &[(&str, String)],
    ids: &BTreeMap<String, u64>,
) -> Result<Vec<u8>> {
    let names = drawn_materials(current)?;
    let position = names
        .iter()
        .position(|name| name == target)
        .ok_or("target is not an active draw material")?;
    let (mut model, mut encoding, format) = decode(current)?;
    let existing = field(&model, "m_materialGroups")?
        .as_array()
        .ok_or("invalid existing material groups")?;
    if !existing.is_empty() {
        let default = existing.first().ok_or("missing default group")?;
        if field(default, "m_name")?.as_str() != Some("default") {
            return Err("first material group is not default".into());
        }
        let default_materials = field(default, "m_materials")?;
        for group in existing {
            let name = field(group, "m_name")?
                .as_str()
                .ok_or("invalid group name")?;
            if (name != "default" && !roles.iter().any(|(role, _)| *role == name))
                || field(group, "m_materials")? != default_materials
            {
                return Err("existing material variants require a reviewed merge".into());
            }
        }
    }
    let (old, old_encoding, _) = decode(template)?;
    let groups = field(&old, "m_materialGroups")?
        .as_array()
        .ok_or("invalid group template")?;
    let template = groups.first().ok_or("empty group template")?;
    let group_encoding = old_encoding
        .get("m_materialGroups")
        .and_then(Encoding::as_array)
        .and_then(|v| v.first())
        .ok_or("missing group template encoding")?;
    let material_encoding = group_encoding
        .get("m_materials")
        .and_then(Encoding::as_array)
        .and_then(|v| v.first())
        .ok_or("missing material encoding")?;
    let mut values = Vec::new();
    let mut encodings = Vec::new();
    let mut additions = Vec::new();
    for (group, replacement) in std::iter::once(("default", None))
        .chain(roles.iter().map(|(group, path)| (*group, Some(path))))
    {
        let mut materials = names.clone();
        if let Some(path) = replacement {
            let id = *ids
                .get(path)
                .ok_or_else(|| format!("no resource ID for {path}"))?;
            additions.push((id, path.clone()));
            materials[position] = path.clone();
        }
        let mut value = template.clone();
        *value.get_mut("m_name").ok_or("missing group name")? = Value::String(group.to_owned());
        *value
            .get_mut("m_materials")
            .ok_or("missing group materials")? =
            Value::Array(materials.into_iter().map(Value::String).collect());
        let mut meta = group_encoding.clone();
        meta.get_mut("m_materials")
            .ok_or("missing material list encoding")?
            .children = EncodingChildren::Array(vec![material_encoding.clone(); names.len()]);
        values.push(value);
        encodings.push(meta);
    }
    *model
        .get_mut("m_materialGroups")
        .ok_or("missing model material groups")? = Value::Array(values);
    let mut group_meta = old_encoding
        .get("m_materialGroups")
        .ok_or("missing groups encoding")?
        .clone();
    group_meta.children = EncodingChildren::Array(encodings);
    *encoding
        .get_mut("m_materialGroups")
        .ok_or("missing model groups encoding")? = group_meta;
    let output = rebuild(current, &model, &encoding, &format)?;
    let output = add_references(&output, &additions)?;
    verify_blocks(current, &output, &[*b"DATA", *b"RERL"])?;
    Ok(output)
}

pub fn isolate_mesh_material(
    current: &[u8],
    groups: &[&str],
    target: &str,
    replacement: &(u64, String),
) -> Result<(Vec<u8>, usize)> {
    use kv3::Seg;
    let (model, _, _) = decode(current)?;
    let names = field(&model, "m_meshGroups")?
        .as_array()
        .ok_or("invalid mesh groups")?;
    let masks = field(&model, "m_refMeshGroupMasks")?
        .as_array()
        .ok_or("invalid mesh group masks")?;
    if groups.is_empty() {
        return Err("empty mesh selection".into());
    }
    let mut selected = 0u64;
    for group in groups {
        let matches: Vec<_> = names
            .iter()
            .enumerate()
            .filter(|(_, value)| value.as_str() == Some(group))
            .collect();
        let [(index, _)] = matches.as_slice() else {
            return Err(format!("missing or ambiguous group {group}").into());
        };
        selected |= 1u64
            .checked_shl(u32::try_from(*index)?)
            .ok_or("too many mesh groups")?;
    }
    let original = Resource::parse(current)?;
    let control = kv3::decode(
        original
            .find_block(*b"CTRL")
            .ok_or("missing mesh registry")?,
    )?;
    let registry = field(&control, "embedded_meshes")?
        .as_array()
        .ok_or("invalid mesh registry")?;
    let mut output = current.to_vec();
    let mut changed = 0;
    let mut covered = 0u64;
    let mut seen_meshes = std::collections::BTreeSet::new();
    let mut seen = std::collections::BTreeSet::new();
    for entry in registry {
        let mesh = usize::try_from(
            field(entry, "m_nMeshIndex")?
                .as_int()
                .ok_or("invalid mesh index")?,
        )?;
        let mask = masks
            .get(mesh)
            .and_then(Value::as_uint)
            .ok_or("invalid mesh mask")?;
        if mask & selected == 0 {
            continue;
        }
        if mask & !selected != 0 {
            return Err("selected mesh also belongs to an unselected group".into());
        }
        if !seen_meshes.insert(mesh) {
            return Err("duplicate selected mesh index".into());
        }
        covered |= mask & selected;
        let index = usize::try_from(
            field(entry, "m_nDataBlock")?
                .as_int()
                .ok_or("invalid data block")?,
        )?;
        if !seen.insert(index) {
            return Err("duplicate selected mesh block".into());
        }
        if original
            .blocks()
            .get(index)
            .is_none_or(|block| block.kind != *b"MDAT")
        {
            return Err("selected block is not MDAT".into());
        }
        let block = original
            .get_block_by_index(index)
            .ok_or("missing selected mesh")?;
        let (mut expected, before_encoding) = kv3::decode_preserving(block)?;
        let Value::Array(objects) = expected
            .get_mut("m_sceneObjects")
            .ok_or("missing scene objects")?
        else {
            return Err("invalid scene objects".into());
        };
        let mut edits = Vec::new();
        for (scene_index, scene) in objects.iter_mut().enumerate() {
            let Value::Array(draws) = scene.get_mut("m_drawCalls").ok_or("missing draw calls")?
            else {
                return Err("invalid draw calls".into());
            };
            for (draw_index, draw) in draws.iter_mut().enumerate() {
                let key = if draw.get("m_material").is_some() {
                    "m_material"
                } else {
                    "m_pMaterial"
                };
                let value = draw.get_mut(key).ok_or("missing material")?;
                if value.as_str() != Some(target) {
                    continue;
                }
                *value = Value::String(replacement.1.clone());
                edits.push((
                    vec![
                        Seg::Key("m_sceneObjects".into()),
                        Seg::Index(scene_index),
                        Seg::Key("m_drawCalls".into()),
                        Seg::Index(draw_index),
                        Seg::Key(key.into()),
                    ],
                    replacement.1.clone(),
                ));
            }
        }
        if edits.is_empty() {
            return Err("selected mesh does not draw the expected material".into());
        }
        let edited = kv3::set_strings_adding(block, &edits)?;
        let (actual, actual_encoding) = kv3::decode_preserving(&edited)?;
        if !equal(&expected, &actual)
            || before_encoding != actual_encoding
            || kv3::Format::from_payload(block)? != kv3::Format::from_payload(&edited)?
        {
            return Err("mesh binding edit changed unrelated values or encodings".into());
        }
        output = Resource::parse(&output)?.rebuild_with_block(index, &edited)?;
        changed += 1;
    }
    if changed == 0 {
        return Err("no matching selected meshes".into());
    }
    if covered != selected
        || masks.iter().enumerate().any(|(index, mask)| {
            mask.as_uint().is_some_and(|mask| mask & selected != 0) && !seen_meshes.contains(&index)
        })
    {
        return Err("selected mesh groups are not fully represented by embedded meshes".into());
    }
    output = add_references(&output, std::slice::from_ref(replacement))?;
    verify_blocks(current, &output, &[*b"MDAT", *b"RERL"])?;
    for index in 0..original.blocks().len() {
        if !seen.contains(&index)
            && original.blocks()[index].kind == *b"MDAT"
            && original.get_block_by_index(index)
                != Resource::parse(&output)?.get_block_by_index(index)
        {
            return Err("unselected mesh changed".into());
        }
    }
    Ok((output, changed))
}

pub fn rename_material(current: &[u8], path: &str) -> Result<Vec<u8>> {
    let (mut material, encoding, format) = decode(current)?;
    *material
        .get_mut("m_materialName")
        .ok_or("missing material name")? = Value::String(path.to_owned());
    rebuild(current, &material, &encoding, &format)
}

pub fn replace_texture_parameter(
    current: &[u8],
    name: &str,
    replacement: &(u64, String),
) -> Result<Vec<u8>> {
    let (mut material, encoding, format) = decode(current)?;
    let Value::Array(params) = material
        .get_mut("m_textureParams")
        .ok_or("missing texture parameters")?
    else {
        return Err("invalid texture parameters".into());
    };
    let matches: Vec<_> = params
        .iter()
        .enumerate()
        .filter(|(_, entry)| entry.get("m_name").and_then(Value::as_str) == Some(name))
        .map(|(i, _)| i)
        .collect();
    let [index] = matches.as_slice() else {
        return Err("missing or ambiguous texture parameter".into());
    };
    let value = params[*index]
        .get_mut("m_pValue")
        .ok_or("missing texture path")?;
    if value.as_str().is_none() {
        return Err("invalid texture path".into());
    }
    *value = Value::String(replacement.1.clone());
    let output = rebuild(current, &material, &encoding, &format)?;
    add_references(&output, std::slice::from_ref(replacement))
}

#[cfg(test)]
#[path = "material_repair/tests.rs"]
mod tests;
