use super::*;
use serde_json::Value;

const SOURCE: &[u8] = include_bytes!("../../tests/fixtures/source-quad-binary9.dmx");
const MATERIALS: &[u8] = include_bytes!("../../tests/fixtures/source-materials-binary9.dmx");

#[test]
fn text_dmx_preserves_the_binary_mesh_geometry() {
    let text = include_bytes!("../../tests/fixtures/source-quad-keyvalues2.dmx");
    let expected = decode_dmx_glb(SOURCE).unwrap();
    for version in 1..=4 {
        let text = std::str::from_utf8(text)
            .unwrap()
            .replace("keyvalues2 4", &format!("keyvalues2\t{version}"));
        let actual = decode_dmx_glb(text.as_bytes()).unwrap();
        assert_same_geometry(&actual, &expected);
    }
    let prefixed = std::str::from_utf8(text).unwrap().replace(
        "-->\n",
        "-->\n\"$prefix_element$\" { \"tool\" \"string\" \"Exporter\" }\n",
    );
    assert_same_geometry(&decode_dmx_glb(prefixed.as_bytes()).unwrap(), &expected);
}

#[test]
fn skeleton_only_text_dmx_has_a_drawable_preview() {
    let text = br#"<!-- dmx encoding keyvalues2 4 format model 22 -->
    "DmElement" {
        "skeleton" "DmeModel" {
            "children" "element_array" [ "element" "joint" ]
        }
    }
    "DmeJoint" {
        "id" "elementid" "joint"
        "children" "element_array" [ "DmeJoint" {
            "transform" "DmeTransform" {
                "position" "vector3" "0 0 10"
            }
        } ]
    }"#;
    let preview = decode_dmx_glb(text).unwrap();
    assert!(DmxModel::decode(text).unwrap().is_skeleton_only());
    assert!(!DmxModel::decode(SOURCE).unwrap().is_skeleton_only());
    assert!(preview.vertex_count > 0);
    assert!(preview.index_count > 0);
    let data = json(&preview);
    assert_eq!(data["accessors"][0]["max"][1], 10.);
    assert!(data["accessors"][0]["max"][0].as_f64().unwrap() <= 0.011);
    assert!(data["accessors"][0]["min"][0].as_f64().unwrap() >= -0.011);
}

#[test]
fn malformed_text_dmx_returns_errors_without_panics() {
    let text = include_bytes!("../../tests/fixtures/source-quad-keyvalues2.dmx");
    let end = text.iter().rposition(|value| *value == b'}').unwrap() + 1;
    for length in 0..end {
        assert!(
            decode_dmx_glb(&text[..length]).is_err(),
            "truncation {length}"
        );
    }
    let text = std::str::from_utf8(text).unwrap();
    for (from, to) in [
        ("0.0 0.0 0.0", "NaN 0.0 0.0"),
        ("0.0 0.0 0.0", "0.0 0.0"),
        (
            "\"0\", \"1\", \"2\", \"3\", \"-1\"",
            "\"900\", \"1\", \"2\", \"3\", \"-1\"",
        ),
        (
            "07070707-0707-0707-0707-070707070707",
            "01010101-0101-0101-0101-010101010101",
        ),
        (
            "\"model\" \"DmeModel\"",
            "\"model\" \"element\" \"missing\" \"other\" \"DmeModel\"",
        ),
    ] {
        let malformed = text.replace(from, to);
        assert_ne!(malformed, text);
        assert!(
            decode_dmx_glb(malformed.as_bytes()).is_err(),
            "{from} -> {to}"
        );
    }
}

#[test]
fn text_references_support_nulls_forward_links_and_reject_scene_cycles() {
    let text = br#"<!-- dmx encoding keyvalues2 4 format model 22 -->
    // Mixed inline and shared elements, including a null reference.
    "DmElement" {
        "model" "element" "scene"
        "unused" "element" ""
    }
    "DmeModel" {
        "id" "elementid" "scene"
        "children" "element_array" [ "element" "", "element" "joint" ]
    }
    "DmeJoint" { "id" "elementid" "joint"
        "children" "element_array" [ "DmeJoint" {
            "transform" "DmeTransform" { "position" "vector3" "0 0 10" }
        } ]
    }"#;
    assert!(decode_dmx_glb(text).is_ok());
    let cyclic = std::str::from_utf8(text)
        .unwrap()
        .replace("\"element\" \"\"", "\"element\" \"scene\"");
    assert!(decode_dmx_glb(cyclic.as_bytes()).is_err());
    let missing = std::str::from_utf8(text)
        .unwrap()
        .replace("\"element\" \"joint\"", "\"element\" \"missing\"");
    assert!(decode_dmx_glb(missing.as_bytes()).is_err());
}

