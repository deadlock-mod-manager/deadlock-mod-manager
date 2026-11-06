use super::*;
fn object(fields: &[(&str, Value)]) -> Value {
    Value::Object(
        fields
            .iter()
            .map(|(key, value)| ((*key).into(), value.clone()))
            .collect(),
    )
}
fn encoded(value: &Value) -> Vec<u8> {
    kv3::encode(value, &kv3::Format([0; 16]))
}
fn fixture(bone_count: usize) -> Vec<u8> {
    let field = object(&[
        ("m_pSemanticName", Value::String("POSITION".into())),
        ("m_szShaderSemantic", Value::String("PosXyz".into())),
        ("m_Format", number(6)),
        ("m_nOffset", number(0)),
    ]);
    let buffer = object(&[
        ("m_inputLayoutFields", Value::Array(vec![field])),
        ("m_nElementCount", number(3)),
        ("m_nElementSizeInBytes", number(12)),
        ("m_bMeshoptCompressed", Value::Bool(false)),
        ("m_bCompressedZSTD", Value::Bool(false)),
        ("m_nBlockIndex", number(2)),
    ]);
    let mesh = |block| {
        object(&[
            ("m_nDataBlock", number(block)),
            ("m_nMeshIndex", number(block - 3)),
            ("m_vertexBuffers", Value::Array(vec![buffer.clone()])),
            ("m_indexBuffers", Value::Array(vec![buffer.clone()])),
        ])
    };
    let ctrl = encoded(&object(&[(
        "embedded_meshes",
        Value::Array(vec![mesh(3), mesh(4)]),
    )]));
    let binding = object(&[("m_hBuffer", number(0)), ("m_nBindOffsetBytes", number(0))]);
    let mut draw = object(&[
        ("m_material", Value::String("materials/host.vmat".into())),
        ("m_bUseCompressedNormalTangent", Value::Bool(true)),
        ("m_indexBuffer", binding.clone()),
        ("m_vertexBuffers", Value::Array(vec![binding])),
    ]);
    for key in [
        "m_nBaseVertex",
        "m_nStartIndex",
        "m_nIndexCount",
        "m_nVertexCount",
        "m_nAppliedIndexOffset",
        "m_nNumMeshlets",
        "m_nFirstMeshlet",
    ] {
        if let Value::Object(fields) = &mut draw {
            fields.push((key.into(), number(3)));
        }
    }
    let bones = (0..bone_count)
        .map(|i| object(&[("m_boneName", Value::String(format!("bone_{i}")))]))
        .collect();
    let scene = object(&[
        ("m_drawCalls", Value::Array(vec![draw])),
        ("m_vMinBounds", Value::Array(vec![Value::Double(-100.); 3])),
        ("m_vMaxBounds", Value::Array(vec![Value::Double(100.); 3])),
    ]);
    let data = encoded(&object(&[
        ("m_sceneObjects", Value::Array(vec![scene])),
        ("m_skeleton", object(&[("m_bones", Value::Array(bones))])),
    ]));
    let model_data = encoded(&object(&[
        (
            "m_refLODGroupMasks",
            Value::Array(vec![number(1), number(2 | 4 | 8)]),
        ),
        (
            "m_refMeshGroupMasks",
            Value::Array(vec![number(1), number(1)]),
        ),
        (
            "m_remappingTableStarts",
            Value::Array(vec![number(0), number(bone_count)]),
        ),
        (
            "m_remappingTable",
            Value::Array((0..bone_count).chain(0..bone_count).map(number).collect()),
        ),
        (
            "m_modelSkeleton",
            object(&[
                (
                    "m_boneName",
                    Value::Array(
                        (0..bone_count)
                            .map(|i| Value::String(format!("bone_{i}")))
                            .collect(),
                    ),
                ),
                (
                    "m_nParent",
                    Value::Array(
                        (0..bone_count)
                            .map(|i| Value::Int(if i == 0 { -1 } else { (i - 1) as i64 }))
                            .collect(),
                    ),
                ),
                ("m_nFlag", Value::Array(vec![number(0x400); bone_count])),
            ]),
        ),
        (
            "original",
            Value::String("animation, camera and cloth references".into()),
        ),
    ]));
    build_resource_with_tail(
        &[
            (*b"DATA", &model_data),
            (*b"CTRL", &ctrl),
            (*b"MVTX", b"original geometry"),
            (*b"MDAT", &data),
            (*b"MDAT", &data),
            (*b"PHYS", b"original physics"),
            (*b"RERL", &[8, 0, 0, 0, 0, 0, 0, 0]),
        ],
        &[],
        1,
    )
    .unwrap()
}
fn vertices() -> Vec<PatchVertex> {
    [[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]]
        .map(|position| PatchVertex {
            position,
            normal: [0., 0., 1.],
            tangent: [1., 0., 0., 1.],
            uv: [0., 0.],
        })
        .to_vec()
}
fn patch<'a>(vertices: &'a [PatchVertex], bone: &'a str) -> AttachedPatch<'a> {
    AttachedPatch {
        host_material: "materials/host.vmat",
        material: "materials/patch.vmat",
        bone,
        vertices,
        indices: &[0, 1, 2],
    }
}

