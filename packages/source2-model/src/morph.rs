//! Embedded legacy flex animation used by animated particle models.
//! Atlas and segment decoding follow ValveResourceFormat (MIT; see LICENSE-ValveResourceFormat).
use crate::{
    Resource, Result, Source2Error,
    kv3::{self, KvValue},
    vpk_extract::VpkArchive,
    vtex::VtexHeader,
};
use serde_json::{Value, json};

fn invalid(message: &str) -> Source2Error {
    Source2Error::Decode(format!("particle morph: {message}"))
}
fn array<'a>(value: &'a KvValue, key: &str) -> &'a [KvValue] {
    value.get(key).and_then(KvValue::as_array).unwrap_or(&[])
}
fn number(value: &KvValue, key: &str) -> Result<usize> {
    value
        .get(key)
        .and_then(KvValue::as_u32)
        .map(|v| v as usize)
        .ok_or_else(|| invalid(key))
}
fn text<'a>(value: &'a KvValue, key: &str) -> Result<&'a str> {
    value
        .get(key)
        .and_then(KvValue::as_string)
        .ok_or_else(|| invalid(key))
}
fn block(resource: &Resource, name: &str) -> Result<KvValue> {
    kv3::parse(resource.block_bytes(name).ok_or_else(|| invalid(name))?)
}

struct Morph {
    names: Vec<String>,
    positions: Vec<Vec<f32>>,
    normals: Vec<Vec<f32>>,
    frames: Vec<Vec<f32>>,
    fps: f32,
}
impl Morph {
    fn decode(resource: &Resource, archive: &VpkArchive) -> Result<Self> {
        let root = block(resource, "MRPH")?;
        let width = number(&root, "m_nWidth")?;
        let height = number(&root, "m_nHeight")?;
        let vertices = width
            .checked_mul(height)
            .filter(|n| *n > 0 && *n <= 262_144)
            .ok_or_else(|| invalid("vertex grid exceeds preview budget"))?;
        let atlas_path = format!(
            "{}_c",
            text(&root, "m_pTextureAtlas")?.trim_end_matches("_c")
        );
        let atlas_resource = Resource::parse(archive.extract_entry(&atlas_path)?)?;
        let atlas = VtexHeader::parse(&atlas_resource)?.decode(&atlas_resource.data)?;
        let bundles = array(&root, "m_bundleTypes");
        let position_bundle = bundles
            .iter()
            .position(|v| v.as_string() == Some("MORPH_BUNDLE_TYPE_POSITION_SPEED"))
            .ok_or_else(|| invalid("no position bundle"))?;
        let normal_bundle = bundles
            .iter()
            .position(|v| v.as_string() == Some("MORPH_BUNDLE_TYPE_NORMAL_WRINKLE"));
        let targets = array(&root, "m_morphDatas");
        if targets.is_empty() || targets.len() > 64 || vertices * targets.len() > 2_000_000 {
            return Err(invalid("morph target budget exceeded"));
        }
        let mut names = Vec::new();
        let mut positions = Vec::new();
        let mut normals = Vec::new();
        for target in targets {
            names.push(text(target, "m_name")?.to_owned());
            let mut position = vec![0.0; vertices * 3];
            let mut normal = vec![0.0; vertices * 3];
            for rect in array(target, "m_morphRectDatas") {
                let rect_bundles = array(rect, "m_bundleDatas");
                for (bundle_index, output) in [
                    (Some(position_bundle), &mut position),
                    (normal_bundle, &mut normal),
                ] {
                    let Some(bundle) = bundle_index.and_then(|index| rect_bundles.get(index))
                    else {
                        continue;
                    };
                    decode_rect(rect, bundle, &atlas, width, height, output)?;
                }
            }
            positions.push(position);
            normals.push(normal);
        }
        // General flex expressions require the engine's flex VM. Accept direct controller fetches;
        // never silently substitute the wrong weights for a more complex expression.
        let controllers = array(&root, "m_FlexControllers");
        let descriptions = array(&root, "m_FlexDesc");
        let mut controller_names = vec![String::new(); names.len()];
        for rule in array(&root, "m_FlexRules") {
            let ops = array(rule, "m_FlexOps");
            if ops.len() != 1 || text(&ops[0], "m_OpCode")? != "FLEX_OP_FETCH1" {
                return Err(invalid("unsupported flex expression"));
            }
            let target = number(rule, "m_nFlex")?;
            let description = descriptions
                .get(target)
                .ok_or_else(|| invalid("flex description index"))?;
            let Some(index) = names.iter().position(|name| {
                Some(name.as_str()) == description.get("m_szFacs").and_then(KvValue::as_string)
            }) else {
                continue;
            };
            let controller = controllers
                .get(number(&ops[0], "m_Data")?)
                .ok_or_else(|| invalid("flex controller index"))?;
            controller_names[index] = text(controller, "m_szName")?.to_owned();
        }
        if controller_names.iter().any(String::is_empty) {
            return Err(invalid("unmapped flex target"));
        }
        let (fps, frames) = decode_frames(
            &block(resource, "ANIM")?,
            &block(resource, "AGRP")?,
            &controller_names,
        )?;
        Ok(Self {
            names,
            positions,
            normals,
            frames,
            fps,
        })
    }
}