fn texture(path: &str) -> PreviewTexture {
    PreviewTexture {
        source2: Some(crate::Source2Material {
            schema_version: 1,
            shader: "pbr.vfx".into(),
            blend_mode: crate::Source2BlendMode::Opaque,
            unlit: false,
            color: None,
            emission: None,
        }),
        tint_mask_png: None,
        effect_mask_png: None,
        source2_effect: None,
        name: path.into(),
        material: Some(path.into()),
        png: crate::encode_png_bytes(
            &crate::DecodedTexture {
                width: 1,
                height: 1,
                rgba: vec![255, 0, 0, 255],
            },
            1024,
        )
        .unwrap(),
        normal_png: None,
        orm_png: None,
        emissive_png: None,
        self_illum_mask_png: None,
        vertex_color: false,
        double_sided: false,
        base_color_factor: [1.; 4],
        metalness_factor: 0.,
        alpha_mode: crate::vmesh::MaterialAlphaMode::Opaque,
        alpha_cutoff: 0.5,
        emissive_factor: None,
        emissive_strength: 1.,
        outline: None,
    }
}

fn json(model: &ModelGlb) -> Value {
    let length = u32::from_le_bytes(model.glb[12..16].try_into().unwrap()) as usize;
    serde_json::from_slice(&model.glb[20..20 + length]).unwrap()
}

#[test]
fn raw_glow_mask_is_exported_separately_from_the_baked_gltf_fallback() {
    let mut texture = texture("materials/blue.vmat_c");
    texture.emissive_png = Some(texture.png.clone());
    texture.self_illum_mask_png = Some(texture.png.clone());
    texture.emissive_factor = Some([1.; 3]);
    texture.source2.as_mut().unwrap().emission =
        Some(crate::material_preview::metadata::Source2Emission {
            mask_texture: None,
            albedo_factor: 1.,
        });
    let model = DmxModel::decode(MATERIALS)
        .unwrap()
        .into_glb(&[texture], &[])
        .unwrap();
    let data = json(&model);
    let material = &data["materials"][1];
    let mask = material["extras"]["source2"]["emission"]["maskTexture"]
        .as_u64()
        .unwrap();
    let fallback = material["emissiveTexture"]["index"].as_u64().unwrap();
    assert_ne!(mask, fallback);
    assert!(data["textures"][mask as usize].get("source").is_some());
    assert_eq!(
        material["extras"]["source2"]["emission"]["albedoFactor"],
        1.
    );
}

fn assert_same_geometry(actual: &ModelGlb, expected: &ModelGlb) {
    let geometry = |model: &ModelGlb| {
        let mut document = json(model);
        for primitive in document["meshes"][0]["primitives"].as_array_mut().unwrap() {
            let extras = primitive["extras"].as_object_mut().unwrap();
            assert!(extras.remove("sourceGeometryState").unwrap().is_u64());
        }
        document
    };
    assert_eq!(geometry(actual), geometry(expected));
    let binary = |model: &ModelGlb| {
        let length = u32::from_le_bytes(model.glb[12..16].try_into().unwrap()) as usize;
        model.glb[20 + length..].to_vec()
    };
    assert_eq!(binary(actual), binary(expected));
}

#[test]
fn face_sets_keep_their_own_materials_and_modeldoc_remaps_without_compiled_geometry() {
    let model = DmxModel::decode(MATERIALS).unwrap();
    assert_eq!(
        model.materials(),
        &["materials/red.vmat", "materials/blue.vmat"]
    );
    let model = model
        .into_glb(
            &[
                texture("materials/blue.vmat_c"),
                texture("materials/green.vmat_c"),
            ],
            &[("materials/red.vmat".into(), "materials/green.vmat".into())],
        )
        .unwrap();
    let data = json(&model);
    let primitives = data["meshes"][0]["primitives"].as_array().unwrap();
    assert_eq!(primitives[0]["material"], 1);
    assert_eq!(primitives[1]["material"], 2);
    assert_eq!(data["materials"][1]["name"], "materials/green.vmat_c");
    assert_eq!(data["materials"][2]["name"], "materials/blue.vmat_c");
    assert_eq!(
        data["materials"][1]["extras"]["source2"]["schemaVersion"],
        1
    );
    assert_eq!(data["images"].as_array().unwrap().len(), 2);
}

#[test]
fn missing_materials_stay_untextured_instead_of_borrowing_another_faces_texture() {
    let model = DmxModel::decode(MATERIALS)
        .unwrap()
        .into_glb(&[texture("materials/blue.vmat_c")], &[])
        .unwrap();
    let data = json(&model);
    assert_eq!(data["meshes"][0]["primitives"][0]["material"], 0);
    assert_eq!(data["meshes"][0]["primitives"][1]["material"], 1);
    let standalone = decode_dmx_glb(MATERIALS).unwrap();
    assert!(json(&standalone).get("images").is_none());
    assert_eq!(model.index_count, standalone.index_count);
    assert_eq!(model.vertex_count, standalone.vertex_count);
}

