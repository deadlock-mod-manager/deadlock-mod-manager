//! The plugin worker process: runs one plugin backend under Wasmtime. It is
//! the application binary started with [`WORKER_ARG`], so dev and bundled
//! builds ship it without a sidecar. The guest gets no WASI and no imports
//! besides `dmm.host_call`, which forwards to the supervisor over stdio.

use super::abi;
use super::protocol::{self, FromWorker, ToWorker};
use std::cell::RefCell;
use std::io::{self, Write};
use std::rc::Rc;
use wasmtime::{
  Caller, Config, Engine, Linker, Module, Store, StoreLimits, StoreLimitsBuilder, Trap, format_err,
};

pub const WORKER_ARG: &str = "--dmm-plugin-worker";

pub type Transport = Box<dyn FnMut(&[u8]) -> Result<Vec<u8>, String>>;

struct GuestState {
  limits: StoreLimits,
  transport: Transport,
  pending: Option<(Vec<u8>, Vec<u8>)>,
  hostcalls: u32,
  transport_error: Option<String>,
}

#[derive(Debug)]
pub enum CallFailure {
  FuelExhausted,
  Trap(String),
  Abi(String),
  HostUnavailable(String),
}

impl CallFailure {
  pub fn code(&self) -> &'static str {
    match self {
      Self::FuelExhausted => "fuel_exhausted",
      Self::Trap(_) => "guest_trap",
      Self::Abi(_) => "abi_violation",
      Self::HostUnavailable(_) => "host_unavailable",
    }
  }

  pub fn message(&self) -> String {
    match self {
      Self::FuelExhausted => "Plugin exceeded its execution budget".into(),
      Self::Trap(message) | Self::Abi(message) | Self::HostUnavailable(message) => message.clone(),
    }
  }
}

pub struct Executor {
  engine: Engine,
  module: Module,
  linker: Linker<GuestState>,
}

fn host_call(
  mut caller: Caller<'_, GuestState>,
  in_ptr: i32,
  in_len: i32,
  out_ptr: i32,
  out_cap: i32,
) -> wasmtime::Result<i32> {
  let memory = caller
    .get_export(abi::EXPORT_MEMORY)
    .and_then(|export| export.into_memory())
    .ok_or_else(|| format_err!("guest has no memory export"))?;
  let Some(in_len) = usize::try_from(in_len)
    .ok()
    .filter(|len| *len <= abi::MAX_HOSTCALL_REQUEST_BYTES)
  else {
    return Ok(abi::HOSTCALL_MALFORMED);
  };
  let mut request = vec![0; in_len];
  memory
    .read(&caller, in_ptr as u32 as usize, &mut request)
    .map_err(|_| format_err!("hostcall request is out of bounds"))?;

  let state = caller.data_mut();
  let response = match state.pending.take() {
    Some((pending, response)) if pending == request => response,
    _ => {
      if state.hostcalls >= abi::MAX_HOSTCALLS_PER_CALL {
        return Ok(abi::HOSTCALL_LIMIT_REACHED);
      }
      state.hostcalls += 1;
      match (state.transport)(&request) {
        Ok(response) => response,
        Err(error) => {
          state.transport_error = Some(error.clone());
          return Err(format_err!("host unavailable: {error}"));
        }
      }
    }
  };
  let capacity = usize::try_from(out_cap).unwrap_or(0);
  if response.len() > capacity {
    let required = response.len().max(abi::MIN_RESPONSE_BYTES);
    caller.data_mut().pending = Some((request, response));
    return Ok(-(required as i32));
  }
  memory
    .write(&mut caller, out_ptr as u32 as usize, &response)
    .map_err(|_| format_err!("hostcall output buffer is out of bounds"))?;
  Ok(response.len() as i32)
}

impl Executor {
  pub fn new(bytes: &[u8]) -> Result<Self, String> {
    abi::validate_module(bytes)?;
    let mut config = Config::new();
    config
      .consume_fuel(true)
      .max_wasm_stack(512 * 1024)
      .wasm_multi_memory(false)
      .wasm_memory64(false);
    let engine = Engine::new(&config).map_err(|error| error.to_string())?;
    let module = Module::new(&engine, bytes).map_err(|error| error.to_string())?;
    let mut linker = Linker::new(&engine);
    linker
      .func_wrap(abi::IMPORT_MODULE, abi::IMPORT_HOST_CALL, host_call)
      .map_err(|error| error.to_string())?;
    Ok(Self {
      engine,
      module,
      linker,
    })
  }

