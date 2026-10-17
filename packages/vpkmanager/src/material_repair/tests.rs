use super::*;

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (key.to_owned(), value))
            .collect(),
    )
}

fn param(name: &str, key: &str, value: Value) -> Value {
    object(vec![("m_name", Value::String(name.into())), (key, value)])
}

fn resource(blocks: Vec<([u8; 4], Vec<u8>)>) -> Vec<u8> {
    let mut bytes = vec![0; 16 + blocks.len() * 12];
    bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
    bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
    bytes[12..16].copy_from_slice(&(blocks.len() as u32).to_le_bytes());
    for (index, (kind, data)) in blocks.into_iter().enumerate() {
        let table = 16 + index * 12;
        bytes[table..table + 4].copy_from_slice(&kind);
        let relative = (bytes.len() - (table + 4)) as u32;
        bytes[table + 4..table + 8].copy_from_slice(&relative.to_le_bytes());
        bytes[table + 8..table + 12].copy_from_slice(&(data.len() as u32).to_le_bytes());
        bytes.extend(data);
    }
    let length = bytes.len() as u32;
    bytes[..4].copy_from_slice(&length.to_le_bytes());
    bytes
}

fn material(tint: f64, shader: &str) -> Vec<u8> {
    let value = object(vec![
        ("m_materialName", Value::String("current.vmat".into())),
        ("m_shaderName", Value::String(shader.into())),
        (
            "m_intParams",
            Value::Array(vec![param("F_SELF_ILLUM", "m_nValue", Value::Int(1))]),
        ),
        (
            "m_floatParams",
            Value::Array(vec![
                param("g_flSelfIllumScale1", "m_flValue", Value::Double(tint)),
                param(
                    "g_flSelfIllumAlbedoFactor1",
                    "m_flValue",
                    Value::Double(0.4),
                ),
                param("g_flUnrelated", "m_flValue", Value::Double(42.0)),
            ]),
        ),
        (
            "m_vectorParams",
            Value::Array(vec![param(
                "g_vSelfIllumTint1",
                "m_value",
                Value::Array(vec![Value::Double(tint); 4]),
            )]),
        ),
        (
            "m_textureParams",
            Value::Array(vec![param(
                "TextureColor1",
                "m_pValue",
                Value::String("current_mask.vtex".into()),
            )]),
        ),
        (
            "m_dynamicParams",
            Value::Array(vec![
                param("g_vColorTint1", "m_value", Value::Binary(vec![1, 2])),
                param("g_flSelfIllumScale1", "m_value", Value::Binary(vec![3, 4])),
                param("g_flUnrelated", "m_value", Value::Binary(vec![5, 6])),
            ]),
        ),
        (
            "m_renderAttributesUsed",
            Value::Array(vec![
                Value::String("$ent_health".into()),
                Value::String("$unrelated".into()),
            ]),
        ),
    ]);
    resource(vec![
        (*b"DATA", kv3::encode(&value, &kv3::Format([42; 16]))),
        (*b"RED2", vec![9, 8, 7]),
    ])
}

fn model() -> Vec<u8> {
    let groups = Value::Array(vec![object(vec![
        ("m_name", Value::String("default".into())),
        (
            "m_materials",
            Value::Array(vec![
                Value::String("body.vmat".into()),
                Value::String("wax.vmat".into()),
            ]),
        ),
    ])]);
    let value = object(vec![
        ("m_materialGroups", groups),
        ("m_modelSkeleton", Value::Binary(vec![20, 21, 22])),
    ]);
    let mesh = object(vec![(
        "m_sceneObjects",
        Value::Array(vec![object(vec![(
            "m_drawCalls",
            Value::Array(vec![
                object(vec![("m_material", Value::String("body.vmat".into()))]),
                object(vec![("m_material", Value::String("wax.vmat".into()))]),
            ]),
        )])]),
    )]);
    resource(vec![
        (*b"DATA", kv3::encode(&value, &kv3::Format([42; 16]))),
        (*b"RERL", vec![8, 0, 0, 0, 0, 0, 0, 0]),
        (*b"MDAT", kv3::encode(&mesh, &kv3::Format([43; 16]))),
        (*b"MVTX", vec![15, 16, 17]),
    ])
}

