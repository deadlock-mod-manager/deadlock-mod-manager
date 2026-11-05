use super::*;
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect())
}

#[test]
fn resized_painted_texture_keeps_rgb_under_zero_material_mask_alpha() {
    let original = source2::texture::encode_vtex_png_rgba8888(
        &source2::Image {
            width: 2,
            height: 2,
            data: ImageData::Rgba8([80, 100, 120, 255].repeat(4)),
        },
        source2::texture::format::TextureFlags::empty(),
    )
    .unwrap();
    let pixels = [80, 100, 120, 0].repeat(16);
    let replacement = source2::Image {
        width: 4,
        height: 4,
        data: ImageData::Rgba8(pixels.clone()),
    };
    let edited =
        edit_texture_with_image(&original, TextureEdit::default(), Some(replacement)).unwrap();
    let decoded = source2::decode(&edited).unwrap();
    let ImageData::Rgba8(actual) = decoded.data else {
        panic!("LDR required");
    };
    assert_eq!(
        actual, pixels,
        "PBR alpha stores material masks; zero alpha must not erase albedo RGB"
    );
}
fn resource(blocks: Vec<([u8; 4], Vec<u8>)>, tail: &[u8]) -> Vec<u8> {
    let blocks: Vec<_> = blocks
        .iter()
        .map(|(kind, bytes)| (*kind, bytes.as_slice()))
        .collect();
    source2::resource::build_resource_with_tail(&blocks, tail, 1).unwrap()
}
fn mesh() -> Vec<u8> {
    let draws = ["materials/red.vmat", "materials/blue.vmat"].map(|name| {
        object(vec![
            ("m_material", Value::String(name.into())),
            ("m_nIndexCount", Value::Int(30)),
            ("untouched", Value::Int(73)),
        ])
    });
    let tree = object(vec![(
        "m_sceneObjects",
        Value::Array(vec![object(vec![(
            "m_drawCalls",
            Value::Array(draws.to_vec()),
        )])]),
    )]);
    resource(
        vec![
            (*b"MDAT", kv3::encode(&tree, &kv3::Format([9; 16]))),
            (*b"ANIM", vec![1, 2, 3]),
        ],
        &[],
    )
}
#[test]
fn hiding_materials_preserves_animation_and_unrelated_draws_and_rejects_all_hidden() {
    let original = mesh();
    let edited = hide_materials(&original, &["materials/red.vmat".into()]).unwrap();
    let resource = Resource::parse(&edited).unwrap();
    assert_eq!(resource.find_block(*b"ANIM"), Some([1, 2, 3].as_slice()));
    let tree = kv3::decode(resource.find_block(*b"MDAT").unwrap()).unwrap();
    let draws = array(&array(&tree, "m_sceneObjects")[0], "m_drawCalls");
    assert_eq!(
        draws[0].get("m_nIndexCount").and_then(Value::as_int),
        Some(0)
    );
    assert_eq!(
        draws[1].get("m_nIndexCount").and_then(Value::as_int),
        Some(30)
    );
    assert_eq!(draws[0].get("untouched").and_then(Value::as_int), Some(73));
    assert!(
        hide_materials(
            &original,
            &["materials/red.vmat".into(), "materials/blue.vmat".into()]
        )
        .is_err()
    );
    assert!(hide_materials(&original, &["materials/nope.vmat".into()]).is_err());
}
#[test]
fn albedo_edits_preserve_opacity_and_finish_preserves_normal_channels() {
    let image = source2::Image {
        width: 2,
        height: 2,
        data: ImageData::Rgba8([255, 0, 0, 77].repeat(4)),
    };
    let original = source2::texture::encode_vtex_png_rgba8888(
        &image,
        source2::texture::format::TextureFlags::empty(),
    )
    .unwrap();
    let edited = edit_texture(
        &original,
        TextureEdit {
            recolor: Some([120., 1., 1.]),
            ..Default::default()
        },
    )
    .unwrap();
    let ImageData::Rgba8(pixels) = source2::decode(&edited).unwrap().data else {
        panic!("LDR")
    };
    assert_eq!(pixels, [0, 255, 0, 77].repeat(4));
    let edited = edit_texture(
        &original,
        TextureEdit {
            channels: [None, None, Some(0.5), None],
            ..Default::default()
        },
    )
    .unwrap();
    let ImageData::Rgba8(pixels) = source2::decode(&edited).unwrap().data else {
        panic!("LDR")
    };
    assert_eq!(pixels, [255, 0, 128, 77].repeat(4));
    assert!(
        edit_texture(
            &original,
            TextureEdit {
                channels: [Some(f64::NAN), None, None, None],
                ..Default::default()
            }
        )
        .is_err()
    );
}
#[test]
fn paint_keeps_neutrals_and_scales_linear_brightness() {
    assert_eq!(paint([0.5; 3], [100., 2., 0.5]), [0.25; 3]);
    assert_eq!(paint([1., 0., 0.], [120., 1., 1.]), [0., 1., 0.]);
    assert!((linear(srgb(0.25)) - 0.25).abs() < 1e-8);
}

