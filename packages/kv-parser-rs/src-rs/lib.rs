mod ast;
mod diff;
mod document;
mod error;
mod parser;
mod serializer;
mod tokenizer;
mod types;

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::slice;

pub use diff::{is_patch_already_applied, DiffApplicator, DiffGenerator};
pub use document::KvDocument;
pub use error::{KvError, Result};
pub use parser::Parser;
pub use serializer::Serializer;
pub use tokenizer::Tokenizer;
pub use types::*;

// Helper function to convert Rust string to C string
fn to_c_string(s: String) -> *mut c_char {
    match CString::new(s) {
        Ok(c_str) => c_str.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// # Safety
/// The caller must ensure `ptr` is a valid pointer returned by `to_c_string()`.
#[unsafe(no_mangle)]
#[allow(unsafe_op_in_unsafe_fn, clippy::missing_safety_doc)]
pub unsafe extern "C" fn kv_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        let _ = CString::from_raw(ptr);
    }
}

// Get library version
#[unsafe(no_mangle)]
pub extern "C" fn kv_version() -> *mut c_char {
    to_c_string(env!("CARGO_PKG_VERSION").to_string())
}

/// # Safety
/// The caller must ensure `buffer` is a valid pointer to `buffer_len` bytes and `options_json` is null or a valid C string.
#[unsafe(no_mangle)]
#[allow(clippy::missing_safety_doc)]
pub unsafe extern "C" fn kv_parse(
    buffer: *const u8,
    buffer_len: usize,
    options_json: *const c_char,
) -> *mut c_char {
    if buffer.is_null() || buffer_len == 0 {
        return to_c_string(r#"{"error": "Invalid buffer"}"#.to_string());
    }

    let buffer_slice = unsafe { slice::from_raw_parts(buffer, buffer_len) };
    let input = match String::from_utf8(buffer_slice.to_vec()) {
        Ok(s) => s,
        Err(e) => return to_c_string(format!(r#"{{"error": "Invalid UTF-8: {e}"}}"#)),
    };

    // Parse options from JSON
    let options = if options_json.is_null() {
        ParseOptions::default()
    } else {
        let options_str = unsafe {
            match CStr::from_ptr(options_json).to_str() {
                Ok(s) => s,
                Err(_) => return to_c_string(r#"{"error": "Invalid options string"}"#.to_string()),
            }
        };

        match serde_json::from_str::<ParseOptions>(options_str) {
            Ok(opts) => opts,
            Err(e) => return to_c_string(format!(r#"{{"error": "Invalid options JSON: {e}"}}"#)),
        }
    };

    // Parse the KV
    match Parser::parse(&input, options) {
        Ok(result) => match serde_json::to_string(&result) {
            Ok(json) => to_c_string(json),
            Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {e}"}}"#)),
        },
        Err(e) => to_c_string(format!(r#"{{"error": "{e}"}}"#)),
    }
}

/// # Safety
/// The caller must ensure `ast_json` is null or a valid C string.
#[unsafe(no_mangle)]
#[allow(clippy::missing_safety_doc)]
pub unsafe extern "C" fn kv_serialize_ast(ast_json: *const c_char) -> *mut c_char {
    if ast_json.is_null() {
        return to_c_string(r#"{"error": "Invalid AST JSON"}"#.to_string());
    }

    let ast_str = unsafe {
        match CStr::from_ptr(ast_json).to_str() {
            Ok(s) => s,
            Err(_) => return to_c_string(r#"{"error": "Invalid AST string"}"#.to_string()),
        }
    };

    let ast: DocumentNode = match serde_json::from_str(ast_str) {
        Ok(a) => a,
        Err(e) => return to_c_string(format!(r#"{{"error": "Invalid AST JSON: {e}"}}"#)),
    };

    to_c_string(Serializer::serialize_ast(&ast))
}

/// # Safety
/// The caller must ensure `data_json` and `options_json` are null or valid C strings.
#[unsafe(no_mangle)]
#[allow(clippy::missing_safety_doc)]
pub unsafe extern "C" fn kv_serialize_data(
    data_json: *const c_char,
    options_json: *const c_char,
) -> *mut c_char {
    if data_json.is_null() {
        return to_c_string(r#"{"error": "Invalid data JSON"}"#.to_string());
    }

    let data_str = unsafe {
        match CStr::from_ptr(data_json).to_str() {
            Ok(s) => s,
            Err(_) => return to_c_string(r#"{"error": "Invalid data string"}"#.to_string()),
        }
    };

    let data: KeyValuesObject = match serde_json::from_str(data_str) {
        Ok(d) => d,
        Err(e) => return to_c_string(format!(r#"{{"error": "Invalid data JSON: {e}"}}"#)),
    };

    let options = if options_json.is_null() {
        SerializeOptions::default()
    } else {
        let options_str = unsafe {
            match CStr::from_ptr(options_json).to_str() {
                Ok(s) => s,
                Err(_) => return to_c_string(r#"{"error": "Invalid options string"}"#.to_string()),
            }
        };

        match serde_json::from_str::<SerializeOptions>(options_str) {
            Ok(opts) => opts,
            Err(e) => return to_c_string(format!(r#"{{"error": "Invalid options JSON: {e}"}}"#)),
        }
    };

    let serializer = Serializer::new(options);
    match serializer.serialize_data(&data) {
        Ok(result) => to_c_string(result),
        Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {e}"}}"#)),
    }
}

/// # Safety
/// The caller must ensure `source_json` and `target_json` are null or valid C strings.
#[unsafe(no_mangle)]
#[allow(clippy::missing_safety_doc)]
pub unsafe extern "C" fn kv_diff(source_json: *const c_char, target_json: *const c_char) -> *mut c_char {
    if source_json.is_null() || target_json.is_null() {
        return to_c_string(r#"{"error": "Invalid JSON"}"#.to_string());
    }

    let source_str = unsafe {
        match CStr::from_ptr(source_json).to_str() {
            Ok(s) => s,
            Err(_) => return to_c_string(r#"{"error": "Invalid source string"}"#.to_string()),
        }
    };

    let target_str = unsafe {
        match CStr::from_ptr(target_json).to_str() {
            Ok(s) => s,
            Err(_) => return to_c_string(r#"{"error": "Invalid target string"}"#.to_string()),
        }
    };

    let source: KeyValuesObject = match serde_json::from_str(source_str) {
        Ok(d) => d,
        Err(e) => return to_c_string(format!(r#"{{"error": "Invalid source JSON: {e}"}}"#)),
    };

    let target: KeyValuesObject = match serde_json::from_str(target_str) {
        Ok(d) => d,
        Err(e) => return to_c_string(format!(r#"{{"error": "Invalid target JSON: {e}"}}"#)),
    };

    let diff = DiffGenerator::generate_diff(&source, &target);

    match serde_json::to_string(&diff) {
        Ok(json) => to_c_string(json),
        Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {e}"}}"#)),
    }
}

/// # Safety
/// The caller must ensure `source_json` and `diff_json` are null or valid C strings.
#[unsafe(no_mangle)]
#[allow(clippy::missing_safety_doc)]
pub unsafe extern "C" fn kv_apply_diff(
    source_json: *const c_char,
    diff_json: *const c_char,
) -> *mut c_char {
    if source_json.is_null() || diff_json.is_null() {
        return to_c_string(r#"{"error": "Invalid JSON"}"#.to_string());
    }

    let source_str = unsafe {
        match CStr::from_ptr(source_json).to_str() {
            Ok(s) => s,
            Err(_) => return to_c_string(r#"{"error": "Invalid source string"}"#.to_string()),
        }
    };

    let diff_str = unsafe {
        match CStr::from_ptr(diff_json).to_str() {
            Ok(s) => s,
            Err(_) => return to_c_string(r#"{"error": "Invalid diff string"}"#.to_string()),
        }
    };

    let source: KeyValuesObject = match serde_json::from_str(source_str) {
        Ok(d) => d,
        Err(e) => return to_c_string(format!(r#"{{"error": "Invalid source JSON: {e}"}}"#)),
    };

    let diff: DocumentDiff = match serde_json::from_str(diff_str) {
        Ok(d) => d,
        Err(e) => return to_c_string(format!(r#"{{"error": "Invalid diff JSON: {e}"}}"#)),
    };

    match DiffApplicator::apply_to_data(&source, &diff) {
        Ok(result) => match serde_json::to_string(&result) {
            Ok(json) => to_c_string(json),
            Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {e}"}}"#)),
        },
        Err(e) => to_c_string(format!(r#"{{"error": "{e}"}}"#)),
    }
}

/// # Safety
/// The caller must ensure `diff_json` is null or a valid C string.
#[unsafe(no_mangle)]
#[allow(clippy::missing_safety_doc)]
pub unsafe extern "C" fn kv_diff_stats(diff_json: *const c_char) -> *mut c_char {
    if diff_json.is_null() {
        return to_c_string(r#"{"error": "Invalid diff JSON"}"#.to_string());
    }

    let diff_str = unsafe {
        match CStr::from_ptr(diff_json).to_str() {
            Ok(s) => s,
            Err(_) => return to_c_string(r#"{"error": "Invalid diff string"}"#.to_string()),
        }
    };

    let diff: DocumentDiff = match serde_json::from_str(diff_str) {
        Ok(d) => d,
        Err(e) => return to_c_string(format!(r#"{{"error": "Invalid diff JSON: {e}"}}"#)),
    };

    let stats = DiffGenerator::get_stats(&diff);

    match serde_json::to_string(&stats) {
        Ok(json) => to_c_string(json),
        Err(e) => to_c_string(format!(r#"{{"error": "Serialization failed: {e}"}}"#)),
    }
}