#[test]
fn ports_glow_without_copying_textures_or_unrelated_expressions() {
    let current = material(0.0, "pbr.vfx");
    let output = material_variant(&current, &material(0.75, "pbr.vfx"), "new.vmat").unwrap();
    let original = decode(&current).unwrap().0;
    let actual = decode(&output).unwrap().0;
    assert_eq!(
        named(&actual, "m_floatParams", "g_flSelfIllumScale1").unwrap(),
        &Value::Double(0.75)
    );
    assert_eq!(
        named(&actual, "m_floatParams", "g_flUnrelated").unwrap(),
        &Value::Double(42.0)
    );
    assert_eq!(
        actual.get("m_textureParams"),
        original.get("m_textureParams")
    );
    assert_eq!(
        actual.get("m_renderAttributesUsed"),
        original.get("m_renderAttributesUsed")
    );
    let expressions = actual.get("m_dynamicParams").unwrap().as_array().unwrap();
    assert_eq!(expressions.len(), 1);
    assert_eq!(
        expressions[0].get("m_value"),
        Some(&Value::Binary(vec![5, 6]))
    );
    verify_blocks(&current, &output, &[*b"DATA"]).unwrap();
}

#[test]
fn rejects_shader_mismatch_and_nonfinite_authored_values() {
    let current = material(0.0, "pbr.vfx");
    assert!(material_variant(&current, &material(1.0, "other.vfx"), "new.vmat").is_err());
    assert!(material_variant(&current, &material(f64::INFINITY, "pbr.vfx"), "new.vmat").is_err());
}

#[test]
fn rejects_duplicate_authored_parameters() {
    let authored = material(0.75, "pbr.vfx");
    let (mut value, _, format) = decode(&authored).unwrap();
    let Value::Array(params) = value.get_mut("m_floatParams").unwrap() else {
        panic!()
    };
    params.push(params[0].clone());
    let authored = Resource::parse(&authored)
        .unwrap()
        .rebuild_with_data_preserving(&kv3::encode(&value, &format))
        .unwrap();
    assert!(material_variant(&material(0.0, "pbr.vfx"), &authored, "new.vmat").is_err());
}

#[test]
fn binds_requested_role_and_preserves_mesh_rig_and_other_materials() {
    let current = model();
    let roles = [
        ("FriendlyMedic", "green.vmat".to_owned()),
        ("EnemyMedic", "red.vmat".to_owned()),
    ];
    let ids = BTreeMap::from([("green.vmat".into(), 101), ("red.vmat".into(), 102)]);
    let output = bind_variants(&current, &current, "wax.vmat", &roles, &ids).unwrap();
    let original = decode(&current).unwrap().0;
    let actual = decode(&output).unwrap().0;
    assert_eq!(
        actual.get("m_modelSkeleton"),
        original.get("m_modelSkeleton")
    );
    let groups = actual.get("m_materialGroups").unwrap().as_array().unwrap();
    assert_eq!(
        groups[0].get("m_materials"),
        original
            .get("m_materialGroups")
            .unwrap()
            .as_array()
            .unwrap()[0]
            .get("m_materials")
    );
    assert_eq!(
        groups[1].get("m_name").and_then(Value::as_str),
        Some("FriendlyMedic")
    );
    assert_eq!(
        groups[1].get("m_materials").unwrap().as_array().unwrap(),
        &[
            Value::String("body.vmat".into()),
            Value::String("green.vmat".into())
        ]
    );
    assert_eq!(
        references(&output).unwrap(),
        vec![(101, "green.vmat".into()), (102, "red.vmat".into())]
    );
    verify_blocks(&current, &output, &[*b"DATA", *b"RERL"]).unwrap();
}

