//! Guest ABI v1 shared by the host (package validation) and the worker
//! (execution). See `README.md` next to this file for the contract.

use serde::Serialize;
use wasmparser::{ValType, Validator, WasmFeatures, types::EntityType};

pub const IMPORT_MODULE: &str = "dmm";
pub const IMPORT_HOST_CALL: &str = "host_call";
pub const EXPORT_MEMORY: &str = "memory";
pub const EXPORT_ALLOC: &str = "alloc";
pub const EXPORT_CALL: &str = "call";

pub const MAX_BACKEND_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_CALL_INPUT_BYTES: usize = 256 * 1024;
pub const MAX_CALL_OUTPUT_BYTES: usize = 1024 * 1024;
/// Large enough for a 4 MiB `files.write` and a 4 MiB `http.fetch` response
/// as base64 inside their JSON envelopes.
pub const MAX_HOSTCALL_REQUEST_BYTES: usize = 6 * 1024 * 1024;
pub const MAX_HOSTCALL_RESPONSE_BYTES: usize = 6 * 1024 * 1024;
pub const MAX_HOSTCALLS_PER_CALL: u32 = 256;
pub const MAX_GUEST_MEMORY_BYTES: usize = 64 * 1024 * 1024;
pub const FUEL_PER_CALL: u64 = 2_000_000_000;

/// `host_call` return codes. Non-negative values are the number of response
/// bytes written. `-16` and below mean the output buffer was too small: the
/// response needs `-code` bytes and stays pending, so calling again with the
/// identical request bytes and a large enough buffer returns it without
/// running the hostcall twice.
pub const HOSTCALL_MALFORMED: i32 = -1;
pub const HOSTCALL_LIMIT_REACHED: i32 = -2;
pub const MIN_RESPONSE_BYTES: usize = 16;

pub fn unpack(value: i64) -> (u32, u32) {
  let value = value as u64;
  ((value >> 32) as u32, value as u32)
}

#[derive(Serialize)]
struct ErrorBody<'a> {
  code: &'a str,
  message: &'a str,
}

#[derive(Serialize)]
#[serde(untagged)]
enum Envelope<'a, T: Serialize> {
  Ok { ok: bool, value: T },
  Err { ok: bool, error: ErrorBody<'a> },
}

pub fn ok_envelope<T: Serialize>(value: T) -> String {
  serde_json::to_string(&Envelope::<T>::Ok { ok: true, value })
    .unwrap_or_else(|error| error_envelope("host_error", &error.to_string()))
}

