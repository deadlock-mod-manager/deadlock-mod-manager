use super::*;
use crate::source2::{kv3::Seg, vfx_expr};

#[derive(Clone, Copy)]
pub enum ParameterKind {
    Flag,
    Scalar,
    Color,
    Vector,
}
pub struct ParameterSpec {
    pub name: &'static str,
    pub kind: ParameterKind,
    pub group: &'static str,
    pub default: [f64; 4],
    pub min: f64,
    pub max: f64,
}
impl ParameterSpec {
    pub fn width(&self) -> usize {
        match self.kind {
            ParameterKind::Flag | ParameterKind::Scalar => 1,
            _ => 4,
        }
    }
    pub fn table(&self) -> &'static str {
        match self.kind {
            ParameterKind::Flag => "m_intParams",
            ParameterKind::Scalar => "m_floatParams",
            _ => "m_vectorParams",
        }
    }
    pub fn key(&self) -> &'static str {
        match self.kind {
            ParameterKind::Flag => "m_nValue",
            ParameterKind::Scalar => "m_flValue",
            _ => "m_value",
        }
    }
}
macro_rules! spec {
    ($name:literal,$kind:ident,$group:literal,$default:expr,$min:expr,$max:expr) => {
        ParameterSpec {
            name: $name,
            kind: ParameterKind::$kind,
            group: $group,
            default: $default,
            min: $min,
            max: $max,
        }
    };
}
pub const PARAMETERS: &[ParameterSpec] = &[
    spec!("g_vColorTint1", Color, "color", [1.; 4], 0., 1.),
    spec!(
        "TextureNormal1",
        Color,
        "surface",
        [0.5, 0.5, 1., 0.],
        0.,
        1.
    ),
    spec!(
        "TextureAmbientOcclusion1",
        Scalar,
        "surface",
        [1.; 4],
        0.,
        1.
    ),
    spec!("TextureSelfIllumMask1", Scalar, "emission", [1.; 4], 0., 1.),
    spec!("TextureRimLightMask1", Scalar, "npr", [0.; 4], 0., 1.),
    spec!(
        "TextureNprTramsissiveColor1",
        Color,
        "npr",
        [0., 0., 0., 0.],
        0.,
        1.
    ),
    spec!(
        "g_vAlbedoContrastSaturationBrightness1",
        Vector,
        "color",
        [1., 1., 1., 0.],
        0.,
        4.
    ),
    spec!("g_bMaskColorTint1", Flag, "color", [1.; 4], 0., 1.),
    spec!("g_bMaskVertexColorTint1", Flag, "color", [1.; 4], 0., 1.),
    spec!("g_fVertexColorStrength1", Scalar, "color", [1.; 4], 0., 1.),
    spec!("F_SELF_ILLUM", Flag, "emission", [0.; 4], 0., 1.),
    spec!("g_flSelfIllumScale1", Scalar, "emission", [1.; 4], 0., 32.),
    spec!(
        "g_flSelfIllumAlbedoFactor1",
        Scalar,
        "emission",
        [1.; 4],
        0.,
        1.
    ),
    spec!(
        "g_flSelfIllumFresnelMaskExponent",
        Scalar,
        "emission",
        [1.; 4],
        0.,
        16.
    ),
    spec!("g_vSelfIllumTint1", Color, "emission", [1.; 4], 0., 1.),
    spec!("F_UNLIT", Flag, "npr", [0.; 4], 0., 1.),
    spec!("F_USE_NPR_LIGHTING", Flag, "npr", [1.; 4], 0., 1.),
    spec!("F_DISABLE_NPR_OUTLINE", Flag, "npr", [0.; 4], 0., 1.),
    spec!("F_OVERRIDE_NPR_OUTLINE", Flag, "npr", [0.; 4], 0., 1.),
    spec!("F_SOLID_COLOR_OUTLINE", Flag, "npr", [0.; 4], 0., 1.),
    spec!("g_flHighlightAOstrength1", Scalar, "npr", [1.; 4], 0., 1.),
    spec!("g_flHighlightCoverage1", Scalar, "npr", [0.; 4], 0., 1.),
    spec!("g_flHighlightHardness1", Scalar, "npr", [0.; 4], 0., 1.),
    spec!(
        "g_flHighlightNormalStrength1",
        Scalar,
        "npr",
        [64.; 4],
        0.,
        128.
    ),
    spec!(
        "g_vHighlightPositionWs1",
        Vector,
        "npr",
        [0., 0., 72., 0.],
        -1024.,
        1024.
    ),
    spec!("g_flHighlightRadius1", Scalar, "npr", [256.; 4], 0., 2048.),
    spec!("g_vHighlightTint1", Color, "npr", [1.; 4], 0., 1.),
    spec!(
        "g_flHighlightTintBrightness1",
        Scalar,
        "npr",
        [1.; 4],
        0.,
        8.
    ),
    spec!("g_flInvertHighlight1", Scalar, "npr", [0.; 4], 0., 1.),
    spec!(
        "F_USE_STATUS_EFFECTS_PROXY",
        Flag,
        "status",
        [0.; 4],
        0.,
        1.
    ),
    spec!("g_vAlbedoScrollSpeed1", Vector, "motion", [0.; 4], -2., 2.),
    spec!(
        "g_vNormalAndRoughnessScrollSpeed1",
        Vector,
        "motion",
        [0.; 4],
        -2.,
        2.
    ),
    spec!(
        "g_vSelfIllumScrollSpeed1",
        Vector,
        "motion",
        [0.; 4],
        -2.,
        2.
    ),
];
pub fn parameter_spec(name: &str) -> Result<&'static ParameterSpec> {
    PARAMETERS
        .iter()
        .find(|p| p.name == name)
        .ok_or_else(|| invalid(format!("Unsupported model parameter: {name}")))
}
pub fn parameter_values(tree: &Value, spec: &ParameterSpec) -> Vec<f64> {
    let v = array(tree, spec.table())
        .iter()
        .find(|p| {
            p.get("m_name")
                .and_then(Value::as_str)
                .is_some_and(|n| n.eq_ignore_ascii_case(spec.name))
        })
        .and_then(|p| p.get(spec.key()));
    if spec.width() == 1 {
        vec![v.and_then(Value::as_f64).unwrap_or(spec.default[0])]
    } else {
        v.and_then(Value::as_array)
            .filter(|a| a.len() == 4)
            .map(|a| {
                a.iter()
                    .enumerate()
                    .map(|(i, v)| v.as_f64().unwrap_or(spec.default[i]))
                    .collect()
            })
            .unwrap_or_else(|| spec.default.to_vec())
    }
}
pub fn validate_parameter(name: &str, values: &[f64]) -> Result<()> {
    let s = parameter_spec(name)?;
    if values.len() != s.width()
        || values
            .iter()
            .any(|v| !v.is_finite() || *v < s.min || *v > s.max)
        || matches!(s.kind, ParameterKind::Flag) && values[0].fract() != 0.
    {
        return Err(invalid(format!("Invalid material parameter {name}")));
    }
    Ok(())
}
pub fn material_expressions(tree: &Value) -> Vec<(String, String)> {
    let attrs = array(tree, "m_renderAttributesUsed")
        .iter()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>();
    array(tree, "m_dynamicParams")
        .iter()
        .filter_map(|p| {
            let name = p.get("m_name")?.as_str()?;
            let Value::Binary(b) = p.get("m_value")? else {
                return None;
            };
            Some((name.into(), vfx_expr::decompile(b, &attrs).ok()?))
        })
        .collect()
}
fn patch_data(bytes: &[u8], f: impl FnOnce(&[u8], &Value) -> Result<Vec<u8>>) -> Result<Vec<u8>> {
    let r = Resource::parse(bytes).map_err(|e| invalid(e.to_string()))?;
    let data = r.data_block().map_err(|e| invalid(e.to_string()))?;
    let tree = kv3::decode(data).map_err(|e| invalid(e.to_string()))?;
    let data = f(data, &tree)?;
    r.rebuild_with_data_preserving(&data)
        .map_err(|e| invalid(e.to_string()))
}
fn index(tree: &Value, table: &str, name: &str) -> Result<Option<usize>> {
    let found = array(tree, table)
        .iter()
        .enumerate()
        .filter(|(_, p)| {
            p.get("m_name")
                .and_then(Value::as_str)
                .is_some_and(|n| n.eq_ignore_ascii_case(name))
        })
        .map(|(i, _)| i)
        .collect::<Vec<_>>();
    match found.as_slice() {
        [] => Ok(None),
        [i] => Ok(Some(*i)),
        _ => Err(invalid("Ambiguous material parameter")),
    }
}
pub fn set_parameter(bytes: &[u8], name: &str, values: &[f64]) -> Result<Vec<u8>> {
    validate_parameter(name, values)?;
    let s = parameter_spec(name)?;
    patch_data(bytes, |data, tree| {
        if index(tree, "m_dynamicParams", name)?.is_some() {
            return Err(invalid(format!(
                "{name} is dynamic; edit its expression instead"
            )));
        }
        if let Some(i) = index(tree, s.table(), name)? {
            let path = vec![
                Seg::Key(s.table().into()),
                Seg::Index(i),
                Seg::Key(s.key().into()),
            ];
            let result = match s.kind {
                ParameterKind::Flag => kv3::set_scalars(data, &[(path, values[0] as i64)]),
                ParameterKind::Scalar => kv3::set_doubles(data, &[(path, values[0])]),
                _ => kv3::set_doubles(
                    data,
                    &values
                        .iter()
                        .enumerate()
                        .map(|(k, v)| {
                            let mut p = path.clone();
                            p.push(Seg::Index(k));
                            (p, *v)
                        })
                        .collect::<Vec<_>>(),
                ),
            };
            if let Ok(output) = result {
                return Ok(output);
            }
            let paths = if s.width() == 1 {
                vec![(
                    vec![
                        Seg::Key(s.table().into()),
                        Seg::Index(i),
                        Seg::Key(s.key().into()),
                    ],
                    values[0] as f32,
                )]
            } else {
                values
                    .iter()
                    .enumerate()
                    .map(|(k, v)| {
                        (
                            vec![
                                Seg::Key(s.table().into()),
                                Seg::Index(i),
                                Seg::Key(s.key().into()),
                                Seg::Index(k),
                            ],
                            *v as f32,
                        )
                    })
                    .collect()
            };
            if let Ok(output) = kv3::set_floats(data, &paths) {
                return Ok(output);
            }
            let (mut promoted, encoding) =
                kv3::decode_preserving(data).map_err(|e| invalid(e.to_string()))?;
            let value = match s.kind {
                ParameterKind::Flag => Value::Int(values[0] as i64),
                ParameterKind::Scalar => Value::Double(values[0]),
                _ => Value::Array(values.iter().copied().map(Value::Double).collect()),
            };
            let Some(Value::Array(params)) = promoted.get_mut(s.table()) else {
                return Err(invalid("Missing parameter table"));
            };
            *params[i]
                .get_mut(s.key())
                .ok_or_else(|| invalid("Missing parameter value"))? = value;
            let format = kv3::Format::from_payload(data).map_err(|e| invalid(e.to_string()))?;
            kv3::wire::encode_preserving_v5(&promoted, &encoding, &format)
                .map_err(|e| invalid(e.to_string()))
        } else {
            let value = match s.kind {
                ParameterKind::Flag => Value::Int(values[0] as i64),
                ParameterKind::Scalar => Value::Double(values[0]),
                _ => Value::Array(values.iter().copied().map(Value::Double).collect()),
            };
            kv3::insert_array_element_adding(
                data,
                &[Seg::Key(s.table().into())],
                0,
                &Value::Object(vec![
                    ("m_name".into(), Value::String(name.into())),
                    (s.key().into(), value),
                ]),
            )
            .map_err(|e| invalid(e.to_string()))
        }
    })
}
pub fn compile_expression(name: &str, source: &str) -> Result<vfx_expr::CompiledExpr> {
    let spec = parameter_spec(name)?;
    if texture_binding(name).is_some()
        || matches!(spec.kind, ParameterKind::Flag)
        || source.len() > 1024
        || source.trim().is_empty()
    {
        return Err(invalid("Invalid dynamic material expression"));
    }
    let mut depth = 0i32;
    for c in source.chars() {
        if c == '(' {
            depth += 1;
            if depth > 32 {
                return Err(invalid("Expression nesting exceeds 32"));
            }
        } else if c == ')' {
            depth -= 1;
        }
    }
    vfx_expr::compile(source).map_err(|e| invalid(e.to_string()))
}
pub fn set_expression(bytes: &[u8], name: &str, source: &str) -> Result<Vec<u8>> {
    let expr = compile_expression(name, source)?;
    let data = Resource::parse(bytes)
        .map_err(|e| invalid(e.to_string()))?
        .data_block()
        .map_err(|e| invalid(e.to_string()))?;
    let upgraded;
    let bytes = if data.first() != Some(&5) {
        let (tree, encoding) = kv3::decode_preserving(data).map_err(|e| invalid(e.to_string()))?;
        let format = kv3::Format::from_payload(data).map_err(|e| invalid(e.to_string()))?;
        let payload = kv3::wire::encode_preserving_v5(&tree, &encoding, &format)
            .map_err(|e| invalid(e.to_string()))?;
        upgraded = Resource::parse(bytes)
            .and_then(|r| r.rebuild_with_data_preserving(&payload))
            .map_err(|e| invalid(e.to_string()))?;
        &upgraded
    } else {
        bytes
    };
    let mut output = patch_data(bytes, |data, tree| {
        if let Some(i) = index(tree, "m_dynamicParams", name)? {
            let Some(Value::Binary(old)) = array(tree, "m_dynamicParams")[i].get("m_value") else {
                return Err(invalid("Unreadable existing material expression"));
            };
            kv3::set_blob(data, old, &expr.bytecode).map_err(|e| invalid(e.to_string()))
        } else {
            kv3::insert_array_element_adding(
                data,
                &[Seg::Key("m_dynamicParams".into())],
                0,
                &Value::Object(vec![
                    ("m_name".into(), Value::String(name.into())),
                    ("m_value".into(), Value::Binary(expr.bytecode.clone())),
                ]),
            )
            .map_err(|e| invalid(e.to_string()))
        }
    })?;
    for attr in expr.attributes {
        output = patch_data(&output, |data, tree| {
            if array(tree, "m_renderAttributesUsed")
                .iter()
                .any(|v| v.as_str().is_some_and(|s| s.eq_ignore_ascii_case(&attr)))
            {
                return Ok(data.to_vec());
            }
            kv3::insert_array_element_adding(
                data,
                &[Seg::Key("m_renderAttributesUsed".into())],
                0,
                &Value::String(attr),
            )
            .map_err(|e| invalid(e.to_string()))
        })?;
    }
    Ok(output)
}

pub fn texture_binding(name: &str) -> Option<(&'static str, &'static [(usize, usize)])> {
    Some(match name {
        "TextureNormal1" => ("g_tNormalRoughness", &[(0, 0), (1, 1)]),
        "TextureAmbientOcclusion1" => ("g_tAmbientOcclusion", &[(0, 0)]),
        "TextureSelfIllumMask1" => ("g_tSelfIllumMask", &[(0, 0)]),
        "TextureRimLightMask1" => ("g_tTintMaskRimLightMask", &[(1, 0)]),
        "TextureNprTramsissiveColor1" => ("g_tNprTransmissiveColor", &[(0, 0), (1, 1), (2, 2)]),
        _ => return None,
    })
}
pub fn texture_path<'a>(tree: &'a Value, slot: &str) -> Option<&'a str> {
    array(tree, "m_textureParams")
        .iter()
        .find(|p| p.get("m_name").and_then(Value::as_str) == Some(slot))?
        .get("m_pValue")?
        .as_str()
}