#[test]
fn refuses_inactive_target_or_unknown_resource_id() {
    let current = model();
    let roles = [("Friendly", "green.vmat".to_owned())];
    let ids = BTreeMap::from([("green.vmat".into(), 101)]);
    assert!(bind_variants(&current, &current, "obsolete.vmat", &roles, &ids).is_err());
    assert!(bind_variants(&current, &current, "wax.vmat", &roles, &BTreeMap::new()).is_err());
}

#[test]
fn refuses_to_discard_existing_authored_material_variants() {
    let current = model();
    let (mut value, _, format) = decode(&current).unwrap();
    let Value::Array(groups) = value.get_mut("m_materialGroups").unwrap() else {
        panic!()
    };
    let mut custom = groups[0].clone();
    *custom.get_mut("m_name").unwrap() = Value::String("Friendly".into());
    *custom.get_mut("m_materials").unwrap() =
        Value::Array(vec![Value::String("custom.vmat".into())]);
    groups.push(custom);
    let changed = Resource::parse(&current)
        .unwrap()
        .rebuild_with_data_preserving(&kv3::encode(&value, &format))
        .unwrap();
    assert!(
        bind_variants(
            &changed,
            &current,
            "wax.vmat",
            &[("Friendly", "green.vmat".into())],
            &BTreeMap::from([("green.vmat".into(), 101)])
        )
        .is_err()
    );
}

#[test]
fn refuses_a_declared_health_group_without_an_embedded_render_surface() {
    let current = shared_head_model();
    let (mut value, encoding, format) = decode(&current).unwrap();
    let Value::Array(masks) = value.get_mut("m_refMeshGroupMasks").unwrap() else {
        panic!()
    };
    // Both groups exist, but there is no embedded head draw call in the registry.
    masks[1] = Value::UInt(1);
    let changed = rebuild(&current, &value, &encoding, &format).unwrap();
    assert!(
        isolate_mesh_material(
            &changed,
            &["head"],
            "shared.vmat",
            &(101, "head.vmat".into())
        )
        .is_err()
    );
}

#[test]
fn references_reject_truncation_conflicts_and_collisions() {
    let current = model();
    let output = add_references(&current, &[(101, "green.vmat".into())]).unwrap();
    assert!(add_references(&output, &[(102, "green.vmat".into())]).is_err());
    assert!(add_references(&output, &[(101, "red.vmat".into())]).is_err());
    assert!(references(&resource(vec![(*b"RERL", vec![8, 0, 0, 0, 1, 0, 0, 0])])).is_err());
    let mut overflowing = vec![8, 0, 0, 0, 1, 0, 0, 0];
    overflowing.extend(101u64.to_le_bytes());
    overflowing.extend(i64::MAX.to_le_bytes());
    assert!(references(&resource(vec![(*b"RERL", overflowing)])).is_err());
}

fn shared_head_model() -> Vec<u8> {
    let data = object(vec![
        (
            "m_meshGroups",
            Value::Array(vec![
                Value::String("body".into()),
                Value::String("head".into()),
            ]),
        ),
        (
            "m_refMeshGroupMasks",
            Value::Array(vec![Value::UInt(1), Value::UInt(2)]),
        ),
    ]);
    let control = object(vec![(
        "embedded_meshes",
        Value::Array(vec![
            object(vec![
                ("m_nMeshIndex", Value::Int(0)),
                ("m_nDataBlock", Value::Int(3)),
            ]),
            object(vec![
                ("m_nMeshIndex", Value::Int(1)),
                ("m_nDataBlock", Value::Int(5)),
            ]),
        ]),
    )]);
    let mesh = object(vec![(
        "m_sceneObjects",
        Value::Array(vec![object(vec![(
            "m_drawCalls",
            Value::Array(vec![object(vec![
                ("m_material", Value::String("shared.vmat".into())),
                ("m_nIndexCount", Value::Int(123)),
            ])]),
        )])]),
    )]);
    resource(vec![
        (*b"DATA", kv3::encode(&data, &kv3::Format([42; 16]))),
        (*b"RERL", vec![8, 0, 0, 0, 0, 0, 0, 0]),
        (*b"CTRL", kv3::encode(&control, &kv3::Format([42; 16]))),
        (*b"MDAT", kv3::encode(&mesh, &kv3::Format([42; 16]))),
        (*b"MVTX", vec![1, 2, 3, 4]),
        (*b"MDAT", kv3::encode(&mesh, &kv3::Format([42; 16]))),
        (*b"MIDX", vec![5, 6, 7, 8]),
    ])
}

