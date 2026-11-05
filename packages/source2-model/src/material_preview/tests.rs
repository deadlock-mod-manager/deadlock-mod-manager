use super::properties::{material_preview_properties_from_data, texture_param_score};
use super::textures::{decode_normal_pixel, preview_dimensions};
use super::*;
use crate::{DecodedTexture, VtexFormat, VtexHeader, decode_model_render_model, kv3, resource};
use std::path::Path;

#[cfg(test)]
mod material_channel_tests {
    use super::*;

    #[test]
    fn hemi_oct_flat_normal_and_tilt_match_source_basis() {
        assert_eq!(
            decode_normal_pixel([128, 128, 32, 240], true),
            [128, 128, 255, 255]
        );
        let tilted = decode_normal_pixel([192, 64, 255, 0], true);
        assert_eq!(tilted[0], 128);
        assert!(tilted[1] < 40);
        assert!(tilted[2] > 200);
    }

    #[test]
    fn roughness_reads_the_declared_channel() {
        let input = DecodedTexture {
            width: 1,
            height: 1,
            rgba: vec![10, 20, 30, 240],
        };
        for (channel, expected) in [(2, 30), (3, 240), (1, 20)] {
            let png = pack_orm_png(Some(&input), channel, None, None, 0).unwrap();
            let image = image::load_from_memory(&png).unwrap().to_rgba8();
            assert_eq!(image.get_pixel(0, 0).0, [255, expected, 255, 255]);
        }
    }
}

#[cfg(test)]
mod color_texture_selection_tests {
    use super::texture_param_score;

    #[test]
    fn surface_albedo_wins_over_npr_transmission() {
        let albedo = texture_param_score("g_tColor", "materials/red/hb_torso.vtex");
        let transmission = texture_param_score(
            "g_tNprTransmissiveColor",
            "materials/red/red-torso_vmat_g_tnprtransmissivecolor.vtex",
        );
        assert!(albedo > transmission);
        assert_eq!(transmission, 0);
    }

    #[test]
    fn explicit_placeholder_albedo_keeps_its_role() {
        assert!(texture_param_score("g_tColor", "materials/default/default_mask.vtex") > 0);
        assert!(texture_param_score("g_tNormalRoughness", "normal.vtex") <= 0);
    }
}

#[cfg(test)]
mod material_semantics_tests {
    use super::*;
    use kv3::KvValue;

    #[test]
    #[ignore = "requires installed game assets via DMM_VIEWER_TEST_VPK"]
    fn local_animated_material_reference_set() {
        let path = std::env::var("DMM_VIEWER_TEST_VPK").expect("DMM_VIEWER_TEST_VPK");
        let archive = VpkArchive::open(Path::new(&path)).unwrap();
        let entries = archive.list_entries();
        for (hero, surface) in [
            ("inferno", "flame"),
            ("lash", "sparkle"),
            ("viscous", "glass"),
            ("haze", "smoke"),
        ] {
            let candidates = entries
                .iter()
                .filter(|path| {
                    path.starts_with("models/")
                        && path.ends_with(".vmat_c")
                        && path.contains(hero)
                        && path.contains(surface)
                })
                .take(4)
                .collect::<Vec<_>>();
            assert!(!candidates.is_empty(), "missing reference {hero}/{surface}");
            let mut decoded = 0;
            for path in candidates {
                if let Some(properties) = material_preview_properties(&archive, path) {
                    let effect = &properties.source2_effect;
                    println!(
                        "{path}: shader={} emission={:?} scroll={:?} jitter={:?}",
                        effect.shader,
                        effect.floats.get("g_flSelfIllumScale1"),
                        effect.vectors.get("g_vSelfIllumScrollSpeed1"),
                        effect.flags.get("F_JITTER_VERTICES")
                    );
                    let textures = decode_material_previews(
                        &archive,
                        std::iter::once((path.to_string(), properties)),
                        1024,
                    );
                    assert_eq!(textures.len(), 1, "texture decode failed: {path}");
                    assert!(!textures[0].png.is_empty());
                    assert_eq!(
                        textures[0].source2_effect.as_ref().unwrap().material,
                        path.as_str()
                    );
                    if path.contains("inferno_flame0") {
                        assert!(textures[0].effect_mask_png.is_some(), "missing jitter mask");
                    }
                    if path.contains("lash_sparkles") {
                        assert!(
                            textures[0].emissive_png.is_some(),
                            "missing sparkle emission"
                        );
                    }
                    decoded += 1;
                } else {
                    println!("{path}: no preview material");
                }
            }
            assert!(decoded > 0, "no decodable {hero}/{surface} materials");
        }
    }

    fn object(fields: Vec<(&str, KvValue)>) -> KvValue {
        KvValue::Object(
            fields
                .into_iter()
                .map(|(key, value)| (key.to_string(), value))
                .collect(),
        )
    }

