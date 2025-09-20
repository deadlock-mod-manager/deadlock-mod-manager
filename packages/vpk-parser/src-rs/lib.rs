mod error;
mod parser;
mod types;

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::slice;

pub use error::{Result, VpkError};
pub use parser::VpkParser;
pub use types::*;

// Helper function to convert Rust string to C string
fn to_c_string(s: String) -> *mut c_char {
    match CString::new(s) {
        Ok(c_str) => c_str.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

// Helper function to free C string
#[no_mangle]
pub extern "C" fn vpk_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

// Parse VPK from buffer with options as JSON string
#[no_mangle]
pub extern "C" fn vpk_parse(
    buffer: *const u8,
    buffer_len: usize,
    options_json: *const c_char,
) -> *mut c_char {
    if buffer.is_null() || buffer_len == 0 {
        return to_c_string(r#"{"error": "Invalid buffer"}"#.to_string());
    }

    let buffer_slice = unsafe { slice::from_raw_parts(buffer, buffer_len) };
    let buffer_vec = buffer_slice.to_vec();

    // Parse options from JSON
    let options = if options_json.is_null() {
        VpkParseOptions::default()
    } else {
        let options_str = unsafe {
            match CStr::from_ptr(options_json).to_str() {
                Ok(s) => s,
                Err(_) => return to_c_string(r#"{"error": "Invalid options string"}"#.to_string()),
            }
        };

        match serde_json::from_str::<VpkParseOptions>(options_str) {
            Ok(opts) => opts,
            Err(e) => return to_c_string(format!(r#"{{"error": "Invalid options JSON: {}"}}"#, e)),
        }
    };

    // Parse the VPK
    match VpkParser::parse(buffer_vec, options) {
        Ok(parsed) => match serde_json::to_string(&parsed) {
            Ok(json) => to_c_string(json),
            Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {}"}}"#, e)),
        },
        Err(e) => to_c_string(format!(r#"{{"error": "{}"}}"#, e)),
    }
}

// Get VPK hashes only (faster)
#[no_mangle]
pub extern "C" fn vpk_get_hashes(
    buffer: *const u8,
    buffer_len: usize,
    file_path: *const c_char,
) -> *mut c_char {
    if buffer.is_null() || buffer_len == 0 {
        return to_c_string(r#"{"error": "Invalid buffer"}"#.to_string());
    }

    let buffer_slice = unsafe { slice::from_raw_parts(buffer, buffer_len) };
    let buffer_vec = buffer_slice.to_vec();

    let path = if file_path.is_null() {
        String::new()
    } else {
        unsafe {
            match CStr::from_ptr(file_path).to_str() {
                Ok(s) => s.to_string(),
                Err(_) => String::new(),
            }
        }
    };

    let options = VpkParseOptions {
        include_full_file_hash: true,
        include_merkle: true,
        file_path: path,
        last_modified: None,
    };

    match VpkParser::parse(buffer_vec, options) {
        Ok(parsed) => match serde_json::to_string(&parsed.fingerprint) {
            Ok(json) => to_c_string(json),
            Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {}"}}"#, e)),
        },
        Err(e) => to_c_string(format!(r#"{{"error": "{}"}}"#, e)),
    }
}

// Get basic VPK info (fastest)
#[no_mangle]
pub extern "C" fn vpk_get_info(buffer: *const u8, buffer_len: usize) -> *mut c_char {
    if buffer.is_null() || buffer_len == 0 {
        return to_c_string(r#"{"error": "Invalid buffer"}"#.to_string());
    }

    let buffer_slice = unsafe { slice::from_raw_parts(buffer, buffer_len) };
    let buffer_vec = buffer_slice.to_vec();

    let options = VpkParseOptions {
        include_full_file_hash: false,
        include_merkle: false,
        file_path: String::new(),
        last_modified: None,
    };

    match VpkParser::parse(buffer_vec, options) {
        Ok(parsed) => {
            let info = serde_json::json!({
                "version": parsed.version,
                "file_count": parsed.entries.len(),
                "manifest_sha256": parsed.manifest_sha256,
                "fast_hash": parsed.fingerprint.fast_hash
            });
            match serde_json::to_string(&info) {
                Ok(json) => to_c_string(json),
                Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {}"}}"#, e)),
            }
        }
        Err(e) => to_c_string(format!(r#"{{"error": "{}"}}"#, e)),
    }
}

// Get library version
#[no_mangle]
pub extern "C" fn vpk_version() -> *mut c_char {
    to_c_string(env!("CARGO_PKG_VERSION").to_string())
}