fn decode_rect(
    rect: &KvValue,
    bundle: &KvValue,
    atlas: &crate::DecodedTexture,
    width: usize,
    height: usize,
    output: &mut [f32],
) -> Result<()> {
    let f = |v: &KvValue, key: &str| {
        v.get(key)
            .and_then(KvValue::as_f32)
            .filter(|v| v.is_finite())
            .ok_or_else(|| invalid(key))
    };
    let x = number(rect, "m_nXLeftDst")?;
    let y = number(rect, "m_nYTopDst")?;
    let rw = (f(rect, "m_flUWidthSrc")? * atlas.width as f32)
        .round()
        .max(0.0) as usize;
    let rh = (f(rect, "m_flVHeightSrc")? * atlas.height as f32)
        .round()
        .max(0.0) as usize;
    let u = (f(bundle, "m_flULeftSrc")? * atlas.width as f32)
        .round()
        .max(0.0) as usize;
    let v = (f(bundle, "m_flVTopSrc")? * atlas.height as f32)
        .round()
        .max(0.0) as usize;
    let offsets = bundle
        .get("m_offsets")
        .and_then(KvValue::as_f32_array::<4>)
        .ok_or_else(|| invalid("bundle offsets"))?;
    let ranges = bundle
        .get("m_ranges")
        .and_then(KvValue::as_f32_array::<4>)
        .ok_or_else(|| invalid("bundle ranges"))?;
    for row in 0..rh
        .min(height.saturating_sub(y))
        .min((atlas.height as usize).saturating_sub(v))
    {
        for col in 0..rw
            .min(width.saturating_sub(x))
            .min((atlas.width as usize).saturating_sub(u))
        {
            let pixel = ((v + row) * atlas.width as usize + u + col) * 4;
            let destination = ((y + row) * width + x + col) * 3;
            let mut delta = [0.0; 3];
            for axis in 0..3 {
                let value = atlas.rgba[pixel + axis] as f32 / 255.0 * ranges[axis] + offsets[axis];
                delta[axis] = if value.abs() < ranges[axis].abs() / 510.0 {
                    0.0
                } else {
                    value
                };
            }
            output[destination..destination + 3].copy_from_slice(&[delta[0], delta[2], -delta[1]]);
        }
    }
    Ok(())
}

fn decode_frames(
    anim: &KvValue,
    group: &KvValue,
    names: &[String],
) -> Result<(f32, Vec<Vec<f32>>)> {
    let clip = array(anim, "m_animArray")
        .first()
        .ok_or_else(|| invalid("no embedded animation"))?;
    let fps = clip
        .get("fps")
        .and_then(KvValue::as_f32)
        .filter(|v| v.is_finite() && *v > 0.0)
        .ok_or_else(|| invalid("animation fps"))?;
    let data = clip
        .get("m_pData")
        .ok_or_else(|| invalid("animation data"))?;
    let count = number(data, "m_nFrames")?;
    if count == 0 || count > 4096 {
        return Err(invalid("animation frame budget exceeded"));
    }
    let key = group
        .get("m_decodeKey")
        .ok_or_else(|| invalid("decode key"))?;
    let channels = array(key, "m_dataChannelArray");
    let segments = array(anim, "m_segmentArray");
    let decoders = array(anim, "m_decoderArray");
    let mut frames = vec![vec![0.0; names.len()]; count];
    let mut decoded_any = false;
    for frame_block in array(data, "m_frameblockArray") {
        let start = number(frame_block, "m_nStartFrame")?;
        let end = number(frame_block, "m_nEndFrame")?;
        if start > end || end >= count {
            return Err(invalid("frame block bounds"));
        }
        for index in array(frame_block, "m_segmentIndexArray") {
            let segment = index
                .as_u32()
                .and_then(|i| segments.get(i as usize))
                .ok_or_else(|| invalid("segment index"))?;
            let channel = channels
                .get(number(segment, "m_nLocalChannel")?)
                .ok_or_else(|| invalid("channel index"))?;
            if text(channel, "m_szChannelClass")? != "MorphChannel" {
                continue;
            }
            let Some(KvValue::Binary(bytes)) = segment.get("m_container") else {
                return Err(invalid("segment bytes"));
            };
            let u16_at = |offset| {
                bytes
                    .get(offset..offset + 2)
                    .map(|b| u16::from_le_bytes([b[0], b[1]]) as usize)
                    .ok_or_else(|| invalid("segment header"))
            };
            let decoder = decoders
                .get(u16_at(0)?)
                .ok_or_else(|| invalid("decoder index"))?;
            let static_frame = match text(decoder, "m_szName")? {
                "CCompressedStaticFloat" => true,
                "CCompressedFullFloat" => false,
                _ => return Err(invalid("unsupported morph float decoder")),
            };
            let elements = u16_at(4)?;
            let payload = 8 + elements * 2;
            let channel_names = array(channel, "m_szElementNameArray");
            let channel_indices = array(channel, "m_nElementIndexArray");
            for element in 0..elements {
                let id = u16_at(8 + element * 2)?;
                let Some(channel_element) = channel_indices
                    .iter()
                    .position(|v| v.as_u32() == Some(id as u32))
                else {
                    continue;
                };
                let Some(name) = channel_names
                    .get(channel_element)
                    .and_then(KvValue::as_string)
                else {
                    continue;
                };
                let Some(target) = names.iter().position(|n| n == name) else {
                    continue;
                };
                for (frame_index, frame) in frames.iter_mut().enumerate().take(end + 1).skip(start)
                {
                    let local = if static_frame { 0 } else { frame_index - start };
                    let offset = payload + (local * elements + element) * 4;
                    let value = bytes
                        .get(offset..offset + 4)
                        .ok_or_else(|| invalid("truncated float segment"))?;
                    let value = f32::from_le_bytes(value.try_into().unwrap());
                    if !value.is_finite() {
                        return Err(invalid("non-finite flex weight"));
                    }
                    frame[target] = value;
                    decoded_any = true;
                }
            }
        }
    }
    if !decoded_any {
        return Err(invalid("no mapped morph animation samples"));
    }
    Ok((fps, frames))
}

