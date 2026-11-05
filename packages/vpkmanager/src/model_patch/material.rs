use super::*;

pub struct PatchMaterial<'a> {
    pub name: &'a str,
    pub color: &'a str,
    pub normal: &'a str,
    pub black: &'a str,
    pub white: &'a str,
    pub glow: f64,
}

pub(super) fn entry(name: &str, key: &str, value: Value) -> Value {
    Value::Object(vec![
        ("m_name".into(), Value::String(name.into())),
        (key.into(), value),
    ])
}

/// Reuse the PBR shader input signature, but none of the hero material's paint or masks.
pub fn material(template: &[u8], patch: PatchMaterial<'_>) -> Result<Vec<u8>> {
    let resource = Resource::parse(template)?;
    let payload = resource.data_block()?;
    let (mut tree, mut shape) = kv3::decode_preserving(payload)?;
    if tree.get("m_shaderName").and_then(Value::as_str) != Some("pbr.vfx") {
        return Err(invalid("Attached patches require a PBR material host"));
    }
    set(
        &mut tree,
        "m_materialName",
        Value::String(patch.name.into()),
    )?;
    let flags = [
        ("F_ALPHA_TEST", 1),
        ("F_USE_NPR_LIGHTING", 1),
        ("g_bMaskVertexColorTint1", 0),
        ("g_bMaskColorTint1", 0),
        ("F_DISABLE_NPR_OUTLINE", 1),
        ("F_USE_STATUS_EFFECTS_PROXY", 1),
        ("F_ENABLE_TEXTURE_TRANSFORMS", 1),
        ("F_SELF_ILLUM", i64::from(patch.glow > 0.)),
    ];
    let floats = [
        ("g_flAlphaTestReference", 0.1),
        ("g_fVertexColorStrength1", 0.),
        ("g_flSelfIllumScale1", patch.glow),
        ("g_flSelfIllumAlbedoFactor1", 1.),
        ("g_flSelfIllumFresnelMaskExponent", 0.),
    ];
    let textures = [
        ("g_tColor", patch.color),
        ("g_tMetalness", patch.black),
        ("g_tNormalRoughness", patch.normal),
        ("g_tSelfIllumMask", patch.white),
        ("g_tTintMask", patch.white),
    ];
    for (table, values) in [
        (
            "m_intParams",
            flags
                .into_iter()
                .map(|(k, v)| entry(k, "m_nValue", Value::Int(v)))
                .collect::<Vec<_>>(),
        ),
        (
            "m_floatParams",
            floats
                .into_iter()
                .map(|(k, v)| entry(k, "m_flValue", Value::Double(v)))
                .collect(),
        ),
        (
            "m_vectorParams",
            [
                ("g_vColorTint1", [1., 1., 1., 0.]),
                ("g_vSelfIllumTint1", [1., 1., 1., 0.]),
                ("g_vAlbedoContrastSaturationBrightness1", [1., 1., 1., 0.]),
            ]
            .into_iter()
            .map(|(name, values)| {
                entry(
                    name,
                    "m_value",
                    Value::Array(values.into_iter().map(Value::Double).collect()),
                )
            })
            .collect(),
        ),
        (
            "m_textureParams",
            textures
                .iter()
                .map(|(k, v)| entry(k, "m_pValue", Value::String((*v).into())))
                .collect(),
        ),
        ("m_dynamicParams", Vec::new()),
        ("m_dynamicTextureParams", Vec::new()),
    ] {
        let old = shape
            .get_mut(table)
            .ok_or_else(|| invalid("Missing patch material parameter encoding"))?;
        let first = old.as_array().and_then(|v| v.first()).cloned();
        if let Some(first) = first {
            old.children = EncodingChildren::Array(vec![first; values.len()]);
        }
        set(&mut tree, table, Value::Array(values))?;
    }
    let data =
        kv3::wire::encode_preserving_v5(&tree, &shape, &kv3::Format::from_payload(payload)?)?;
    let output = resource.rebuild_with_data_preserving(&data)?;
    let additions = textures
        .iter()
        .map(|(_, path)| Ok((crate::resource_id::resource_id(path)?, format!("{path}_c"))))
        .collect::<Result<Vec<_>>>()?;
    crate::material_repair::add_references(&output, &additions).map_err(|e| invalid(e.to_string()))
}