#[test]
fn splits_shared_material_on_head_only_without_touching_body_or_buffers() {
    let current = shared_head_model();
    let (output, changed) = isolate_mesh_material(
        &current,
        &["head"],
        "shared.vmat",
        &(101, "head.vmat".into()),
    )
    .unwrap();
    assert_eq!(changed, 1);
    let before = Resource::parse(&current).unwrap();
    let after = Resource::parse(&output).unwrap();
    assert_eq!(before.get_block_by_index(3), after.get_block_by_index(3));
    assert_eq!(before.get_block_by_index(4), after.get_block_by_index(4));
    assert_eq!(before.get_block_by_index(6), after.get_block_by_index(6));
    let mut expected = kv3::decode(before.get_block_by_index(5).unwrap()).unwrap();
    let Value::Array(objects) = expected.get_mut("m_sceneObjects").unwrap() else {
        panic!()
    };
    let Value::Array(draws) = objects[0].get_mut("m_drawCalls").unwrap() else {
        panic!()
    };
    *draws[0].get_mut("m_material").unwrap() = Value::String("head.vmat".into());
    assert_eq!(
        kv3::decode(after.get_block_by_index(5).unwrap()).unwrap(),
        expected
    );
    assert_eq!(
        references(&output).unwrap(),
        vec![(101, "head.vmat".into())]
    );
    verify_blocks(&current, &output, &[*b"MDAT", *b"RERL"]).unwrap();
}

#[test]
fn refuses_missing_group_wrong_target_and_mixed_body_head_scope() {
    let current = shared_head_model();
    let replacement = (101, "head.vmat".into());
    assert!(isolate_mesh_material(&current, &["missing"], "shared.vmat", &replacement).is_err());
    assert!(isolate_mesh_material(&current, &["head"], "wrong.vmat", &replacement).is_err());
    let (mut model, encoding, format) = decode(&current).unwrap();
    let Value::Array(masks) = model.get_mut("m_refMeshGroupMasks").unwrap() else {
        panic!()
    };
    masks[1] = Value::UInt(3);
    let mixed = rebuild(&current, &model, &encoding, &format).unwrap();
    assert!(isolate_mesh_material(&mixed, &["head"], "shared.vmat", &replacement).is_err());
}

#[test]
fn changes_only_the_requested_emission_texture_and_registers_its_resource() {
    let original = material(0.0, "pbr.vfx");
    let (mut value, _, format) = decode(&original).unwrap();
    let Value::Array(params) = value.get_mut("m_textureParams").unwrap() else {
        panic!()
    };
    *params[0].get_mut("m_name").unwrap() = Value::String("g_tSelfIllumMask".into());
    params.push(param(
        "g_tColor",
        "m_pValue",
        Value::String("current_color.vtex".into()),
    ));
    let current = resource(vec![
        (*b"DATA", kv3::encode(&value, &format)),
        (*b"RERL", vec![8, 0, 0, 0, 0, 0, 0, 0]),
        (*b"RED2", vec![9, 8, 7]),
    ]);
    let replacement = (101, "white.vtex".into());
    let output = replace_texture_parameter(&current, "g_tSelfIllumMask", &replacement).unwrap();
    let mut expected = decode(&current).unwrap().0;
    let Value::Array(params) = expected.get_mut("m_textureParams").unwrap() else {
        panic!()
    };
    *params[0].get_mut("m_pValue").unwrap() = Value::String("white.vtex".into());
    assert_eq!(decode(&output).unwrap().0, expected);
    assert_eq!(references(&output).unwrap(), vec![replacement]);
    verify_blocks(&current, &output, &[*b"DATA", *b"RERL"]).unwrap();
    assert!(replace_texture_parameter(&current, "missing", &(102, "white.vtex".into())).is_err());
}
