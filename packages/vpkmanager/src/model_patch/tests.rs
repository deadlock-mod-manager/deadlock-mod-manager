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
    build_resource_with_tail(
        &[
            (*b"DATA", b"original animation, camera and cloth references"),
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
#[test]
fn adds_rigid_geometry_to_every_lod_without_changing_protected_blocks() {
    for (bone, count, stride, weight_offset) in [("bone_2", 3, 64, 56), ("bone_260", 261, 72, 64)] {
        let input = fixture(count);
        let vertices = vertices();
        let output = attach(&input, &[patch(&vertices, bone)]).unwrap();
        let original = Resource::parse(&input).unwrap();
        let result = Resource::parse(&output).unwrap();
        for index in [0, 2, 5] {
            assert_eq!(
                original.get_block_by_index(index),
                result.get_block_by_index(index)
            );
        }
        for index in [3, 4] {
            let data = kv3::decode(result.get_block_by_index(index).unwrap()).unwrap();
            let calls = array(&array(&data, "m_sceneObjects").unwrap()[0], "m_drawCalls").unwrap();
            assert_eq!(calls.len(), 2);
            assert_eq!(
                calls[1].get("m_material").and_then(Value::as_str),
                Some("materials/patch.vmat")
            );
        }
        let registry = kv3::decode(result.get_block_by_index(1).unwrap()).unwrap();
        let mesh = &array(&registry, "embedded_meshes").unwrap()[0];
        let fields = array(
            array(mesh, "m_vertexBuffers").unwrap().last().unwrap(),
            "m_inputLayoutFields",
        )
        .unwrap();
        for (semantic, shader) in [
            ("NORMAL", "Normal"),
            ("TANGENT", "TangentU_SignV"),
            ("TEXCOORD", "LowPrecisionUv"),
        ] {
            let field = fields
                .iter()
                .find(|f| f.get("m_pSemanticName").and_then(Value::as_str) == Some(semantic))
                .unwrap();
            assert_eq!(
                field.get("m_szShaderSemantic").and_then(Value::as_str),
                Some(shader)
            );
        }
        for index in [7, 9] {
            let bytes = result.get_block_by_index(index).unwrap();
            assert_eq!(bytes.len(), stride * 3);
            for vertex in bytes.chunks_exact(stride) {
                assert_eq!(
                    &vertex[weight_offset..weight_offset + 8],
                    &[255, 0, 0, 0, 0, 0, 0, 0]
                );
                if count > 255 {
                    assert_eq!(u16::from_le_bytes([vertex[48], vertex[49]]), 260);
                } else {
                    assert_eq!(vertex[48], 2);
                }
            }
        }
    }
}
#[test]
fn rejects_unbindable_or_invalid_patches_without_rewriting_the_model() {
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
