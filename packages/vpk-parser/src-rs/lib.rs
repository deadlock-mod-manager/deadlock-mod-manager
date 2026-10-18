mod error;
mod parser;
mod types;

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::Path;
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
/// Frees a string returned by this library.
///
/// # Safety
/// `ptr` must be null or an unfreed pointer returned by this library.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vpk_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

// Parse VPK from buffer with options as JSON string
/// Parses a VPK buffer with optional JSON options.
///
/// # Safety
/// A non-null `buffer` must be readable for `buffer_len` bytes for this call.
/// Non-null `options_json` must point to a readable, null-terminated C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vpk_parse(
    buffer: *const u8,
    buffer_len: usize,
    options_json: *const c_char,
) -> *mut c_char {
    if buffer.is_null() || buffer_len == 0 {
        return to_c_string(r#"{"error": "Invalid buffer"}"#.to_string());
    }

    let buffer_slice = unsafe { slice::from_raw_parts(buffer, buffer_len) };
    let buffer_vec = buffer_slice.to_vec();

    let options = match unsafe { read_parse_options(options_json) } {
        Ok(options) => options,
        Err(error) => return error,
    };

    parsed_to_c_string(VpkParser::parse(buffer_vec, options))
}

// Parse VPK from a file path, hashing it in chunks instead of loading it
/// Parses a VPK file on disk with optional JSON options.
///
/// # Safety
/// `file_path` must point to a readable, null-terminated UTF-8 C string.
/// Non-null `options_json` must point to a readable, null-terminated C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vpk_parse_file(
    file_path: *const c_char,
    options_json: *const c_char,
) -> *mut c_char {
    if file_path.is_null() {
        return to_c_string(r#"{"error": "Invalid file path"}"#.to_string());
    }
    let path = match unsafe { CStr::from_ptr(file_path) }.to_str() {
        Ok(path) => path,
        Err(_) => return to_c_string(r#"{"error": "Invalid file path string"}"#.to_string()),
    };

    let options = match unsafe { read_parse_options(options_json) } {
        Ok(options) => options,
        Err(error) => return error,
    };

    parsed_to_c_string(VpkParser::parse_file(Path::new(path), options))
}

/// # Safety
/// Non-null `options_json` must point to a readable, null-terminated C string.
unsafe fn read_parse_options(
    options_json: *const c_char,
) -> std::result::Result<VpkParseOptions, *mut c_char> {
    if options_json.is_null() {
        return Ok(VpkParseOptions::default());
    }
    let options_str = match unsafe { CStr::from_ptr(options_json) }.to_str() {
        Ok(s) => s,
        Err(_) => {
            return Err(to_c_string(
                r#"{"error": "Invalid options string"}"#.to_string(),
            ));
        }
    };
    serde_json::from_str::<VpkParseOptions>(options_str)
        .map_err(|e| to_c_string(format!(r#"{{"error": "Invalid options JSON: {e}"}}"#)))
}

fn parsed_to_c_string(parsed: Result<VpkParsed>) -> *mut c_char {
    match parsed {
        Ok(parsed) => match serde_json::to_string(&parsed) {
            Ok(json) => to_c_string(json),
            Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {e}"}}"#)),
        },
        Err(e) => to_c_string(format!(r#"{{"error": "{e}"}}"#)),
    }
}

// Get VPK hashes only (faster)
/// Returns the fingerprint of a VPK buffer.
///
/// # Safety
/// A non-null `buffer` must be readable for `buffer_len` bytes for this call.
/// Non-null `file_path` must point to a readable, null-terminated C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vpk_get_hashes(
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
        include_entries: true,
    };

    match VpkParser::parse(buffer_vec, options) {
        Ok(parsed) => match serde_json::to_string(&parsed.fingerprint) {
            Ok(json) => to_c_string(json),
            Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {e}"}}"#)),
        },
        Err(e) => to_c_string(format!(r#"{{"error": "{e}"}}"#)),
    }
}

// Get basic VPK info (fastest)
/// Returns basic information about a VPK buffer.
///
/// # Safety
/// A non-null `buffer` must be readable for `buffer_len` bytes for this call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vpk_get_info(buffer: *const u8, buffer_len: usize) -> *mut c_char {
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
        include_entries: true,
    };

    match VpkParser::parse(buffer_vec, options) {
        Ok(parsed) => {
            let info = VpkInfo {
                version: parsed.version,
                file_count: parsed.entries.len(),
                manifest_sha256: parsed.manifest_sha256,
                fast_hash: parsed.fingerprint.fast_hash,
            };
            match serde_json::to_string(&info) {
                Ok(json) => to_c_string(json),
                Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {e}"}}"#)),
            }
        }
        Err(e) => to_c_string(format!(r#"{{"error": "{e}"}}"#)),
    }
}

// Get library version
#[unsafe(no_mangle)]
pub extern "C" fn vpk_version() -> *mut c_char {
    to_c_string(env!("CARGO_PKG_VERSION").to_string())
}