fn check_original_blocks(input: &[u8], output: &[u8]) {
    let before = Resource::parse(input).unwrap();
    let after = Resource::parse(output).unwrap();
    for (i, block) in before.blocks().iter().enumerate() {
        if !matches!(&block.kind, b"DATA" | b"CTRL" | b"RERL") {
            assert_eq!(before.get_block_by_index(i), after.get_block_by_index(i));
        }
    }
    let original = kv3::decode(before.data_block().unwrap()).unwrap();
    let result = kv3::decode(after.data_block().unwrap()).unwrap();
    let Value::Object(fields) = original else {
        panic!("model data");
    };
    for (key, value) in fields {
        if !matches!(
            key.as_str(),
            "m_refLODGroupMasks"
                | "m_refMeshGroupMasks"
                | "m_remappingTableStarts"
                | "m_remappingTable"
                | "m_modelSkeleton"
        ) {
            assert!(equivalent(&value, result.get(&key).unwrap()));
        }
    }
}

#[test]
fn independent_sticker_mesh_keeps_original_geometry_and_covers_all_lods() {
    for (bone, count, stride) in [("bone_2", 3, 64), ("bone_260", 261, 72)] {
        let input = fixture(count);
        let vertices = vertices();
        let output = attach(&input, &[patch(&vertices, bone)]).unwrap();
        check_original_blocks(&input, &output);
        let after = Resource::parse(&output).unwrap();
        let ctrl = kv3::decode(after.find_block(*b"CTRL").unwrap()).unwrap();
        let meshes = array(&ctrl, "embedded_meshes").unwrap();
        assert_eq!(meshes.len(), 3);
        let added = &meshes[2];
        assert_eq!(added.get("m_nMeshIndex").and_then(Value::as_f64), Some(2.));
        assert_eq!(array(added, "m_vertexBuffers").unwrap().len(), 1);
        assert_eq!(array(added, "m_indexBuffers").unwrap().len(), 1);
        let data = kv3::decode(after.get_block_by_index(9).unwrap()).unwrap();
        let scenes = array(&data, "m_sceneObjects").unwrap();
        assert_eq!(scenes.len(), 1);
        let calls = array(&scenes[0], "m_drawCalls").unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(
            calls[0].get("m_material").and_then(Value::as_str),
            Some("materials/patch.vmat")
        );
        let bytes = after.get_block_by_index(7).unwrap();
        assert_eq!(bytes.len(), stride * 3);
        let bound = if count > 255 {
            usize::from(u16::from_le_bytes([bytes[48], bytes[49]]))
        } else {
            usize::from(bytes[48])
        };
        assert_eq!(bound, count - 1);
        let model = kv3::decode(after.data_block().unwrap()).unwrap();
        assert_eq!(
            array(&model, "m_refLODGroupMasks")
                .unwrap()
                .last()
                .and_then(Value::as_f64),
            Some(15.)
        );
        assert_eq!(
            array(&model, "m_remappingTableStarts")
                .unwrap()
                .last()
                .and_then(Value::as_f64),
            Some((count * 2) as f64)
        );
        let flags = array(model.get("m_modelSkeleton").unwrap(), "m_nFlag").unwrap();
        assert!(
            flags
                .iter()
                .all(|flag| flag.as_f64() == Some(0x3c80 as f64))
        );
    }
}

