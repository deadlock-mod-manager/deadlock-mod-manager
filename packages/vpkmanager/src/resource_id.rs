//! Source 2 RERL identifiers for canonical, uncompiled resource names.
//!
//! Uses Austin Appleby's public-domain MurmurHash64B, not MurmurHash64A:
//! <https://github.com/aappleby/smhasher/blob/master/src/MurmurHash2.cpp>.
//! The seed and variant were checked against Deadlock's resourcesystem.dll and
//! 276 distinct RERL references from installed resources, including every tail length.

use crate::{Result, VpkManagerError};

const MULTIPLIER: u32 = 0x5bd1_e995;
const SEED: u32 = 0xedab_cdef;

/// Compute the ID for the exact name to be serialized in a RERL entry.
///
/// Accepts lowercase ASCII game-relative paths with `/` separators and a source
/// extension (`.vmat`, not `.vmat_c`). Does not silently normalize names: callers
/// must use the same canonical path for hashing, bindings and RERL serialization.
pub fn resource_id(path: &str) -> Result<u64> {
    let invalid =
        || VpkManagerError::Invalid("expected a canonical uncompiled resource path".into());
    if path.is_empty()
        || !path.is_ascii()
        || path.bytes().any(|byte| {
            byte.is_ascii_control() || byte.is_ascii_uppercase() || matches!(byte, b'\\' | b':')
        })
        || path.split('/').any(|part| matches!(part, "" | "." | ".."))
        || path.ends_with("_c")
    {
        return Err(invalid());
    }
    let filename = path.rsplit('/').next().ok_or_else(invalid)?;
    if !filename
        .rsplit_once('.')
        .is_some_and(|(name, extension)| !name.is_empty() && !extension.is_empty())
    {
        return Err(invalid());
    }
    let length = u32::try_from(path.len()).map_err(|_| invalid())?;
    Ok(murmur_hash64b(path.as_bytes(), length))
}

fn mix(value: u32) -> u32 {
    let value = value.wrapping_mul(MULTIPLIER);
    (value ^ (value >> 24)).wrapping_mul(MULTIPLIER)
}

fn murmur_hash64b(bytes: &[u8], length: u32) -> u64 {
    let mut high = SEED ^ length;
    let mut low = 0u32;
    let mut chunks = bytes.chunks_exact(8);
    for chunk in &mut chunks {
        let first = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        let second = u32::from_le_bytes([chunk[4], chunk[5], chunk[6], chunk[7]]);
        high = high.wrapping_mul(MULTIPLIER) ^ mix(first);
        low = low.wrapping_mul(MULTIPLIER) ^ mix(second);
    }
    let mut tail = chunks.remainder();
    if tail.len() >= 4 {
        high = high.wrapping_mul(MULTIPLIER)
            ^ mix(u32::from_le_bytes([tail[0], tail[1], tail[2], tail[3]]));
        tail = &tail[4..];
    }
    if !tail.is_empty() {
        let packed = tail.iter().enumerate().fold(0u32, |value, (index, byte)| {
            value | (u32::from(*byte) << (index * 8))
        });
        low = (low ^ packed).wrapping_mul(MULTIPLIER);
    }
    high = (high ^ (low >> 18)).wrapping_mul(MULTIPLIER);
    low = (low ^ (high >> 22)).wrapping_mul(MULTIPLIER);
    high = (high ^ (low >> 17)).wrapping_mul(MULTIPLIER);
    low = (low ^ (high >> 19)).wrapping_mul(MULTIPLIER);
    (u64::from(high) << 32) | u64::from(low)
}

#[cfg(test)]
mod tests {
    use super::resource_id;

    #[test]
    fn matches_reference_hashes_for_every_tail_length() {
        // Independent vectors from Austin Appleby's implementation, seed EDABCDEF.
        let vectors = [
            ("a.vmat", 0xe2c9_38c2_debb_d292),
            ("ab.vmat", 0xa856_0f3a_6ee5_e6ef),
            ("abc.vmat", 0x55ee_217b_b53c_57ed),
            ("abcd.vmat", 0x0088_0fc0_6813_72d9),
            ("abcde.vmat", 0xc2cd_36fc_c77d_25fd),
            ("abcdef.vmat", 0x5fa8_c3ef_679b_0f77),
            ("abcdefg.vmat", 0x13c8_af42_4ec4_cd25),
            ("abcdefgh.vmat", 0x67fd_bac5_c679_fe66),
        ];
        for (path, expected) in vectors {
            assert_eq!(resource_id(path).unwrap(), expected, "{path}");
        }
    }

    #[test]
    fn matches_identifiers_from_installed_deadlock_resources() {
        let vectors = [
            (
                "models/npc/trooper/materials/candle_trooper_body.vmat",
                0x34f4_fa62_067f_3ed9,
            ),
            (
                "materials/default/default_black_mask_tga_e7be3cc.vtex",
                0x1fb0_58b8_2ca8_7a2d,
            ),
            (
                "materials/default/default_color_tga_96b3aa03.vtex",
                0xb4aa_b7e7_abcf_3e44,
            ),
            (
                "materials/default/default_mask_tga_344101f8.vtex",
                0xb75c_3785_9897_7cd0,
            ),
            (
                "panorama/images/hud/abilities/ratking/ratking_nibble_psd.vtex",
                0xe8a2_fcce_188a_bbe0,
            ),
        ];
        for (path, expected) in vectors {
            assert_eq!(resource_id(path).unwrap(), expected, "{path}");
        }
    }

    #[test]
    fn rejects_names_that_require_normalization_or_have_compiled_extensions() {
        for path in [
            "",
            "a",
            "a.",
            ".vmat",
            "/a.vmat",
            "a//b.vmat",
            "./a.vmat",
            "../a.vmat",
            "a/../b.vmat",
            "a/./b.vmat",
            "A.vmat",
            "a\\b.vmat",
            "c:/a.vmat",
            "a.vmat_c",
            "a\0.vmat",
            "a\n.vmat",
            "á.vmat",
        ] {
            assert!(resource_id(path).is_err(), "{path:?}");
        }
    }
}