pub fn error_envelope(code: &str, message: &str) -> String {
  serde_json::to_string(&Envelope::<()>::Err {
    ok: false,
    error: ErrorBody { code, message },
  })
  .unwrap_or_else(|_| r#"{"ok":false,"error":{"code":"host_error","message":""}}"#.into())
}

/// Accepts exactly `{ok:true, value}` or `{ok:false, error:{code, message}}`.
pub fn validate_envelope(bytes: &[u8]) -> Result<String, String> {
  if bytes.len() > MAX_CALL_OUTPUT_BYTES {
    return Err("Plugin response exceeds the 1 MiB limit".into());
  }
  let text = std::str::from_utf8(bytes).map_err(|_| "Plugin response is not UTF-8")?;
  let value: serde_json::Value =
    serde_json::from_str(text).map_err(|_| "Plugin response is not JSON")?;
  let object = value
    .as_object()
    .ok_or("Plugin response is not an object")?;
  let valid = match object.get("ok") {
    Some(serde_json::Value::Bool(true)) => object.len() == 2 && object.contains_key("value"),
    Some(serde_json::Value::Bool(false)) => {
      object.len() == 2
        && object
          .get("error")
          .and_then(serde_json::Value::as_object)
          .is_some_and(|error| {
            error.get("code").is_some_and(serde_json::Value::is_string)
              && error
                .get("message")
                .is_some_and(serde_json::Value::is_string)
          })
    }
    _ => false,
  };
  if !valid {
    return Err(
      "Plugin response must be {ok:true,value} or {ok:false,error:{code,message}}".into(),
    );
  }
  Ok(text.to_owned())
}

pub fn features() -> WasmFeatures {
  WasmFeatures::WASM2
}

/// Validates the module and requires the exact v1 import/export shape. No
/// other imports are allowed, so a module asking for WASI or anything else
/// fails here instead of at instantiation.
pub fn validate_module(bytes: &[u8]) -> Result<(), String> {
  if bytes.len() > MAX_BACKEND_BYTES {
    return Err("Plugin backend exceeds the 16 MiB limit".into());
  }
  let types = Validator::new_with_features(features())
    .validate_all(bytes)
    .map_err(|error| format!("Plugin backend is not valid WebAssembly: {error}"))?;
  let types = types.as_ref();
  let signature = |entity: EntityType| match entity {
    EntityType::Func(id) | EntityType::FuncExact(id) => {
      let func = types[id].unwrap_func();
      Some((func.params().to_vec(), func.results().to_vec()))
    }
    _ => None,
  };

  let imports: Vec<_> = types
    .core_imports()
    .ok_or("Plugin backend must be a core module")?
    .collect();
  for (module, name, entity) in &imports {
    let expected = (vec![ValType::I32; 4], vec![ValType::I32]);
    if *module != IMPORT_MODULE || *name != IMPORT_HOST_CALL || signature(*entity) != Some(expected)
    {
      return Err(format!(
        "Plugin backend imports {module}.{name}; only dmm.host_call(i32,i32,i32,i32)->i32 is available"
      ));
    }
  }

  let mut memory = false;
  let mut alloc = false;
  let mut call = false;
  for (name, entity) in types
    .core_exports()
    .ok_or("Plugin backend must be a core module")?
  {
    match name {
      EXPORT_MEMORY => {
        memory = matches!(entity, EntityType::Memory(ty) if !ty.memory64 && !ty.shared);
      }
      EXPORT_ALLOC => alloc = signature(entity) == Some((vec![ValType::I32], vec![ValType::I32])),
      EXPORT_CALL => {
        call = signature(entity) == Some((vec![ValType::I32, ValType::I32], vec![ValType::I64]));
      }
      _ => {}
    }
  }
  if !(memory && alloc && call) {
    return Err("Plugin backend must export memory, alloc(i32)->i32 and call(i32,i32)->i64".into());
  }
  Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
  use super::*;

  /// A minimal guest: echoes `{ok:true,value:<input>}` for `echo`, forwards
  /// the payload as a hostcall for `host`, loops forever for `spin` and
  /// traps for anything else. Input arrives at offset 1024, output is built
  /// at offset 65536.
  pub(crate) const TEST_GUEST: &str = r#"
    (module
      (import "dmm" "host_call" (func $host (param i32 i32 i32 i32) (result i32)))
      (memory (export "memory") 4)
      (global $next (mut i32) (i32.const 1024))
      (data (i32.const 0) "{\"ok\":true,\"value\":")
      (func (export "alloc") (param $len i32) (result i32)
        (local $ptr i32)
        (local.set $ptr (global.get $next))
        (global.set $next (i32.add (global.get $next) (local.get $len)))
        (local.get $ptr))
      (func (export "call") (param $ptr i32) (param $len i32) (result i64)
        (local $written i32)
        ;; command name starts after {"command":" (12 bytes)
        (if (i32.eq (i32.load8_u (i32.add (local.get $ptr) (i32.const 12))) (i32.const 115))
          (then (loop $forever (br $forever))))
        (if (i32.eq (i32.load8_u (i32.add (local.get $ptr) (i32.const 12))) (i32.const 104))
          (then
            ;; hostcall request is the input minus the {"command":"host","payload": prefix
            ;; with a deliberately tiny buffer first, then the reported size
            (local.set $written
              (call $host
                (i32.add (local.get $ptr) (i32.const 28))
                (i32.sub (local.get $len) (i32.const 29))
                (i32.const 65536) (i32.const 4)))
            (if (i32.lt_s (local.get $written) (i32.const -15))
              (then
                (local.set $written
                  (call $host
                    (i32.add (local.get $ptr) (i32.const 28))
                    (i32.sub (local.get $len) (i32.const 29))
                    (i32.const 65536) (i32.sub (i32.const 0) (local.get $written))))))
            (return (i64.or
              (i64.shl (i64.const 65536) (i64.const 32))
              (i64.extend_i32_u (local.get $written))))))
        (if (i32.ne (i32.load8_u (i32.add (local.get $ptr) (i32.const 12))) (i32.const 101))
          (then unreachable))
        (memory.copy (i32.const 65536) (i32.const 0) (i32.const 19))
        (memory.copy (i32.const 65555) (local.get $ptr) (local.get $len))
        (i32.store8 (i32.add (i32.const 65555) (local.get $len)) (i32.const 125))
        (i64.or
          (i64.shl (i64.const 65536) (i64.const 32))
          (i64.extend_i32_u (i32.add (local.get $len) (i32.const 20))))))
  "#;

  pub(crate) fn test_guest() -> Vec<u8> {
    wat::parse_str(TEST_GUEST).unwrap()
  }

  #[test]
  fn accepts_the_v1_shape() {
    validate_module(&test_guest()).unwrap();
  }

  #[test]
  fn rejects_wasi_and_wrong_signatures() {
    let wasi = r#"(module
      (import "wasi_snapshot_preview1" "fd_write" (func (param i32 i32 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) i32.const 0)
      (func (export "call") (param i32 i32) (result i64) i64.const 0))"#;
    assert!(validate_module(&wat::parse_str(wasi).unwrap()).is_err());
    let wrong = r#"(module
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) i32.const 0)
      (func (export "call") (param i32 i32) (result i32) i32.const 0))"#;
    assert!(validate_module(&wat::parse_str(wrong).unwrap()).is_err());
    assert!(validate_module(b"not wasm").is_err());
  }

  fn pack(ptr: u32, len: u32) -> i64 {
    ((u64::from(ptr) << 32) | u64::from(len)) as i64
  }

  #[test]
  fn packs_pointer_and_length() {
    assert_eq!(
      unpack(pack(0xdead_beef, 0x0102_0304)),
      (0xdead_beef, 0x0102_0304)
    );
    assert!(validate_envelope(br#"{"ok":true,"value":null}"#).is_ok());
    assert!(validate_envelope(br#"{"ok":false,"error":{"code":"x","message":"y"}}"#).is_ok());
    assert!(validate_envelope(br#"{"ok":true}"#).is_err());
    assert!(validate_envelope(br#"{"ok":"yes","value":1}"#).is_err());
    assert!(error_envelope("a", "b").len() >= MIN_RESPONSE_BYTES);
    assert!(ok_envelope(()).len() >= MIN_RESPONSE_BYTES);
  }
}
