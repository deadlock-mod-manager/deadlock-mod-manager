//! Guest SDK for Deadlock Mod Manager external plugins: guest ABI v1 and the
//! SDK 1 host API (see [`api`]).
//!
//! A plugin backend is a `wasm32-unknown-unknown` module that exports `memory`,
//! `alloc(len: i32) -> i32`, and `call(ptr: i32, len: i32) -> i64`, and imports
//! only `dmm.host_call`. The host creates a fresh instance for every call, so
//! anything that must outlive a call goes through plugin storage.
//!
//! Plugin logic is written against the [`Host`] trait so it can be unit tested
//! natively with a fake host; [`export_plugin!`] wires it to the real import.

pub mod abi;
pub mod api;
mod envelope;
#[cfg(target_arch = "wasm32")]
#[doc(hidden)]
pub mod guest;
mod host;

pub use envelope::{PluginError, codes, dispatch, encode_response};
#[cfg(target_arch = "wasm32")]
pub use host::WasmHost;
pub use host::{Host, call_with_buffer, decode_host_response, encode_host_request};
pub use serde_json::{Value, json};

/// Exports the ABI v1 `alloc` and `call` functions for a command handler with
/// the signature `fn(&str, Value, &mut impl Host) -> Result<Value, PluginError>`.
/// Exports exist only on `wasm32` targets so the crate still builds and tests
/// natively.
#[macro_export]
macro_rules! export_plugin {
  ($handler:path) => {
    #[cfg(target_arch = "wasm32")]
    #[unsafe(no_mangle)]
    pub extern "C" fn alloc(len: i32) -> i32 {
      $crate::guest::alloc(len)
    }

    #[cfg(target_arch = "wasm32")]
    #[unsafe(no_mangle)]
    pub extern "C" fn call(ptr: i32, len: i32) -> i64 {
      $crate::guest::call(ptr, len, |command, payload, host| {
        $handler(command, payload, host)
      })
    }
  };
}