#[test]
fn shared_material_on_parts_without_the_bone_and_reduced_lods_needs_no_manual_replacement() {
    let original = fixture(3);
    let resource = Resource::parse(&original).unwrap();
    let mut unrelated = kv3::decode(resource.get_block_by_index(3).unwrap()).unwrap();
    set(
        unrelated.get_mut("m_skeleton").unwrap(),
        "m_bones",
        Value::Array(vec![object(&[(
            "m_boneName",
            Value::String("bone_0".into()),
        )])]),
    )
    .unwrap();
    let unrelated = encoded(&unrelated);
    let blocks: Vec<_> = resource
        .blocks()
        .iter()
        .enumerate()
        .map(|(i, b)| {
            (
                b.kind,
                if i == 3 {
                    unrelated.as_slice()
                } else {
                    resource.get_block_by_index(i).unwrap()
                },
            )
        })
        .collect();
    let input = build_resource_with_tail(&blocks, &[], 1).unwrap();
    let vertices = vertices();
    let output = attach(&input, &[patch(&vertices, "bone_2")]).unwrap();
    check_original_blocks(&input, &output);
    let after = Resource::parse(&output).unwrap();
    let model = kv3::decode(after.data_block().unwrap()).unwrap();
    assert_eq!(
        array(&model, "m_refLODGroupMasks")
            .unwrap()
            .last()
            .and_then(Value::as_f64),
        Some(15.)
    );
}

#[test]
fn multiple_stickers_each_export_once_without_accumulating_host_buffers() {
    let input = fixture(3);
    let vertices = vertices();
    let patches = [patch(&vertices, "bone_1"), patch(&vertices, "bone_2")];
    let output = attach(&input, &patches).unwrap();
    check_original_blocks(&input, &output);
    let after = Resource::parse(&output).unwrap();
    let ctrl = kv3::decode(after.find_block(*b"CTRL").unwrap()).unwrap();
    assert_eq!(array(&ctrl, "embedded_meshes").unwrap().len(), 4);
    assert_eq!(after.blocks().len(), 13);
}

#[test]
fn rejects_invalid_geometry_or_missing_bones_without_changing_inputs() {
    let input = fixture(3);
    let mut vertices = vertices();
    assert!(attach(&input, &[patch(&vertices, "missing")]).is_err());
    let mut bad = patch(&vertices, "bone_2");
    bad.indices = &[0, 1, 9];
    assert!(attach(&input, &[bad]).is_err());
    let mut bad = patch(&vertices, "bone_2");
    bad.material = "/tmp/patch.vmat";
    assert!(attach(&input, &[bad]).is_err());
    vertices[0].position[0] = f32::NAN;
    assert!(attach(&input, &[patch(&vertices, "bone_2")]).is_err());
    assert_eq!(attach(&input, &[]).unwrap(), input);
}