  /// Runs one guest call in a fresh instance; nothing survives between calls
  /// except what the guest stored through the host.
  pub fn call(&self, input: &[u8], transport: Transport) -> Result<String, CallFailure> {
    let limits = StoreLimitsBuilder::new()
      .memory_size(abi::MAX_GUEST_MEMORY_BYTES)
      .memories(1)
      .instances(1)
      .tables(4)
      .table_elements(100_000)
      .build();
    let mut store = Store::new(
      &self.engine,
      GuestState {
        limits,
        transport,
        pending: None,
        hostcalls: 0,
        transport_error: None,
      },
    );
    store.limiter(|state| &mut state.limits);
    store
      .set_fuel(abi::FUEL_PER_CALL)
      .map_err(|error| CallFailure::Abi(error.to_string()))?;

    let classify = |store: &mut Store<GuestState>, error: wasmtime::Error| {
      if let Some(message) = store.data_mut().transport_error.take() {
        CallFailure::HostUnavailable(message)
      } else if error.downcast_ref::<Trap>() == Some(&Trap::OutOfFuel) {
        CallFailure::FuelExhausted
      } else {
        CallFailure::Trap(format!("{error:#}"))
      }
    };
    let instance = self
      .linker
      .instantiate(&mut store, &self.module)
      .map_err(|error| classify(&mut store, error))?;
    let memory = instance
      .get_memory(&mut store, abi::EXPORT_MEMORY)
      .ok_or_else(|| CallFailure::Abi("guest has no memory export".into()))?;
    let alloc = instance
      .get_typed_func::<i32, i32>(&mut store, abi::EXPORT_ALLOC)
      .map_err(|error| CallFailure::Abi(error.to_string()))?;
    let call = instance
      .get_typed_func::<(i32, i32), i64>(&mut store, abi::EXPORT_CALL)
      .map_err(|error| CallFailure::Abi(error.to_string()))?;

    let len = i32::try_from(input.len())
      .ok()
      .filter(|_| input.len() <= abi::MAX_CALL_INPUT_BYTES)
      .ok_or_else(|| CallFailure::Abi("call input exceeds the limit".into()))?;
    let ptr = alloc
      .call(&mut store, len)
      .map_err(|error| classify(&mut store, error))?;
    memory
      .write(&mut store, ptr as u32 as usize, input)
      .map_err(|_| CallFailure::Abi("alloc returned an out-of-bounds pointer".into()))?;
    let packed = call
      .call(&mut store, (ptr, len))
      .map_err(|error| classify(&mut store, error))?;

    let (out_ptr, out_len) = abi::unpack(packed);
    if out_len as usize > abi::MAX_CALL_OUTPUT_BYTES {
      return Err(CallFailure::Abi(
        "call output exceeds the 1 MiB limit".into(),
      ));
    }
    let mut output = vec![0; out_len as usize];
    memory
      .read(&store, out_ptr as usize, &mut output)
      .map_err(|_| CallFailure::Abi("call output is out of bounds".into()))?;
    abi::validate_envelope(&output).map_err(CallFailure::Abi)
  }
}

struct Stdio {
  stdin: io::StdinLock<'static>,
  stdout: io::StdoutLock<'static>,
}