    fn material(shader: &str, textures: &[(&str, &str)], flags: &[(&str, i64)]) -> KvValue {
        object(vec![
            ("m_shaderName", KvValue::String(shader.to_string())),
            (
                "m_textureParams",
                KvValue::Array(
                    textures
                        .iter()
                        .map(|(name, path)| {
                            object(vec![
                                ("m_name", KvValue::String(name.to_string())),
                                ("m_pValue", KvValue::String(path.to_string())),
                            ])
                        })
                        .collect(),
                ),
            ),
            (
                "m_intParams",
                KvValue::Array(
                    flags
                        .iter()
                        .map(|(name, value)| {
                            object(vec![
                                ("m_name", KvValue::String(name.to_string())),
                                ("m_nValue", KvValue::Int(*value)),
                            ])
                        })
                        .collect(),
                ),
            ),
        ])
    }

    #[test]
    fn animated_material_parameters_survive_the_preview_boundary() {
        let mut data = material(
            "citadel_effects.vfx",
            &[("g_tColor", "flame.vtex"), ("g_tJitterMask", "mask.vtex")],
            &[("F_ADDITIVE_BLEND", 1)],
        );
        if let KvValue::Object(fields) = &mut data {
            fields.insert(
                "m_floatParams".to_string(),
                KvValue::Array(vec![object(vec![
                    ("m_name", KvValue::String("g_flJitterSpeedA".to_string())),
                    ("m_flValue", KvValue::Float(2.5)),
                ])]),
            );
            fields.insert(
                "m_vectorParams".to_string(),
                KvValue::Array(vec![object(vec![
                    (
                        "m_name",
                        KvValue::String("g_vAlbedoScrollSpeed".to_string()),
                    ),
                    (
                        "m_value",
                        KvValue::Array(vec![
                            KvValue::Float(0.25),
                            KvValue::Float(-0.5),
                            KvValue::Float(0.0),
                            KvValue::Float(0.0),
                        ]),
                    ),
                ])]),
            );
        }
        let effect = material_preview_properties_from_data(&data)
            .unwrap()
            .source2_effect;
        assert_eq!(effect.shader, "citadel_effects.vfx");
        assert_eq!(effect.floats["g_flJitterSpeedA"], 2.5);
        assert_eq!(
            effect.vectors["g_vAlbedoScrollSpeed"],
            [0.25, -0.5, 0.0, 0.0]
        );
        assert_eq!(effect.flags["F_ADDITIVE_BLEND"], 1);
        assert_eq!(effect.textures["g_tJitterMask"], "mask.vtex_c");
        let exported = serde_json::to_value(effect).unwrap();
        assert_eq!(exported["floats"]["g_flJitterSpeedA"], 2.5);
    }

    fn rgba_resource(pixel: [u8; 4]) -> Resource {
        let mut data = vec![0u8; 40];
        data[20..22].copy_from_slice(&1u16.to_le_bytes());
        data[22..24].copy_from_slice(&1u16.to_le_bytes());
        data[24..26].copy_from_slice(&1u16.to_le_bytes());
        data[26] = VtexFormat::Rgba8888 as u8;
        data[27] = 1;
        data.extend_from_slice(&pixel);
        Resource {
            data,
            blocks: vec![resource::ResourceBlock {
                name: "DATA".to_string(),
                offset: 0,
                size: 40,
            }],
        }
    }

    #[test]
    fn glb_embeds_effect_parameters_and_linear_mask_texture_reference() {
        let mut texture = decode_texture_preview_resource(
            "color.vtex_c".into(),
            Some("effect.vmat_c".into()),
            &rgba_resource([255; 4]),
            true,
            1024,
        )
        .unwrap();
        texture.source2_effect = Some(
            material_preview_properties_from_data(&material(
                "pbr.vfx",
                &[("g_tColor", "color.vtex")],
                &[("F_ADDITIVE_BLEND", 1)],
            ))
            .unwrap()
            .source2_effect,
        );
        texture.effect_mask_png = Some(texture.png.clone());
        let primitive = vmesh::GlbPrimitive {
            positions: &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            normals: None,
            texcoords: Some(&[0.0, 0.0, 1.0, 0.0, 0.0, 1.0]),
            colors: None,
            joints: None,
            weights: None,
            indices: &[0, 0, 1, 0, 2, 0],
            index_component: 5123,
            material: 1,
            mesh_group_mask: 0,
        };
        let glb = vmesh::build_glb(&[primitive], &[texture], None, None).unwrap();
        let length = u32::from_le_bytes(glb[12..16].try_into().unwrap()) as usize;
        let json: serde_json::Value = serde_json::from_slice(&glb[20..20 + length]).unwrap();
        let effect = &json["materials"][1]["extras"]["source2Effect"];
        assert_eq!(effect["shader"], "pbr.vfx");
        assert_eq!(effect["flags"]["F_ADDITIVE_BLEND"], 1);
        let mask = effect["maskTexture"].as_u64().unwrap() as usize;
        assert!(json["textures"][mask]["source"].is_number());
        assert_eq!(json["images"].as_array().unwrap().len(), 2);
    }