#[test]
fn patch_material_has_independent_parameters_and_retains_shader_signature() {
    let data = encoded(&object(&[
        ("m_shaderName", Value::String("pbr.vfx".into())),
        (
            "m_materialName",
            Value::String("materials/host.vmat".into()),
        ),
        (
            "m_intParams",
            Value::Array(vec![material::entry("F_TEST", "m_nValue", number(1))]),
        ),
        (
            "m_floatParams",
            Value::Array(vec![material::entry(
                "test",
                "m_flValue",
                Value::Double(0.),
            )]),
        ),
        (
            "m_textureParams",
            Value::Array(vec![material::entry(
                "g_tColor",
                "m_pValue",
                Value::String("host.vtex".into()),
            )]),
        ),
        ("m_vectorParams", Value::Array(vec![])),
        ("m_dynamicParams", Value::Array(vec![])),
        ("m_dynamicTextureParams", Value::Array(vec![])),
    ]));
    let input = build_resource_with_tail(
        &[
            (*b"DATA", &data),
            (*b"INSG", b"original shader input signature"),
            (*b"RERL", &[8, 0, 0, 0, 0, 0, 0, 0]),
        ],
        &[],
        1,
    )
    .unwrap();
    let output = material(
        &input,
        PatchMaterial {
            name: "materials/patch.vmat",
            color: "materials/patch.vtex",
            normal: "materials/normal.vtex",
            black: "materials/black.vtex",
            white: "materials/white.vtex",
            glow: 1.,
        },
    )
    .unwrap();
    let result = Resource::parse(&output).unwrap();
    assert_eq!(
        result.get_block_by_index(1),
        Some(b"original shader input signature".as_slice())
    );
    let decoded = kv3::decode(result.data_block().unwrap()).unwrap();
    assert_eq!(
        decoded.get("m_materialName").and_then(Value::as_str),
        Some("materials/patch.vmat")
    );
    assert!(array(&decoded, "m_dynamicParams").unwrap().is_empty());
    assert_eq!(array(&decoded, "m_textureParams").unwrap().len(), 5);
    for (key, expected) in [("F_ALPHA_TEST", 0.), ("F_TRANSLUCENT", 1.)] {
        let flag = array(&decoded, "m_intParams")
            .unwrap()
            .iter()
            .find(|entry| entry.get("m_name").and_then(Value::as_str) == Some(key))
            .unwrap();
        assert_eq!(flag.get("m_nValue").and_then(Value::as_f64), Some(expected));
    }
    assert!(
        array(&decoded, "m_intAttributes")
            .unwrap()
            .iter()
            .any(
                |entry| entry.get("m_name").and_then(Value::as_str) == Some("translucent")
                    && entry.get("m_nValue").and_then(Value::as_f64) == Some(1.)
            )
    );
    let lighting = array(&decoded, "m_intParams")
        .unwrap()
        .iter()
        .find(|p| p.get("m_name").and_then(Value::as_str) == Some("F_USE_NPR_LIGHTING"))
        .unwrap();
    assert_eq!(lighting.get("m_nValue").and_then(Value::as_f64), Some(1.));
    let glow = array(&decoded, "m_floatParams")
        .unwrap()
        .iter()
        .find(|p| p.get("m_name").and_then(Value::as_str) == Some("g_flSelfIllumScale1"))
        .unwrap();
    assert_eq!(glow.get("m_flValue").and_then(Value::as_f64), Some(1.));
    assert!(
        array(&decoded, "m_vectorParams")
            .unwrap()
            .iter()
            .any(|p| p.get("m_name").and_then(Value::as_str) == Some("g_vSelfIllumTint1"))
    );
}

#[test]
fn static_hosts_and_omitted_normal_compression_flags_export_independently() {
    let original = fixture(0);
    let before = Resource::parse(&original).unwrap();
    let mut data = kv3::decode(before.get_block_by_index(3).unwrap()).unwrap();
    let Some(Value::Array(scenes)) = data.get_mut("m_sceneObjects") else {
        panic!("fixture scenes");
    };
    let Some(Value::Array(calls)) = scenes[0].get_mut("m_drawCalls") else {
        panic!("fixture draws");
    };
    let Value::Object(fields) = &mut calls[0] else {
        panic!("fixture draw");
    };
    fields.retain(|(key, _)| key != "m_bUseCompressedNormalTangent");
    let data = encoded(&data);
    let blocks: Vec<_> = before
        .blocks()
        .iter()
        .enumerate()
        .map(|(i, block)| {
            (
                block.kind,
                if i == 3 {
                    data.as_slice()
                } else {
                    before.get_block_by_index(i).unwrap()
                },
            )
        })
        .collect();
    let input = build_resource_with_tail(&blocks, &[], 1).unwrap();
    let vertices = vertices();
    let output = attach(&input, &[patch(&vertices, "")]).unwrap();
    check_original_blocks(&input, &output);
    let after = Resource::parse(&output).unwrap();
    let mesh = kv3::decode(after.get_block_by_index(9).unwrap()).unwrap();
    let call = &array(&array(&mesh, "m_sceneObjects").unwrap()[0], "m_drawCalls").unwrap()[0];
    assert!(call.get("m_bUseCompressedNormalTangent").is_none());
}
