use super::binary::joint_influence_count;
use super::types::{FORMAT_R16G16B16A16_SINT, FORMAT_R16G16B16A16_UINT};

#[test]
fn classifies_source2_joint_formats_by_actual_influence_count() {
    assert_eq!(joint_influence_count(FORMAT_R16G16B16A16_SINT).unwrap(), 4);
    assert_eq!(joint_influence_count(FORMAT_R16G16B16A16_UINT).unwrap(), 8);
    assert!(joint_influence_count(u32::MAX).is_err());
}
