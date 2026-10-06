use super::binary::joint_influence_count;
use super::types::{FORMAT_R16G16B16A16_SINT, FORMAT_R16G16B16A16_UINT};

#[test]
fn classifies_source2_joint_formats_by_actual_influence_count() {
    assert_eq!(joint_influence_count(FORMAT_R16G16B16A16_SINT).unwrap(), 4);
    assert_eq!(joint_influence_count(FORMAT_R16G16B16A16_UINT).unwrap(), 8);
    assert!(joint_influence_count(u32::MAX).is_err());
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
