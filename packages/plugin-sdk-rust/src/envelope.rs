use crate::abi::{MAX_CALL_INPUT_BYTES, MAX_CALL_OUTPUT_BYTES};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// Error codes produced by the SDK itself. Hosts and plugins define their own
/// codes; the host's are passed through unchanged.
pub mod codes {
  pub const INVALID_REQUEST: &str = "invalid_request";
  pub const REQUEST_TOO_LARGE: &str = "request_too_large";
  pub const RESPONSE_TOO_LARGE: &str = "response_too_large";
  pub const UNKNOWN_COMMAND: &str = "unknown_command";
  pub const INVALID_HOST_RESPONSE: &str = "invalid_host_response";
  pub const HOST_CALL_FAILED: &str = "host_call_failed";
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginError {
  pub code: String,
  pub message: String,
}

impl PluginError {
  pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
    Self {
      code: code.into(),
      message: message.into(),
    }
  }
}

impl std::fmt::Display for PluginError {
  fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(formatter, "{}: {}", self.code, self.message)
  }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CommandRequest {
  command: String,
  #[serde(default)]
  payload: Value,
}

/// Serializes `{ok:true, value}` or `{ok:false, error}`, replacing responses
/// larger than [`MAX_CALL_OUTPUT_BYTES`] with a `response_too_large` error.
pub fn encode_response(result: Result<Value, PluginError>) -> Vec<u8> {
  let envelope = match result {
    Ok(value) => json!({ "ok": true, "value": value }),
    Err(error) => json!({ "ok": false, "error": error }),
  };
  let bytes = serde_json::to_vec(&envelope).unwrap_or_default();
  if bytes.is_empty() || bytes.len() > MAX_CALL_OUTPUT_BYTES {
    let error = PluginError::new(
      codes::RESPONSE_TOO_LARGE,
      format!("Response exceeds the {MAX_CALL_OUTPUT_BYTES} byte envelope limit"),
    );
    return serde_json::to_vec(&json!({ "ok": false, "error": error })).unwrap_or_default();
  }
  bytes
}

/// Decodes a `{command, payload}` request, runs the handler, and encodes its
/// result. Malformed or oversized requests never reach the handler.
pub fn dispatch<H>(
  input: &[u8],
  host: &mut H,
  handler: impl FnOnce(&str, Value, &mut H) -> Result<Value, PluginError>,
) -> Vec<u8> {
  if input.len() > MAX_CALL_INPUT_BYTES {
    return encode_response(Err(PluginError::new(
      codes::REQUEST_TOO_LARGE,
      format!("Request exceeds the {MAX_CALL_INPUT_BYTES} byte envelope limit"),
    )));
  }
  let request = match serde_json::from_slice::<CommandRequest>(input) {
    Ok(request) => request,
    Err(error) => {
      return encode_response(Err(PluginError::new(
        codes::INVALID_REQUEST,
        error.to_string(),
      )));
    }
  };
  encode_response(handler(&request.command, request.payload, host))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn decode(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).unwrap()
  }

  #[test]
  fn dispatches_command_and_payload_to_the_handler() {
    let output = dispatch(
      br#"{"command":"echo","payload":{"n":1}}"#,
      &mut (),
      |command, payload, _| Ok(json!({ "command": command, "payload": payload })),
    );
    assert_eq!(
      decode(&output),
      json!({ "ok": true, "value": { "command": "echo", "payload": { "n": 1 } } })
    );
  }

  #[test]
  fn rejects_malformed_requests_before_the_handler_runs() {
    for input in [
      &b"not json"[..],
      br#"{"payload":{}}"#,
      br#"{"command":"x","extra":1}"#,
    ] {
      let output = dispatch(input, &mut (), |_, _, _| -> Result<Value, PluginError> {
        panic!("handler must not run")
      });
      assert_eq!(decode(&output)["error"]["code"], codes::INVALID_REQUEST);
    }
  }

  #[test]
  fn rejects_oversized_requests() {
    let input = vec![b' '; MAX_CALL_INPUT_BYTES + 1];
    let output = dispatch(&input, &mut (), |_, _, _| Ok(Value::Null));
    assert_eq!(decode(&output)["error"]["code"], codes::REQUEST_TOO_LARGE);
  }

  #[test]
  fn replaces_oversized_responses_with_an_error() {
    let output = dispatch(br#"{"command":"big"}"#, &mut (), |_, _, _| {
      Ok(Value::String("x".repeat(MAX_CALL_OUTPUT_BYTES)))
    });
    assert!(output.len() < 1024);
    assert_eq!(decode(&output)["error"]["code"], codes::RESPONSE_TOO_LARGE);
  }
}
