use crate::abi::{MAX_HOSTCALL_REQUEST_BYTES, MAX_HOSTCALL_RESPONSE_BYTES};
use crate::envelope::{PluginError, codes};
use serde::Deserialize;
use serde_json::{Value, json};

const INITIAL_RESPONSE_CAPACITY: usize = 16 * 1024;

/// Host capabilities available to a guest. Each call is a JSON hostcall
/// `{method, params}`; the host answers `{ok:true, value}` or
/// `{ok:false, error:{code, message}}`. Denied or disabled capabilities arrive
/// as errors carrying the host's code.
pub trait Host {
  fn call(&mut self, method: &str, params: Value) -> Result<Value, PluginError>;
}

pub fn encode_host_request(method: &str, params: Value) -> Result<Vec<u8>, PluginError> {
  let bytes = serde_json::to_vec(&json!({ "method": method, "params": params }))
    .map_err(|error| PluginError::new(codes::INVALID_REQUEST, error.to_string()))?;
  if bytes.len() > MAX_HOSTCALL_REQUEST_BYTES {
    return Err(PluginError::new(
      codes::REQUEST_TOO_LARGE,
      format!("Hostcall {method} exceeds the {MAX_HOSTCALL_REQUEST_BYTES} byte limit"),
    ));
  }
  Ok(bytes)
}

#[derive(Deserialize)]
struct HostEnvelope {
  ok: bool,
  #[serde(default)]
  value: Value,
  error: Option<PluginError>,
}

pub fn decode_host_response(bytes: &[u8]) -> Result<Value, PluginError> {
  let envelope: HostEnvelope = serde_json::from_slice(bytes)
    .map_err(|error| PluginError::new(codes::INVALID_HOST_RESPONSE, error.to_string()))?;
  match (envelope.ok, envelope.error) {
    (true, _) => Ok(envelope.value),
    (false, Some(error)) => Err(error),
    (false, None) => Err(PluginError::new(
      codes::INVALID_HOST_RESPONSE,
      "Host reported failure without an error",
    )),
  }
}

/// Runs one `dmm.host_call` round trip through `raw`, which receives the
/// request bytes and an output buffer and returns the host's `i32` result.
///
/// A non-negative result is the number of bytes written. A negative result
/// whose magnitude exceeds the offered capacity is the required capacity; the
/// host keeps the response pending, so the identical request is retried once
/// with a buffer of that size. Any other negative result (`-1` malformed
/// request, `-2` hostcall limit reached) is a host error. This is the only
/// place the return-value convention is interpreted.
pub fn call_with_buffer(
  input: &[u8],
  mut raw: impl FnMut(&[u8], &mut [u8]) -> i32,
) -> Result<Vec<u8>, PluginError> {
  let mut capacity = INITIAL_RESPONSE_CAPACITY;
  for _ in 0..2 {
    let mut buffer = vec![0u8; capacity];
    let result = raw(input, &mut buffer);
    if result >= 0 {
      let written = result as usize;
      if written > capacity {
        return Err(PluginError::new(
          codes::INVALID_HOST_RESPONSE,
          "Host reported writing past the output buffer",
        ));
      }
      buffer.truncate(written);
      return Ok(buffer);
    }
    let required = result.unsigned_abs() as usize;
    if required <= capacity {
      return Err(PluginError::new(
        codes::HOST_CALL_FAILED,
        format!("Host call failed with status {result}"),
      ));
    }
    if required > MAX_HOSTCALL_RESPONSE_BYTES {
      return Err(PluginError::new(
        codes::RESPONSE_TOO_LARGE,
        format!("Host response of {required} bytes exceeds the envelope limit"),
      ));
    }
    capacity = required;
  }
  Err(PluginError::new(
    codes::HOST_CALL_FAILED,
    "Host still needed a larger buffer after retrying with the size it requested",
  ))
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "dmm")]
unsafe extern "C" {
  fn host_call(input_ptr: i32, input_len: i32, output_ptr: i32, output_capacity: i32) -> i32;
}

/// [`Host`] backed by the `dmm.host_call` import.
#[cfg(target_arch = "wasm32")]
pub struct WasmHost;

#[cfg(target_arch = "wasm32")]
impl Host for WasmHost {
  fn call(&mut self, method: &str, params: Value) -> Result<Value, PluginError> {
    let input = encode_host_request(method, params)?;
    let bytes = call_with_buffer(&input, |input, output| unsafe {
      host_call(
        input.as_ptr() as i32,
        input.len() as i32,
        output.as_mut_ptr() as i32,
        output.len() as i32,
      )
    })?;
    decode_host_response(&bytes)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn respond(response: &[u8]) -> impl FnMut(&[u8], &mut [u8]) -> i32 {
    move |_, output| {
      if output.len() < response.len() {
        return -(response.len() as i32);
      }
      output[..response.len()].copy_from_slice(response);
      response.len() as i32
    }
  }

  #[test]
  fn returns_the_bytes_written_by_the_host() {
    let bytes = call_with_buffer(b"{}", respond(br#"{"ok":true,"value":1}"#)).unwrap();
    assert_eq!(decode_host_response(&bytes).unwrap(), json!(1));
  }

  #[test]
  fn retries_once_with_the_capacity_the_host_requests() {
    let large = format!(r#"{{"ok":true,"value":"{}"}}"#, "x".repeat(40_000));
    let mut attempts = Vec::new();
    let mut inner = respond(large.as_bytes());
    let bytes = call_with_buffer(b"{}", |input, output| {
      attempts.push(output.len());
      inner(input, output)
    })
    .unwrap();
    assert_eq!(bytes, large.as_bytes());
    assert_eq!(attempts, vec![INITIAL_RESPONSE_CAPACITY, large.len()]);
  }

  #[test]
  fn treats_small_negative_results_as_host_errors() {
    let error = call_with_buffer(b"{}", |_, _| -1).unwrap_err();
    assert_eq!(error.code, codes::HOST_CALL_FAILED);
  }

  #[test]
  fn refuses_responses_above_the_envelope_limit() {
    let error =
      call_with_buffer(b"{}", |_, _| -((MAX_HOSTCALL_RESPONSE_BYTES + 1) as i32)).unwrap_err();
    assert_eq!(error.code, codes::RESPONSE_TOO_LARGE);
  }

  #[test]
  fn stops_when_the_host_keeps_asking_for_more() {
    let mut requested = INITIAL_RESPONSE_CAPACITY as i32;
    let error = call_with_buffer(b"{}", |_, _| {
      requested *= 2;
      -requested
    })
    .unwrap_err();
    assert_eq!(error.code, codes::HOST_CALL_FAILED);
  }

  #[test]
  fn rejects_lengths_past_the_buffer() {
    let error = call_with_buffer(b"{}", |_, output| output.len() as i32 + 1).unwrap_err();
    assert_eq!(error.code, codes::INVALID_HOST_RESPONSE);
  }

  #[test]
  fn surfaces_host_errors_with_their_code() {
    let error =
      decode_host_response(br#"{"ok":false,"error":{"code":"permission_denied","message":"no"}}"#)
        .unwrap_err();
    assert_eq!(error, PluginError::new("permission_denied", "no"));
    assert_eq!(
      decode_host_response(br#"{"ok":false}"#).unwrap_err().code,
      codes::INVALID_HOST_RESPONSE
    );
    assert_eq!(
      decode_host_response(b"garbage").unwrap_err().code,
      codes::INVALID_HOST_RESPONSE
    );
  }
}