#[test]
fn native_source_mesh_preserves_indexed_channels_and_scene_transforms() {
    let model = decode_dmx_glb(SOURCE).unwrap();
    assert_eq!((model.vertex_count, model.index_count), (4, 6));
    assert_eq!(&model.glb[..4], b"glTF");
    let length = u32::from_le_bytes(model.glb[12..16].try_into().unwrap()) as usize;
    let json: Value = serde_json::from_slice(&model.glb[20..20 + length]).unwrap();
    let accessors = json["accessors"].as_array().unwrap();
    let position = &accessors[0];
    assert_eq!(position["min"], serde_json::json!([10., 30., -21.]));
    assert_eq!(position["max"], serde_json::json!([11., 30., -20.]));
    let attributes = &json["meshes"][0]["primitives"][0]["attributes"];
    assert!(attributes.get("NORMAL").is_some());
    assert!(attributes.get("TEXCOORD_0").is_some());
    assert!(json.get("images").is_none());
}

#[test]
fn earlier_binary_encodings_decode_the_same_geometry() {
    let expected = decode_dmx_glb(SOURCE).unwrap();
    for source in [
        include_bytes!("../../tests/fixtures/source-quad-binary2.dmx").as_slice(),
        include_bytes!("../../tests/fixtures/source-quad-binary4.dmx").as_slice(),
        include_bytes!("../../tests/fixtures/source-quad-binary5.dmx").as_slice(),
    ] {
        assert_same_geometry(&decode_dmx_glb(source).unwrap(), &expected);
    }
}

#[test]
fn truncated_or_malformed_dmx_returns_errors_without_panics() {
    for length in 0..SOURCE.len() {
        assert!(
            decode_dmx_glb(&SOURCE[..length]).is_err(),
            "length={length}"
        );
    }
    let mut malformed = SOURCE.to_vec();
    // The final quaternion must be finite and nonzero.
    let end = malformed.len();
    malformed[end - 4..].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(decode_dmx_glb(&malformed).is_err());
    assert!(decode_dmx_glb(b"<!-- dmx encoding keyvalues2 1 format model 22 -->").is_err());
}

#[test]
fn invalid_face_indices_and_scene_cycles_are_rejected() {
    let mut document = binary::parse(SOURCE).unwrap();
    document[5]
        .attributes
        .insert("faces".into(), binary::Value::Integers(vec![0, 1, 99, -1]));
    assert!(mesh::decode(&document).is_err());
    let mut document = binary::parse(SOURCE).unwrap();
    document[1]
        .attributes
        .insert("children".into(), binary::Value::References(vec![Some(1)]));
    assert!(mesh::decode(&document).is_err());
}

#[test]
fn concave_polygons_triangulate_without_covering_the_cutout() {
    let mut document = binary::parse(SOURCE).unwrap();
    document[4].attributes.insert(
        "position$0".into(),
        binary::Value::Numbers(vec![
            0., 0., 0., 2., 0., 0., 2., 2., 0., 1., 0.5, 0., 0., 2., 0.,
        ]),
    );
    document[4].attributes.insert(
        "position$0Indices".into(),
        binary::Value::Integers(vec![0, 1, 2, 3, 4]),
    );
    document[4]
        .attributes
        .retain(|key, _| key.starts_with("position"));
    document[5].attributes.insert(
        "faces".into(),
        binary::Value::Integers(vec![0, 1, 2, 3, 4, -1]),
    );
    let primitives = mesh::decode(&document).unwrap();
    let primitive = &primitives[0];
    assert_eq!(primitive.index_count, 9);
    let indices = primitive
        .indices
        .as_chunks::<2>()
        .0
        .iter()
        .map(|v| u16::from_le_bytes(*v) as usize)
        .collect::<Vec<_>>();
    let area = indices
        .as_chunks::<3>()
        .0
        .iter()
        .map(|triangle| {
            let p = |index: usize| {
                let i = index * 3;
                [primitive.positions[i], primitive.positions[i + 2]]
            };
            let a = p(triangle[0]);
            let b = p(triangle[1]);
            let c = p(triangle[2]);
            ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])).abs() * 0.5
        })
        .sum::<f32>();
    assert!((area - 2.5).abs() < 1e-5, "area={area}");
}

#[test]
fn empty_material_names_support_modeldoc_defaults_and_saved_visibility() {
    let mut bytes = MATERIALS.to_vec();
    let name = b"materials/red.vmat";
    let at = bytes
        .windows(name.len())
        .position(|v| v.eq_ignore_ascii_case(name))
        .unwrap();
    bytes.drain(at..at + name.len());
    let remaps = vec![(String::new(), "materials/green.vmat".into())];
    let mut model = DmxModel::decode(&bytes).unwrap();
    assert!(model.materials().iter().any(String::is_empty));
    assert!(model.hide_materials(&["materials/blue.vmat".into()], &remaps));
    let model = model
        .into_glb(&[texture("materials/green.vmat_c")], &remaps)
        .unwrap();
    assert_eq!(model.index_count, 3);
    assert_eq!(
        json(&model)["materials"][1]["extras"]["sourceMaterial"],
        "materials/green.vmat"
    );
}