    fn animated_material() -> KvValue {
        let mut data = material(
            "pbr.vfx",
            &[("g_tColor", "atlas.vtex")],
            &[("F_ENABLE_TEXTURE_TRANSFORMS", 1)],
        );
        let KvValue::Object(fields) = &mut data else {
            unreachable!()
        };
        fields.insert(
            "m_vectorParams".into(),
            KvValue::Array(vec![object(vec![
                ("m_name", KvValue::String("g_vAlbedoTexcoordScale1".into())),
                (
                    "m_value",
                    KvValue::Array([0.5, 1., 0., 0.].into_iter().map(KvValue::Float).collect()),
                ),
            ])]),
        );
        fields.insert(
            "m_dynamicParams".into(),
            KvValue::Array(vec![object(vec![
                ("m_name", KvValue::String("g_vAlbedoTexcoordOffset1".into())),
                ("m_value", KvValue::Binary(vec![7, 0, 0, 0, 0, 0])),
            ])]),
        );
        fields.insert("m_stringAttributes".into(),KvValue::Array(vec![object(vec![("m_name",KvValue::String("DmmAnimatedAlbedo".into())),("m_value",KvValue::String(r#"{"version":1,"scale":[0.5,1.0],"offsets":[[0.0,0.0],[0.5,0.0]],"durationsMs":[30,90],"plays":0}"#.into()))])]));
        data
    }
    fn animated_glb(data: &KvValue) -> serde_json::Value {
        let mut texture = decode_texture_preview_resource(
            "atlas.vtex_c".into(),
            Some("animated.vmat_c".into()),
            &rgba_resource([255; 4]),
            true,
            1024,
        )
        .unwrap();
        texture.source2_effect = Some(
            material_preview_properties_from_data(data)
                .unwrap()
                .source2_effect,
        );
        let primitive = vmesh::GlbPrimitive {
            positions: &[0., 0., 0., 1., 0., 0., 0., 1., 0.],
            normals: None,
            texcoords: Some(&[0., 0., 1., 0., 0., 1.]),
            colors: None,
            joints: None,
            weights: None,
            indices: &[0, 0, 1, 0, 2, 0],
            index_component: 5123,
            material: 1,
            mesh_group_mask: 0,
        };
        let glb = vmesh::build_glb(&[primitive], &[texture], None, None).unwrap();
        let length = u32::from_le_bytes(glb[12..16].try_into().unwrap()) as usize;
        serde_json::from_slice(&glb[20..20 + length]).unwrap()
    }
    #[test]
    fn glb_preserves_managed_atlas_offsets_and_unequal_frame_durations() {
        let json = animated_glb(&animated_material());
        let animation = &json["materials"][1]["extras"]["source2Effect"]["animatedAlbedo"];
        assert_eq!(animation["scale"], serde_json::json!([0.5, 1.]));
        assert_eq!(
            animation["offsets"],
            serde_json::json!([[0., 0.], [0.5, 0.]])
        );
        assert_eq!(animation["durationsMs"], serde_json::json!([30, 90]));
        assert_eq!(animation["plays"], 0);
        let mut disabled = animated_material();
        if let KvValue::Object(fields) = &mut disabled {
            fields.insert("m_intParams".into(), KvValue::Array(Vec::new()));
        }
        assert!(super::super::metadata::animated_albedo(&disabled).is_none());
        let mut invalid = animated_material();
        if let KvValue::Object(fields) = &mut invalid {
            fields.remove("m_dynamicParams");
        }
        assert!(super::super::metadata::animated_albedo(&invalid).is_none());
        if let KvValue::Object(fields) = &mut invalid {
            fields.insert(
                "m_shaderName".into(),
                KvValue::String("unverified.vfx".into()),
            );
        }
        assert!(super::super::metadata::animated_albedo(&invalid).is_none());
    }
    #[test]
    fn malformed_or_unmatched_atlas_metadata_is_ignored() {
        for invalid in [
            serde_json::json!({"version":2,"scale":[0.5,1.0],"offsets":[[0.0,0.0],[0.5,0.0]],"durationsMs":[30,90],"plays":0}),
            serde_json::json!({"version":1,"scale":[0.5,1.0],"offsets":[[0.0,0.0],[0.5,0.0]],"durationsMs":[30],"plays":0}),
            serde_json::json!({"version":1,"scale":[0.5,1.0],"offsets":[[0.0,0.0],[0.9,0.0]],"durationsMs":[30,90],"plays":0}),
            serde_json::json!({"version":1,"scale":[0.25,1.0],"offsets":[[0.0,0.0],[0.5,0.0]],"durationsMs":[30,90],"plays":0}),
            serde_json::json!({"version":1,"scale":[0.5,1.0],"offsets":[[0.0,0.0],[0.5,0.0]],"durationsMs":[0,90],"plays":0}),
            serde_json::json!({"version":1,"scale":[0.5,1.0],"offsets":[[0.0,0.0],[0.5,0.0]],"durationsMs":[30,90],"plays":1}),
        ] {
            let mut data = animated_material();
            let KvValue::Object(fields) = &mut data else {
                unreachable!()
            };
            fields.insert(
                "m_stringAttributes".into(),
                KvValue::Array(vec![object(vec![
                    ("m_name", KvValue::String("DmmAnimatedAlbedo".into())),
                    ("m_value", KvValue::String(invalid.to_string())),
                ])]),
            );
            assert!(super::super::metadata::animated_albedo(&data).is_none());
        }
    }
    #[test]
    #[ignore = "Requires DMM_ANIMATION_PROOF_OUTPUT native fixture directory"]
    fn native_baked_material_atlas_metadata_survives_glb_export() {
        let path =
            std::env::var("DMM_ANIMATION_PROOF_OUTPUT").expect("Set native fixture directory");
        let resource =
            Resource::parse(std::fs::read(Path::new(&path).join("animated.vmat_c")).unwrap())
                .unwrap();
        let data = kv3::parse(resource.block_bytes("DATA").unwrap()).unwrap();
        let json = animated_glb(&data);
        let animation = &json["materials"][1]["extras"]["source2Effect"]["animatedAlbedo"];
        assert_eq!(animation["durationsMs"], serde_json::json!([30, 90]));
        assert_eq!(animation["offsets"].as_array().unwrap().len(), 2);
    }

    fn pixel(png: &[u8]) -> [u8; 4] {
        image::load_from_memory(png)
            .unwrap()
            .to_rgba8()
            .get_pixel(0, 0)
            .0
    }

    #[test]
    fn thumbnail_decode_selects_a_small_mip_and_full_preview_keeps_the_top_mip() {
        let mut resource = rgba_resource([0; 4]);
        resource.data[20..22].copy_from_slice(&512u16.to_le_bytes());
        resource.data[22..24].copy_from_slice(&256u16.to_le_bytes());
        resource.data[27] = 2;
        resource.data.truncate(40);
        resource
            .data
            .extend_from_slice(&[0, 255, 0, 255].repeat(256 * 128));
        resource
            .data
            .extend_from_slice(&[255, 0, 0, 255].repeat(512 * 256));
        let small = decode_rgba(&resource, 256).unwrap();
        let full = decode_rgba(&resource, 1024).unwrap();
        assert_eq!((small.width, small.height), (256, 128));
        assert_eq!((full.width, full.height), (512, 256));
        assert_eq!(&small.rgba[..4], &[0, 255, 0, 255]);
        assert_eq!(&full.rgba[..4], &[255, 0, 0, 255]);
    }

    #[test]
    fn pbr_tint_is_linear_once_and_dynamic_color_keeps_the_fallback() {
        let mut data = material("pbr.vfx", &[("g_tColor", "color.vtex")], &[]);
        let KvValue::Object(fields) = &mut data else {
            unreachable!()
        };
        fields.insert(
            "m_vectorParams".into(),
            KvValue::Array(vec![object(vec![
                ("m_name", KvValue::String("g_vColorTint1".into())),
                (
                    "m_value",
                    KvValue::Array(vec![
                        KvValue::Float(0.5),
                        KvValue::Float(0.25),
                        KvValue::Float(1.),
                        KvValue::Float(0.1),
                    ]),
                ),
            ])]),
        );
        let props = material_preview_properties_from_data(&data).unwrap();
        assert!((props.base_color_factor[0] - 0.214041).abs() < 1e-5);
        assert_eq!(props.base_color_factor[3], 1.);
        assert_eq!(
            props.source2.color.unwrap().tint,
            props.base_color_factor[..3]
        );
        let KvValue::Object(fields) = &mut data else {
            unreachable!()
        };
        fields.insert(
            "m_dynamicParams".into(),
            KvValue::Array(vec![object(vec![(
                "m_name",
                KvValue::String("g_vColorTint1".into()),
            )])]),
        );
        assert!(
            material_preview_properties_from_data(&data)
                .unwrap()
                .source2
                .color
                .is_none()
        );
    }

    #[test]
    fn white_tint_masks_are_only_needed_for_authored_vertex_color() {
        let props = material_preview_properties_from_data(&material(
            "pbr.vfx",
            &[("g_tColor", "color.vtex")],
            &[],
        ))
        .unwrap();
        let mut color = props.source2.color.unwrap();
        assert!(!color.needs_tint_mask(false));
        assert!(color.needs_tint_mask(true));
        color.vertex_color_strength = 0.;
        assert!(!color.needs_tint_mask(true));
        color.tint = [0.5, 1., 1.];
        assert!(color.needs_tint_mask(false));
        color.mask_color_tint = false;
        assert!(!color.needs_tint_mask(false));
        color.mask_color_tint = true;
        color.tint = [1.; 3];
        color.tint_mode = 2;
        assert!(color.needs_tint_mask(false));
    }

    #[test]
    fn additive_albedo_keeps_opacity_and_npr_uses_its_authored_tint_mask() {
        let mut data = material(
            "pbr.vfx",
            &[
                ("g_tColor", "color.vtex"),
                ("g_tTintMask", "ordinary.vtex"),
                ("g_tTintMaskRimLightMask", "npr.vtex"),
            ],
            &[
                ("F_ADDITIVE_BLEND", 1),
                ("F_USE_NPR_LIGHTING", 1),
                ("F_UNLIT", 1),
            ],
        );
        let KvValue::Object(fields) = &mut data else {
            unreachable!()
        };
        fields.insert(
            "m_floatParams".into(),
            KvValue::Array(vec![object(vec![
                ("m_name", KvValue::String("g_flOpacityScale1".into())),
                ("m_flValue", KvValue::Float(0.35)),
            ])]),
        );
        let props = material_preview_properties_from_data(&data).unwrap();
        assert!(matches!(props.alpha_mode, vmesh::MaterialAlphaMode::Blend));
        assert!(matches!(
            props.source2.blend_mode,
            super::super::metadata::Source2BlendMode::Additive
        ));
        assert!(props.source2.unlit);
        assert_eq!(props.base_color_factor[3], 0.35);
        assert_eq!(props.tint_mask_texture.as_deref(), Some("npr.vtex_c"));
        assert!(props.metalness_texture.is_none());
    }

    #[test]
    fn vtex_reflectivity_is_read_in_linear_space_without_gamma_conversion() {
        let mut resource = rgba_resource([0, 0, 0, 255]);
        for (index, value) in [0.1f32, 0.3, 0.7].iter().enumerate() {
            resource.data[4 + index * 4..8 + index * 4].copy_from_slice(&value.to_le_bytes());
        }
        assert_eq!(
            super::super::metadata::reflectivity(&resource),
            Some([0.1, 0.3, 0.7])
        );
        resource.data[4..8].copy_from_slice(&f32::NAN.to_le_bytes());
        assert!(super::super::metadata::reflectivity(&resource).is_none());
    }

    #[test]
    fn glb_carries_versioned_color_metadata_extra_masks_and_unlit_extension() {
        let source = rgba_resource([100, 100, 100, 255]);
        let mut texture = decode_texture_preview_resource(
            "color".into(),
            Some("hero.vmat".into()),
            &source,
            true,
            1024,
        )
        .unwrap();
        let data = material("pbr.vfx", &[("g_tColor", "color.vtex")], &[("F_UNLIT", 1)]);
        texture.source2 = Some(
            material_preview_properties_from_data(&data)
                .unwrap()
                .source2,
        );
        texture.tint_mask_png = Some(texture.png.clone());
        let primitive = vmesh::GlbPrimitive {
            positions: &[0., 0., 0., 1., 0., 0., 0., 1., 0.],
            normals: None,
            texcoords: Some(&[0., 0., 1., 0., 0., 1.]),
            colors: None,
            joints: None,
            weights: None,
            indices: &[0, 0, 1, 0, 2, 0],
            index_component: 5123,
            material: 1,
            mesh_group_mask: u64::MAX,
        };
        let glb = vmesh::build_glb(&[primitive], &[texture], None, None).unwrap();
        let len = u32::from_le_bytes(glb[12..16].try_into().unwrap()) as usize;
        let json: serde_json::Value = serde_json::from_slice(&glb[20..20 + len]).unwrap();
        let material = &json["materials"][1];
        assert_eq!(material["extras"]["sourceMaterial"], "hero.vmat");
        assert_eq!(material["extras"]["source2"]["schemaVersion"], 1);
        assert_eq!(material["extras"]["source2"]["color"]["tintMaskTexture"], 1);
        assert_eq!(json["textures"].as_array().unwrap().len(), 2);
        assert_eq!(
            material["extensions"]["KHR_materials_unlit"],
            serde_json::json!({})
        );
        assert!(
            json["extensionsUsed"]
                .as_array()
                .unwrap()
                .iter()
                .any(|value| value == "KHR_materials_unlit")
        );
    }

    #[test]
    fn orm_role_selects_channels_even_without_an_orm_filename() {
        let data = material(
            "custom.vfx",
            &[
                ("g_tColor", "color.vtex"),
                ("g_tORM", "textures/packed_17.vtex"),
            ],
            &[],
        );
        let props = material_preview_properties_from_data(&data).unwrap();
        assert_eq!(
            props.roughness_texture.as_deref(),
            Some("textures/packed_17.vtex_c")
        );
        assert_eq!(props.roughness_channel, 1);
        assert_eq!(props.metalness_channel, 2);
        assert_eq!(props.occlusion_texture, props.roughness_texture);
        assert_eq!(props.metalness_texture, props.roughness_texture);
        let packed = DecodedTexture {
            width: 1,
            height: 1,
            rgba: vec![11, 77, 189, 23],
        };
        let png = pack_orm_png(
            Some(&packed),
            props.roughness_channel,
            Some(&packed),
            Some(&packed),
            props.metalness_channel,
        )
        .unwrap();
        assert_eq!(pixel(&png), [11, 77, 189, 255]);
    }

    #[test]
    fn roughness_role_overrides_a_misleading_orm_filename() {
        let data = material(
            "custom.vfx",
            &[
                ("g_tColor", "color.vtex"),
                ("g_tRoughness", "textures/looks_like_orm.vtex"),
                ("g_tMasks1", "textures/extra_orm.vtex"),
            ],
            &[],
        );
        let props = material_preview_properties_from_data(&data).unwrap();
        assert_eq!(props.roughness_channel, 0);
        assert_eq!(
            props.roughness_texture.as_deref(),
            Some("textures/looks_like_orm.vtex_c")
        );
        assert!(props.occlusion_texture.is_none());
        assert!(props.metalness_texture.is_none());
    }

    #[test]
    fn pbr_roughness_comes_from_combined_normal_blue_not_alpha() {
        let data = material(
            "PBR.VFX",
            &[
                ("g_tColor", "color.vtex"),
                ("g_tNormalRoughness", "packed.vtex"),
            ],
            &[("F_RENDER_BACKFACES", 1)],
        );
        let props = material_preview_properties_from_data(&data).unwrap();
        assert!(props.hemi_oct_normal);
        assert!(props.double_sided);
        assert_eq!(props.roughness_texture, props.normal_texture);
        let decoded = decode_rgba(&rgba_resource([128, 128, 37, 244]), 1024).unwrap();
        assert_eq!(
            pixel(&pack_orm_png(Some(&decoded), props.roughness_channel, None, None, 0).unwrap()),
            [255, 37, 255, 255]
        );
    }

    #[test]
    fn unverified_shaders_do_not_inherit_pbr_packed_normals() {
        for shader in ["", "custom.vfx", "complex.vfx", "csgo_complex.vfx"] {
            let data = material(
                shader,
                &[
                    ("g_tColor", "color.vtex"),
                    ("g_tNormalRoughness", "normal_rough.vtex"),
                ],
                &[],
            );
            let props = material_preview_properties_from_data(&data).unwrap();
            assert!(!props.hemi_oct_normal, "{shader}");
            assert!(props.normal_texture.is_none(), "{shader}");
            assert!(props.roughness_texture.is_none(), "{shader}");
            assert!(props.metalness_texture.is_none(), "{shader}");
        }
    }

    #[test]
    fn overlay_uses_hemi_oct_but_never_treats_color_alpha_as_metalness() {
        let data = material(
            "citadel_overlay.vfx",
            &[
                ("g_tColor", "color.vtex"),
                ("g_tNormalRoughness", "packed.vtex"),
            ],
            &[],
        );
        let props = material_preview_properties_from_data(&data).unwrap();
        assert!(props.hemi_oct_normal);
        assert_eq!(props.roughness_channel, 2);
        assert!(props.metalness_texture.is_none());
    }

    #[test]
    fn opaque_pbr_preserves_raw_alpha_for_metalness_and_exports_opaque_albedo() {
        let data = material(
            "pbr.vfx",
            &[
                ("g_tColor", "color.vtex"),
                ("g_tNprTransmissiveColor", "transmissive_color.vtex"),
            ],
            &[],
        );
        let props = material_preview_properties_from_data(&data).unwrap();
        assert_eq!(props.color_texture, "color.vtex_c");
        assert_eq!(props.metalness_texture.as_deref(), Some("color.vtex_c"));
        assert_eq!(props.metalness_channel, 3);
        let resource = rgba_resource([51, 102, 153, 42]);
        let texture = decode_texture_preview_resource(
            "color.vtex_c".to_string(),
            None,
            &resource,
            true,
            1024,
        )
        .unwrap();
        assert_eq!(pixel(&texture.png), [51, 102, 153, 255]);
        let raw = decode_rgba(&resource, 1024).unwrap();
        let orm = pack_orm_png(None, 0, None, Some(&raw), props.metalness_channel).unwrap();
        assert_eq!(pixel(&orm), [255, 220, 42, 255]);
    }

    #[test]
    fn transparent_pbr_uses_dedicated_metalness_and_keeps_opacity() {
        for flag in ["F_ALPHA_TEST", "F_TRANSLUCENT", "F_ADVANCED_TRANSLUCENCY"] {
            let data = material(
                "pbr.vfx",
                &[("g_tColor", "color.vtex"), ("g_tMetalness", "metal.vtex")],
                &[(flag, 1)],
            );
            let props = material_preview_properties_from_data(&data).unwrap();
            assert_eq!(props.metalness_texture.as_deref(), Some("metal.vtex_c"));
            assert_eq!(props.metalness_channel, 0);
            let resource = rgba_resource([51, 102, 153, 42]);
            let texture = decode_texture_preview_resource(
                "color.vtex_c".to_string(),
                None,
                &resource,
                false,
                1024,
            )
            .unwrap();
            assert_eq!(pixel(&texture.png), [51, 102, 153, 42]);
        }
        let data = material(
            "pbr.vfx",
            &[("g_tColor", "color.vtex")],
            &[("F_ALPHA_TEST", 1)],
        );
        assert!(
            material_preview_properties_from_data(&data)
                .unwrap()
                .metalness_texture
                .is_none()
        );
    }

    #[test]
    fn unlit_pbr_does_not_consume_metalness() {
        let data = material(
            "pbr.vfx",
            &[("g_tColor", "color.vtex"), ("g_tMetalness", "metal.vtex")],
            &[("F_UNLIT", 1)],
        );
        let props = material_preview_properties_from_data(&data).unwrap();
        assert!(props.metalness_texture.is_none());
        assert_eq!(props.metalness_factor, 0.0);
    }

    #[test]
    fn orm_white_metalness_preserves_uniform_scalar_without_a_map() {
        let decoded = DecodedTexture {
            width: 1,
            height: 1,
            rgba: vec![77, 11, 33, 0],
        };
        let orm = pack_orm_png(Some(&decoded), 0, None, None, 0).unwrap();
        assert_eq!(pixel(&orm), [255, 77, 255, 255]);
    }

    fn padded_texture_archive() -> (std::path::PathBuf, VpkArchive) {
        use std::io::{Seek, SeekFrom, Write};

        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("s2m-large-material-{unique}.vpk"));
        let entries = [
            ("color_a", [200, 20, 30, 255], 24 * 1024 * 1024),
            ("normal", [128, 128, 255, 255], 24 * 1024 * 1024),
            ("color_b", [40, 50, 210, 255], 24 * 1024 * 1024),
            ("large", [12, 34, 56, 255], 40 * 1024 * 1024),
        ];
        let mut tree = b"vtex_c\0textures\0".to_vec();
        let mut offset = 0u32;
        for (name, _, length) in entries {
            tree.extend_from_slice(name.as_bytes());
            tree.push(0);
            tree.extend_from_slice(&0u32.to_le_bytes());
            tree.extend_from_slice(&0u16.to_le_bytes());
            tree.extend_from_slice(&0x7fffu16.to_le_bytes());
            tree.extend_from_slice(&offset.to_le_bytes());
            tree.extend_from_slice(&(length as u32).to_le_bytes());
            tree.extend_from_slice(&0xffffu16.to_le_bytes());
            offset += length as u32;
        }
        tree.extend_from_slice(b"\0\0\0");
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(&0x55aa1234u32.to_le_bytes()).unwrap();
        file.write_all(&1u32.to_le_bytes()).unwrap();
        file.write_all(&(tree.len() as u32).to_le_bytes()).unwrap();
        file.write_all(&tree).unwrap();
        let mut start = 12 + tree.len() as u64;
        for (_, pixel, length) in entries {
            let mut resource = vec![0u8; 28];
            resource[0..4].copy_from_slice(&68u32.to_le_bytes());
            resource[4..6].copy_from_slice(&12u16.to_le_bytes());
            resource[8..12].copy_from_slice(&8u32.to_le_bytes());
            resource[12..16].copy_from_slice(&1u32.to_le_bytes());
            resource[16..20].copy_from_slice(b"DATA");
            resource[20..24].copy_from_slice(&8u32.to_le_bytes());
            resource[24..28].copy_from_slice(&40u32.to_le_bytes());
            resource.extend_from_slice(&rgba_resource(pixel).data);
            file.seek(SeekFrom::Start(start)).unwrap();
            file.write_all(&resource).unwrap();
            start += length as u64;
        }
        file.set_len(start).unwrap();
        drop(file);
        let archive = VpkArchive::open(&path).unwrap();
        (path, archive)
    }

    #[test]
    fn large_resources_keep_all_materials_and_skip_missing_entries() {
        let (path, archive) = padded_texture_archive();
        let properties = |color, normal| {
            let mut textures = vec![("g_tColor", color)];
            if let Some(normal) = normal {
                textures.push(("g_tNormal", normal));
            }
            material_preview_properties_from_data(&material("custom.vfx", &textures, &[])).unwrap()
        };
        let materials = vec![
            ("missing.vmat".to_string(), properties("absent.vtex", None)),
            (
                "first.vmat".to_string(),
                properties("textures/color_a.vtex", Some("textures/normal.vtex")),
            ),
            (
                "large.vmat".to_string(),
                properties("textures/large.vtex", None),
            ),
            (
                "second.vmat".to_string(),
                properties("textures/color_b.vtex", None),
            ),
            (
                "shared.vmat".to_string(),
                properties("textures/color_a.vtex", None),
            ),
        ];
        let textures = decode_material_previews(&archive, materials.into_iter(), 1024);
        std::fs::remove_file(path).unwrap();

        assert_eq!(textures.len(), 4);
        assert_eq!(textures[0].material.as_deref(), Some("first.vmat_c"));
        assert_eq!(textures[1].material.as_deref(), Some("large.vmat_c"));
        assert_eq!(textures[2].material.as_deref(), Some("second.vmat_c"));
        assert_eq!(textures[3].material.as_deref(), Some("shared.vmat_c"));
        assert!(textures[0].normal_png.is_some());
        assert_eq!(pixel(&textures[0].png), [200, 20, 30, 255]);
        assert_eq!(pixel(&textures[1].png), [12, 34, 56, 255]);
        assert_eq!(pixel(&textures[2].png), [40, 50, 210, 255]);
        assert_eq!(pixel(&textures[3].png), [200, 20, 30, 255]);
    }

    #[test]
    #[ignore = "requires the local Yamato VPK via DMM_MATERIAL_TEST_VPK"]
    fn yamato_fixture_exports_all_six_albedos() {
        let path = std::env::var("DMM_MATERIAL_TEST_VPK").unwrap();
        let model = decode_model_render_model(
            Path::new(&path),
            "models/heroes_staging/yamato_v2/yamato.vmdl_c",
        )
        .unwrap();
        let textured: Vec<_> = model
            .materials
            .iter()
            .filter(|material| material.base_color_png.is_some())
            .collect();
        assert_eq!(textured.len(), 6);
        for name in ["pants_color", "cabelo_color", "katana_png"] {
            assert!(
                textured.iter().any(|material| material.name.contains(name)),
                "missing {name}"
            );
        }
    }

    #[test]
    fn large_textures_use_available_mips_without_a_dimension_cutoff() {
        let mut resource = rgba_resource([0; 4]);
        resource.data[20..22].copy_from_slice(&8192u16.to_le_bytes());
        resource.data[22..24].copy_from_slice(&4096u16.to_le_bytes());
        let mut header = VtexHeader::parse(&resource).unwrap();
        assert_eq!(preview_dimensions(&header), Some((8192, 4096)));
        assert!(decode_rgba(&resource, 1024).is_none());
        header.num_mip_levels = 4;
        assert_eq!(preview_dimensions(&header), Some((1024, 512)));
        header.num_mip_levels = 255;
        assert!(preview_dimensions(&header).is_none());
    }

    #[test]
    fn oversized_rgba_chain_and_non_2d_textures_are_rejected() {
        let resource = rgba_resource([0; 4]);
        let mut header = VtexHeader::parse(&resource).unwrap();
        header.width = u16::MAX;
        header.height = u16::MAX;
        header.num_mip_levels = 16;
        assert!(preview_dimensions(&header).is_none());
        header.width = 1;
        header.height = 1;
        for flags in [0x10, 0x20, 0x40] {
            header.flags = flags;
            assert!(preview_dimensions(&header).is_none());
        }
    }

    #[test]
    fn embedded_png_atlas_is_supported_by_material_previews_with_dimension_limits() {
        let mut resource = rgba_resource([0; 4]);
        resource.data.resize(48, 0);
        resource.blocks[0].size = 48;
        resource.data[20..22].copy_from_slice(&2u16.to_le_bytes());
        resource.data[22..24].copy_from_slice(&2u16.to_le_bytes());
        resource.data[26] = VtexFormat::PngRgba8888 as u8;
        let image = image::RgbaImage::from_pixel(2, 2, image::Rgba([18, 42, 73, 109]));
        let mut png = std::io::Cursor::new(Vec::new());
        image.write_to(&mut png, image::ImageFormat::Png).unwrap();
        resource.data.extend(png.into_inner());
        let preview = decode_texture_preview_resource(
            "atlas.vtex_c".into(),
            Some("body.vmat_c".into()),
            &resource,
            false,
            1024,
        )
        .unwrap();
        assert_eq!(pixel(&preview.png), [18, 42, 73, 109]);
        resource.data[20..22].copy_from_slice(&1u16.to_le_bytes());
        assert!(decode_rgba(&resource, 1024).is_none());
    }
    #[test]
    fn malformed_embedded_images_and_unbounded_external_counts_are_rejected() {
        let mut resource = rgba_resource([0; 4]);
        resource.data[26] = VtexFormat::PngRgba8888 as u8;
        assert!(decode_rgba(&resource, 1024).is_none());
        resource.data[36..40].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(decode_rgba(&resource, 1024).is_none());
        let mut bytes = vec![0u8; 16];
        bytes[12..16].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(textures::preview_resource(bytes).is_none());
    }
}