/// Worker process entry point. Returns the process exit code.
pub fn run() -> i32 {
  let stdio = Rc::new(RefCell::new(Stdio {
    stdin: io::stdin().lock(),
    stdout: io::stdout().lock(),
  }));
  {
    let mut stdio = stdio.borrow_mut();
    if stdio.stdout.write_all(protocol::MAGIC).is_err() || stdio.stdout.flush().is_err() {
      return 2;
    }
  }
  let wasm = match protocol::read_frame(
    &mut stdio.borrow_mut().stdin,
    protocol::MAX_LOAD_FRAME_BYTES,
  ) {
    Ok(Some(bytes)) => bytes,
    Ok(None) => return 0,
    Err(_) => return 2,
  };
  let executor = match Executor::new(&wasm) {
    Ok(executor) => executor,
    Err(message) => {
      let _ = protocol::write_message(
        &mut stdio.borrow_mut().stdout,
        &FromWorker::LoadFailed { message },
      );
      return 1;
    }
  };
  if protocol::write_message(&mut stdio.borrow_mut().stdout, &FromWorker::Loaded).is_err() {
    return 2;
  }

  loop {
    let message = protocol::read_message::<ToWorker>(&mut stdio.borrow_mut().stdin);
    let (id, input) = match message {
      Ok(Some(ToWorker::Call { id, input })) => (id, input),
      Ok(None) => return 0,
      Ok(Some(ToWorker::HostResult { .. })) | Err(_) => return 2,
    };
    let channel = Rc::clone(&stdio);
    let transport: Transport = Box::new(move |request: &[u8]| {
      let Ok(request) = std::str::from_utf8(request) else {
        return Ok(
          abi::error_envelope("invalid_request", "Hostcall request is not UTF-8").into_bytes(),
        );
      };
      let message = protocol::encode_message(&FromWorker::HostCall {
        id,
        request: request.to_owned(),
      })
      .map_err(|error| error.to_string())?;
      let Some(message) = message else {
        return Ok(
          abi::error_envelope(
            "request_too_large",
            "Hostcall request is too large to forward",
          )
          .into_bytes(),
        );
      };
      let mut stdio = channel.borrow_mut();
      protocol::write_frame(&mut stdio.stdout, &message).map_err(|error| error.to_string())?;
      match protocol::read_message::<ToWorker>(&mut stdio.stdin) {
        Ok(Some(ToWorker::HostResult { id: reply, output })) if reply == id => {
          Ok(output.into_bytes())
        }
        _ => Err("supervisor ended the session".into()),
      }
    });
    let reply = match executor.call(input.as_bytes(), transport) {
      Ok(output) => FromWorker::Result { id, output },
      Err(CallFailure::HostUnavailable(_)) => return 3,
      Err(failure) => FromWorker::Failed {
        id,
        code: failure.code().into(),
        message: failure.message(),
      },
    };
    if protocol::write_message(&mut stdio.borrow_mut().stdout, &reply).is_err() {
      return 2;
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::abi::tests::test_guest;
  use std::sync::{Arc, Mutex};

  fn no_host() -> Transport {
    Box::new(|_| Err("no host in this test".into()))
  }

  #[test]
  fn echoes_through_the_v1_abi() {
    let executor = Executor::new(&test_guest()).unwrap();
    let output = executor
      .call(br#"{"command":"echo","payload":{"a":1}}"#, no_host())
      .unwrap();
    let value: serde_json::Value = serde_json::from_str(&output).unwrap();
    assert_eq!(value["ok"], true);
    assert_eq!(value["value"]["payload"]["a"], 1);
  }

  #[test]
  fn retries_with_reported_capacity_without_repeating_the_hostcall() {
    let executor = Executor::new(&test_guest()).unwrap();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let record = Arc::clone(&seen);
    let transport: Transport = Box::new(move |request| {
      record.lock().unwrap().push(request.to_vec());
      Ok(abi::ok_envelope("a response much longer than four bytes").into_bytes())
    });
    let output = executor
      .call(
        br#"{"command":"host","payload":{"method":"storage.get","params":{"key":"k"}}}"#,
        transport,
      )
      .unwrap();
    assert!(output.contains("much longer"));
    let seen = seen.lock().unwrap();
    assert_eq!(seen.len(), 1);
    assert_eq!(
      seen[0],
      br#"{"method":"storage.get","params":{"key":"k"}}"#.to_vec()
    );
  }

  #[test]
  fn bounds_infinite_loops_with_fuel_and_reports_traps() {
    let executor = Executor::new(&test_guest()).unwrap();
    let spin = executor.call(br#"{"command":"spin","payload":null}"#, no_host());
    assert!(matches!(spin, Err(CallFailure::FuelExhausted)), "{spin:?}");
    let trap = executor.call(br#"{"command":"tick","payload":null}"#, no_host());
    assert!(matches!(trap, Err(CallFailure::Trap(_))), "{trap:?}");
    let echo = executor.call(br#"{"command":"echo","payload":null}"#, no_host());
    assert!(echo.is_ok(), "a trap must not poison later calls");
  }

  #[test]
  fn caps_guest_memory_growth() {
    let greedy = r#"(module
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) i32.const 0)
      (func (export "call") (param i32 i32) (result i64)
        (if (i32.ne (memory.grow (i32.const 2048)) (i32.const -1)) (then unreachable))
        (i64.const 0)))"#;
    let executor = Executor::new(&wat::parse_str(greedy).unwrap()).unwrap();
    let result = executor.call(b"{}", no_host());
    assert!(
      matches!(result, Err(CallFailure::Abi(_))),
      "128 MiB growth must fail and leave an empty, invalid response: {result:?}"
    );
  }
}
