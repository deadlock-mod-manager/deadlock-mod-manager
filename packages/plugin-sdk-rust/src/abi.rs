/// Version of the guest ABI (exports, imports and envelopes) implemented by
/// this crate.
pub const ABI_VERSION: u32 = 1;

/// Host API version these wrappers target. Matches the manifest's
/// `sdkVersion`.
pub const SDK_VERSION: u32 = 1;

/// Envelope bounds enforced by the host. The guest applies the same limits so
/// it fails with a structured error instead of being cut off.
pub const MAX_CALL_INPUT_BYTES: usize = 256 * 1024;
pub const MAX_CALL_OUTPUT_BYTES: usize = 1024 * 1024;
/// Large enough for a 4 MiB `files.write` and a 4 MiB `http.fetch` response
/// as base64 inside their JSON envelopes.
pub const MAX_HOSTCALL_REQUEST_BYTES: usize = 6 * 1024 * 1024;
pub const MAX_HOSTCALL_RESPONSE_BYTES: usize = 6 * 1024 * 1024;

/// Packs a guest pointer and length into the `call` return value:
/// `(ptr << 32) | len`.
pub fn pack(ptr: u32, len: u32) -> i64 {
  ((u64::from(ptr) << 32) | u64::from(len)) as i64
}

pub fn unpack(packed: i64) -> (u32, u32) {
  let bits = packed as u64;
  ((bits >> 32) as u32, bits as u32)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn packs_pointer_into_high_bits_and_length_into_low_bits() {
    assert_eq!(pack(0x0001_0000, 42), 0x0001_0000_0000_002a);
    assert_eq!(unpack(pack(0x0001_0000, 42)), (0x0001_0000, 42));
  }

  #[test]
  fn round_trips_values_that_set_the_sign_bit() {
    let packed = pack(u32::MAX, u32::MAX);
    assert_eq!(packed, -1);
    assert_eq!(unpack(packed), (u32::MAX, u32::MAX));
    assert_eq!(unpack(pack(0x8000_0000, 0)), (0x8000_0000, 0));
  }
}