fn append_accessor(
    document: &mut Value,
    bin: &mut Vec<u8>,
    values: &[f32],
    components: usize,
) -> usize {
    let offset = bin.len();
    for value in values {
        bin.extend_from_slice(&value.to_le_bytes());
    }
    let views = document["bufferViews"].as_array_mut().unwrap();
    let view = views.len();
    views.push(json!({"buffer":0,"byteOffset":offset,"byteLength":values.len()*4}));
    let accessors = document["accessors"].as_array_mut().unwrap();
    let index = accessors.len();
    let mut accessor = json!({"bufferView":view,"componentType":5126,"count":values.len()/components,"type":if components==3 {"VEC3"} else {"SCALAR"}});
    if components == 3 {
        let (min, max) = crate::vmesh::vec3_min_max(values);
        accessor["min"] = json!(min);
        accessor["max"] = json!(max);
    }
    if components == 1 {
        accessor["min"] = json!([values.iter().copied().fold(f32::INFINITY, f32::min)]);
        accessor["max"] = json!([values.iter().copied().fold(f32::NEG_INFINITY, f32::max)]);
    }
    accessors.push(accessor);
    index
}

pub(crate) fn animated_glb(
    glb: &[u8],
    resource: &Resource,
    archive: &VpkArchive,
    remaps: &[&[u32]],
) -> Result<Vec<u8>> {
    let control = block(resource, "CTRL")?;
    if array(&control, "embedded_meshes").len() != 1 {
        return Err(invalid("multiple embedded morph meshes are not supported"));
    }
    let morph = Morph::decode(resource, archive)?;
    let json_length = u32::from_le_bytes(glb[12..16].try_into().unwrap()) as usize;
    let json_end = 20 + json_length;
    let mut document: Value =
        serde_json::from_slice(&glb[20..json_end]).map_err(|_| invalid("GLB JSON"))?;
    let mut bin = glb[json_end + 8..].to_vec();
    if document["meshes"][0]["primitives"].as_array().map(Vec::len) != Some(remaps.len()) {
        return Err(invalid("mesh remap mismatch"));
    }
    for (primitive, remap) in remaps.iter().enumerate() {
        let mut targets = Vec::new();
        for target in 0..morph.names.len() {
            let deltas = |values: &[f32]| -> Result<Vec<f32>> {
                let mut output = Vec::with_capacity(remap.len() * 3);
                for index in *remap {
                    let start = *index as usize * 3;
                    output.extend_from_slice(
                        values
                            .get(start..start + 3)
                            .ok_or_else(|| invalid("morph vertex remap out of bounds"))?,
                    );
                }
                Ok(output)
            };
            let position = append_accessor(
                &mut document,
                &mut bin,
                &deltas(&morph.positions[target])?,
                3,
            );
            let normal =
                append_accessor(&mut document, &mut bin, &deltas(&morph.normals[target])?, 3);
            targets.push(json!({"POSITION":position,"NORMAL":normal}));
        }
        document["meshes"][0]["primitives"][primitive]["targets"] = json!(targets);
    }
    document["meshes"][0]["weights"] = json!(vec![0.0; morph.names.len()]);
    document["meshes"][0]["extras"]["targetNames"] = json!(morph.names);
    let times: Vec<f32> = (0..=morph.frames.len())
        .map(|frame| frame as f32 / morph.fps)
        .collect();
    let weights: Vec<f32> = morph
        .frames
        .iter()
        .chain(morph.frames.first())
        .flatten()
        .copied()
        .collect();
    let input = append_accessor(&mut document, &mut bin, &times, 1);
    let output = append_accessor(&mut document, &mut bin, &weights, 1);
    document["animations"] = json!([{"name":"particle_flex","samplers":[{"input":input,"output":output,"interpolation":"LINEAR"}],"channels":[{"sampler":0,"target":{"node":0,"path":"weights"}}]}]);
    document["buffers"][0]["byteLength"] = json!(bin.len());
    let mut json_bytes = serde_json::to_vec(&document).map_err(|_| invalid("GLB encode"))?;
    while !json_bytes.len().is_multiple_of(4) {
        json_bytes.push(b' ');
    }
    let mut output = Vec::new();
    for value in [
        0x4654_6c67u32,
        2,
        (28 + json_bytes.len() + bin.len()) as u32,
        json_bytes.len() as u32,
        0x4e4f_534a,
    ] {
        output.extend_from_slice(&value.to_le_bytes());
    }
    output.extend_from_slice(&json_bytes);
    output.extend_from_slice(&(bin.len() as u32).to_le_bytes());
    output.extend_from_slice(&0x004e_4942u32.to_le_bytes());
    output.extend_from_slice(&bin);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atlas_rects_clip_at_grid_edges_without_wrapping_into_other_vertices() {
        fn make(v: Value) -> KvValue {
            match v {
                Value::Object(v) => {
                    KvValue::Object(v.into_iter().map(|(k, v)| (k, make(v))).collect())
                }
                Value::Array(v) => KvValue::Array(v.into_iter().map(make).collect()),
                Value::Number(v) => v
                    .as_i64()
                    .map(KvValue::Int)
                    .unwrap_or_else(|| KvValue::Float(v.as_f64().unwrap())),
                _ => panic!("unexpected test value"),
            }
        }
        let rect =
            make(json!({"m_nXLeftDst":1,"m_nYTopDst":0,"m_flUWidthSrc":1.0,"m_flVHeightSrc":1.0}));
        let bundle = make(
            json!({"m_flULeftSrc":0.0,"m_flVTopSrc":0.0,"m_offsets":[0,0,0,0],"m_ranges":[255,255,255,0]}),
        );
        let atlas = crate::DecodedTexture {
            width: 2,
            height: 2,
            rgba: vec![1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255],
        };
        let mut result = vec![0.0; 12];
        decode_rect(&rect, &bundle, &atlas, 2, 2, &mut result).unwrap();
        assert_eq!(
            result,
            vec![0., 0., 0., 1., 3., -2., 0., 0., 0., 7., 9., -8.]
        );
    }
    #[test]
    #[ignore = "requires the installed Deadlock VPK"]
    fn mina_bat_embedded_morph_animates_the_compacted_mesh() {
        let path = std::env::var("DEADLOCK_VPK").expect("set DEADLOCK_VPK");
        let archive = VpkArchive::open(std::path::Path::new(&path)).unwrap();
        let model: crate::ModelGlb =
            crate::decode_model_glb_from_archive(&archive, "models/particle/vampirebat_bat.vmdl_c")
                .unwrap();
        let length = u32::from_le_bytes(model.glb[12..16].try_into().unwrap()) as usize;
        let document: Value = serde_json::from_slice(&model.glb[20..20 + length]).unwrap();
        assert_eq!(
            document["meshes"][0]["primitives"][0]["targets"]
                .as_array()
                .unwrap()
                .len(),
            5
        );
        assert_eq!(
            document["animations"][0]["channels"][0]["target"]["path"],
            "weights"
        );
        let resource = Resource::parse(
            archive
                .extract_entry("models/particle/vampirebat_bat.vmdl_c")
                .unwrap(),
        )
        .unwrap();
        let morph = Morph::decode(&resource, &archive).unwrap();
        assert_eq!(morph.frames.len(), 6);
        assert_eq!(morph.fps, 30.0);
        assert_eq!(morph.frames[0], vec![1., 0., 0., 0., 0.]);
        assert_eq!(morph.frames[1], vec![0., 1., 0., 0., 0.]);
        assert!(morph.positions[0].iter().any(|delta| delta.abs() > 1.));
    }
}
