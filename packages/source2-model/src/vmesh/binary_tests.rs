use super::binary::joint_influence_count;
use super::types::{FORMAT_R16G16B16A16_SINT, FORMAT_R16G16B16A16_UINT};

#[test]
fn classifies_source2_joint_formats_by_actual_influence_count() {
    assert_eq!(joint_influence_count(FORMAT_R16G16B16A16_SINT).unwrap(), 4);
    assert_eq!(joint_influence_count(FORMAT_R16G16B16A16_UINT).unwrap(), 8);
    assert!(joint_influence_count(u32::MAX).is_err());
}

#[test]
fn reads_vertex_colours_as_linear_rgba() {
    use super::binary::read_colors;
    use super::types::{BufferData, FORMAT_R8G8B8A8_UNORM, LayoutField};

    let buffer = BufferData {
        element_count: 1,
        element_size: 4,
        fields: Vec::new(),
        data: vec![255, 128, 0, 255],
    };
    let field = LayoutField {
        semantic_name: "COLOR".into(),
        format: FORMAT_R8G8B8A8_UNORM,
        offset: 0,
    };
    let colors = read_colors(&buffer, &field).unwrap();
    assert_eq!(colors[0], 1.0);
    assert!(
        (colors[1] - 0.2158).abs() < 0.001,
        "sRGB 128 is ~0.216 linear"
    );
    assert_eq!(colors[2], 0.0);
    assert_eq!(colors[3], 1.0, "alpha stays linear");
}

#[test]
fn mesh_group_masks_past_32_bits_still_hide_optional_meshes() {
    use super::meshdata::mesh_is_enabled;
    use crate::kv3::KvValue;

    // Rat King's real default mask: base body plus groups up to bit 37.
    let masks = (183_240_753_217_u64, vec![63, 10, 28, 1 << 26]);
    let mesh =
        |index: i64| KvValue::Object([("m_nMeshIndex".to_string(), KvValue::Int(index))].into());
    assert!(mesh_is_enabled(&mesh(0), 0, Some(&masks)), "base body");
    assert!(!mesh_is_enabled(&mesh(1), 1, Some(&masks)), "sewer lid");
    assert!(!mesh_is_enabled(&mesh(2), 2, Some(&masks)), "ult banner");
}

#[test]
fn legacy_meshopt_vertex_buffers_decode_and_reject_truncated_streams() {
    let vertices = vec![[1.0f32, 2.0, 3.0]; 256];
    let encoded = meshopt::encode_vertex_buffer(&vertices).unwrap();
    assert!(encoded.len() < vertices.len() * 12);
    let mut block = vec![0u8; 24];
    block[0..4].copy_from_slice(&(vertices.len() as u32).to_le_bytes());
    block[4..8].copy_from_slice(&12u32.to_le_bytes());
    block[16..20].copy_from_slice(&8u32.to_le_bytes());
    block[20..24].copy_from_slice(&(encoded.len() as u32).to_le_bytes());
    block.extend_from_slice(&encoded);
    let (decoded, _) = super::binary::read_buffer(&block, 0, true).unwrap();
    let expected: Vec<_> = vertices
        .iter()
        .flatten()
        .flat_map(|v| v.to_le_bytes())
        .collect();
    assert_eq!(decoded.data, expected);
    block.pop();
    assert!(super::binary::read_buffer(&block, 0, true).is_err());
}