#[test]
fn padded_material_textures_keep_logical_dimensions_and_all_mips_when_edited() {
    let mut header = vec![0; 58];
    header[..2].copy_from_slice(&1u16.to_le_bytes());
    header[20..22].copy_from_slice(&4u16.to_le_bytes());
    header[22..24].copy_from_slice(&4u16.to_le_bytes());
    header[24..26].copy_from_slice(&1u16.to_le_bytes());
    header[26] = 4;
    header[27] = 3;
    header[32..36].copy_from_slice(&8u32.to_le_bytes());
    header[36..40].copy_from_slice(&1u32.to_le_bytes());
    header[40..44].copy_from_slice(&3u32.to_le_bytes());
    header[44..48].copy_from_slice(&8u32.to_le_bytes());
    header[48..52].copy_from_slice(&6u32.to_le_bytes());
    header[54..56].copy_from_slice(&1u16.to_le_bytes());
    header[56..58].copy_from_slice(&1u16.to_le_bytes());
    let pixels = [120, 80, 40, 77].repeat(21);
    let original = resource(vec![(*b"DATA", header.clone())], &pixels);
    assert!(
        texture_editable(&original),
        "Padded 1x1 material constants must be editable"
    );
    let edited = edit_texture(
        &original,
        TextureEdit {
            channels: [None, None, Some(0.5), None],
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        Resource::parse(&edited).unwrap().data_block().unwrap(),
        header
    );
    let info = source2::inspect(&edited).unwrap();
    assert_eq!(
        (
            info.width,
            info.height,
            info.actual_width,
            info.actual_height,
            info.mip_count
        ),
        (4, 4, 1, 1, 3)
    );
    for mip in 0..3 {
        let image = source2::decode_at(
            &edited,
            &source2::DecodeOptions {
                mip,
                ..Default::default()
            },
        )
        .unwrap();
        let ImageData::Rgba8(bytes) = image.data else {
            panic!("LDR")
        };
        assert!(
            bytes
                .chunks_exact(4)
                .all(|pixel| pixel == [120, 80, 128, 77]),
            "mip {mip}"
        );
    }
}

#[test]
fn dynamic_material_patches_register_inputs_preserve_wire_data_and_reject_conflicts() {
    use super::material::*;
    let tree = object(vec![
        ("m_shaderName", Value::String("pbr.vfx".into())),
        ("m_intParams", Value::Array(vec![])),
        (
            "m_floatParams",
            Value::Array(vec![object(vec![
                ("m_name", Value::String("g_flSelfIllumScale1".into())),
                ("m_flValue", Value::Double(1.)),
            ])]),
        ),
        ("m_vectorParams", Value::Array(vec![])),
        ("m_dynamicParams", Value::Array(vec![])),
        ("m_renderAttributesUsed", Value::Array(vec![])),
        (
            "untouched",
            object(vec![(
                "asset",
                Value::String("textures/original.vtex".into()),
            )]),
        ),
    ]);
    let original = resource(
        vec![
            (*b"DATA", kv3::encode(&tree, &kv3::Format([7; 16]))),
            (*b"RERL", vec![7, 6, 5, 4]),
        ],
        &[],
    );
    let static_edit = set_parameter(&original, "g_flSelfIllumScale1", &[0.5]).unwrap();
    let flags = set_parameter(&static_edit, "F_USE_STATUS_EFFECTS_PROXY", &[1.]).unwrap();
    let expression = "(1 - saturate($ent_health)) * 10";
    let edited = set_expression(&flags, "g_flSelfIllumScale1", expression).unwrap();
    let edited = set_expression(
        &edited,
        "g_vColorTint1",
        "$ability_active ? float3(1,0,0) : float3(1,1,1)",
    )
    .unwrap();
    let r = Resource::parse(&edited).unwrap();
    assert_eq!(r.find_block(*b"RERL"), Some([7, 6, 5, 4].as_slice()));
    let data = r.data_block().unwrap();
    assert_eq!(data[0], 5);
    let tree = kv3::decode(data).unwrap();
    assert_eq!(array(&tree, "m_renderAttributesUsed").len(), 2);
    assert!(
        material_expressions(&tree)
            .iter()
            .any(|(n, s)| n == "g_flSelfIllumScale1" && s == expression)
    );
    assert!(tree.get("untouched").is_some());
    assert!(set_parameter(&edited, "g_flSelfIllumScale1", &[0.2]).is_err());
    assert!(set_parameter(&edited, "F_UNLIT", &[1.]).is_ok());
    let changed = set_expression(&edited, "g_flSelfIllumScale1", "2 + sin(time())").unwrap();
    assert_eq!(
        material_expressions(
            &kv3::decode(Resource::parse(&changed).unwrap().data_block().unwrap()).unwrap()
        )
        .len(),
        2
    );
    assert!(validate_parameter("g_flSelfIllumScale1", &[f64::NAN]).is_err());
    assert!(validate_parameter("F_UNLIT", &[0.5]).is_err());
    assert!(compile_expression("TextureNormal1", "float3(1,1,1)").is_err());
    assert!(
        compile_expression(
            "g_flSelfIllumScale1",
            &format!("{}1{}", "(".repeat(40), ")".repeat(40))
        )
        .is_err()
    );
}

#[test]
fn painting_constant_textures_produces_detail_without_changing_packed_alpha() {
    let image = source2::Image {
        width: 1,
        height: 1,
        data: ImageData::Rgba8(vec![180, 160, 140, 77]),
    };
    let original = source2::texture::encode_vtex_png_rgba8888(
        &image,
        source2::texture::format::TextureFlags::empty(),
    )
    .unwrap();
    let edited = edit_texture(
        &original,
        TextureEdit {
            pattern: Some(crate::Pattern::new(crate::PatternStyle::Liquid, 0.8, 0.2)),
            ..Default::default()
        },
    )
    .unwrap();
    let decoded = source2::decode(&edited).unwrap();
    assert_eq!((decoded.width, decoded.height), (256, 256));
    let ImageData::Rgba8(pixels) = decoded.data else {
        panic!("LDR")
    };
    assert!(pixels.chunks_exact(4).all(|p| p[3] == 77));
    assert!(pixels.chunks_exact(4).any(|p| p != &pixels[..4]));
}

#[test]
fn textures_over_one_megabyte_remain_editable_within_the_decoded_pixel_budget() {
    let mut seed = 23u32;
    let pixels: Vec<u8> = (0..1024 * 512 * 4)
        .map(|_| {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            seed as u8
        })
        .collect();
    let image = source2::Image {
        width: 1024,
        height: 512,
        data: ImageData::Rgba8(pixels),
    };
    let original = source2::texture::encode_vtex_png_rgba8888(
        &image,
        source2::texture::format::TextureFlags::empty(),
    )
    .unwrap();
    assert!(original.len() > 1024 * 1024);
    assert!(texture_editable(&original));
    let edited = edit_texture(
        &original,
        TextureEdit {
            channels: [Some(0.5), None, None, None],
            ..Default::default()
        },
    )
    .unwrap();
    let decoded = source2::decode(&edited).unwrap();
    assert_eq!((decoded.width, decoded.height), (1024, 512));
    let ImageData::Rgba8(pixels) = decoded.data else {
        panic!("Expected an LDR texture")
    };
    assert!(pixels.chunks_exact(4).all(|pixel| pixel[0] == 128));
}

#[test]
fn oversized_texture_headers_are_rejected_before_decoding_pixels() {
    let mut header = vec![0; 40];
    header[..2].copy_from_slice(&1u16.to_le_bytes());
    header[20..22].copy_from_slice(&8192u16.to_le_bytes());
    header[22..24].copy_from_slice(&4096u16.to_le_bytes());
    header[24..26].copy_from_slice(&1u16.to_le_bytes());
    header[26] = 4;
    header[27] = 1;
    let original = resource(vec![(*b"DATA", header)], &[]);
    assert!(!texture_editable(&original));
    assert!(edit_texture(&original, TextureEdit::default()).is_err());
}
