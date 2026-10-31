use crate::abi::{MAX_CALL_INPUT_BYTES, pack};
use crate::envelope::{PluginError, dispatch, encode_response};
use crate::host::WasmHost;
use serde_json::Value;

/// Reserves `len` bytes for the host to write a request into. Memory is never
/// freed: every instance serves exactly one call and is then discarded.
/// Returns 0 when the length is negative or above the request limit.
pub fn alloc(len: i32) -> i32 {
  if len < 0 || len as usize > MAX_CALL_INPUT_BYTES {
    return 0;
  }
  let mut buffer = Vec::<u8>::with_capacity(len as usize);
  let ptr = buffer.as_mut_ptr();
  std::mem::forget(buffer);
  ptr as i32
}

pub fn call(
  ptr: i32,
  len: i32,
  handler: impl FnOnce(&str, Value, &mut WasmHost) -> Result<Value, PluginError>,
) -> i64 {
  let output = if len < 0 || ptr == 0 {
    encode_response(Err(PluginError::new(
      crate::codes::INVALID_REQUEST,
      "Request pointer or length is invalid",
    )))
  } else {
    let input = unsafe { std::slice::from_raw_parts(ptr as usize as *const u8, len as usize) };
    dispatch(input, &mut WasmHost, handler)
  };
  let output = Box::leak(output.into_boxed_slice());
  pack(output.as_ptr() as usize as u32, output.len() as u32)
}
