use crate::extract::{extract_mod, ExtractOptions};
use crate::ffi_types::*;
use crate::info::{list_files, list_layer_files, read_package_info};
use crate::pack::{pack_mod, PackOptions};
use crate::validator::{validate_project, ValidationOptions};
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::{Path, PathBuf};

/// Helper function to convert Rust string to C string
fn to_c_string(s: String) -> *mut c_char {
    match CString::new(s) {
        Ok(c_str) => c_str.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Helper function to convert C string to Rust &str
fn from_c_str<'a>(ptr: *const c_char) -> Result<&'a str, String> {
    if ptr.is_null() {
        return Err("Null pointer".to_string());
    }
    unsafe {
        CStr::from_ptr(ptr)
            .to_str()
            .map_err(|e| format!("Invalid UTF-8: {}", e))
    }
}

/// Helper function to create error JSON
fn error_json(message: &str) -> String {
    serde_json::json!({ "error": message }).to_string()
}

/// Free a C string allocated by Rust
#[unsafe(no_mangle)]
pub extern "C" fn dmodpkg_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

/// Get library version
#[unsafe(no_mangle)]
pub extern "C" fn dmodpkg_version() -> *mut c_char {
    to_c_string(env!("CARGO_PKG_VERSION").to_string())
}

/// Pack a mod project into a .dmodpkg file
///
/// # Arguments
/// * `project_path` - Path to the mod project directory
/// * `output_path` - Path where the .dmodpkg file will be created (null for default)
/// * `options_json` - JSON string with pack options (null for defaults)
///
/// # Returns
/// JSON string with PackResultFFI or error
#[unsafe(no_mangle)]
pub extern "C" fn dmodpkg_pack(
    project_path: *const c_char,
    output_path: *const c_char,
    options_json: *const c_char,
) -> *mut c_char {
    let project_path_str = match from_c_str(project_path) {
        Ok(s) => s,
        Err(e) => return to_c_string(error_json(&format!("Invalid project path: {}", e))),
    };

    let output_path_opt = if output_path.is_null() {
        None
    } else {
        match from_c_str(output_path) {
            Ok(s) => Some(PathBuf::from(s)),
            Err(e) => return to_c_string(error_json(&format!("Invalid output path: {}", e))),
        }
    };

    let options = if options_json.is_null() {
        PackOptions::default()
    } else {
        match from_c_str(options_json) {
            Ok(json_str) => match serde_json::from_str::<serde_json::Value>(json_str) {
                Ok(json) => {
                    let compression_level = json
                        .get("compressionLevel")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(9) as i32;
                    let chunk_size = json
                        .get("chunkSize")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(1024 * 1024) as usize;
                    let skip_validation = json
                        .get("skipValidation")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    PackOptions {
                        compression_level,
                        chunk_size,
                        skip_validation,
                        validation: ValidationOptions::default(),
                    }
                }
                Err(e) => {
                    return to_c_string(error_json(&format!("Invalid options JSON: {}", e)))
                }
            },
            Err(e) => return to_c_string(error_json(&format!("Invalid options string: {}", e))),
        }
    };

    match pack_mod(project_path_str, output_path_opt, options) {
        Ok(result) => {
            let ffi_result = PackResultFFI {
                package_path: result.package_path.to_string_lossy().to_string(),
                file_count: result.stats.file_count,
                uncompressed_size: result.stats.total_uncompressed_size as u64,
                compressed_size: result.stats.total_compressed_size as u64,
                compression_ratio: result.stats.compression_ratio(),
                warnings: result.warnings,
            };
            match serde_json::to_string(&ffi_result) {
                Ok(json) => to_c_string(json),
                Err(e) => to_c_string(error_json(&format!("Serialization failed: {}", e))),
            }
        }
        Err(e) => to_c_string(error_json(&e.to_string())),
    }
}

/// Extract a .dmodpkg file to a project directory
///
/// # Arguments
/// * `package_path` - Path to the .dmodpkg file
/// * `output_path` - Path where the project will be extracted (null for default)
/// * `options_json` - JSON string with extract options (null for defaults)
///
/// # Returns
/// JSON string with ExtractResultFFI or error
#[unsafe(no_mangle)]
pub extern "C" fn dmodpkg_extract(
    package_path: *const c_char,
    output_path: *const c_char,
    options_json: *const c_char,
) -> *mut c_char {
    let package_path_str = match from_c_str(package_path) {
        Ok(s) => s,
        Err(e) => return to_c_string(error_json(&format!("Invalid package path: {}", e))),
    };

    let output_path_opt = if output_path.is_null() {
        None
    } else {
        match from_c_str(output_path) {
            Ok(s) => Some(PathBuf::from(s)),
            Err(e) => return to_c_string(error_json(&format!("Invalid output path: {}", e))),
        }
    };

    let options = if options_json.is_null() {
        ExtractOptions::default()
    } else {
        match from_c_str(options_json) {
            Ok(json_str) => match serde_json::from_str::<serde_json::Value>(json_str) {
                Ok(json) => {
                    let verify_checksums = json
                        .get("verifyChecksums")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    let layers = json
                        .get("layers")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default();
                    let overwrite = json
                        .get("overwrite")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    ExtractOptions {
                        verify_checksums,
                        layers,
                        overwrite,
                    }
                }
                Err(e) => {
                    return to_c_string(error_json(&format!("Invalid options JSON: {}", e)))
                }
            },
            Err(e) => return to_c_string(error_json(&format!("Invalid options string: {}", e))),
        }
    };

    match extract_mod(package_path_str, output_path_opt, options) {
        Ok(result) => {
            let ffi_result = ExtractResultFFI {
                project_path: result.project_path.to_string_lossy().to_string(),
                files_extracted: result.files_extracted,
                bytes_extracted: result.bytes_extracted,
                layers_extracted: result.layers_extracted,
            };
            match serde_json::to_string(&ffi_result) {
                Ok(json) => to_c_string(json),
                Err(e) => to_c_string(error_json(&format!("Serialization failed: {}", e))),
            }
        }
        Err(e) => to_c_string(error_json(&e.to_string())),
    }
}

/// Get package information
///
/// # Arguments
/// * `package_path` - Path to the .dmodpkg file
///
/// # Returns
/// JSON string with PackageInfoFFI or error
#[unsafe(no_mangle)]
pub extern "C" fn dmodpkg_get_info(package_path: *const c_char) -> *mut c_char {
    let package_path_str = match from_c_str(package_path) {
        Ok(s) => s,
        Err(e) => return to_c_string(error_json(&format!("Invalid package path: {}", e))),
    };

    match read_package_info(package_path_str) {
        Ok(info) => {
            let ffi_info = PackageInfoFFI {
                config: info.config,
                build_info: info.build_info,
                stats: info.stats.into(),
                layers: info.layers.into_iter().map(|l| l.into()).collect(),
                files: info.files.into_iter().map(|f| f.into()).collect(),
            };
            match serde_json::to_string(&ffi_info) {
                Ok(json) => to_c_string(json),
                Err(e) => to_c_string(error_json(&format!("Serialization failed: {}", e))),
            }
        }
        Err(e) => to_c_string(error_json(&e.to_string())),
    }
}

/// Validate a mod project
///
/// # Arguments
/// * `project_path` - Path to the mod project directory
/// * `options_json` - JSON string with validation options (null for defaults)
///
/// # Returns
/// JSON string with ValidationResultFFI or error
#[unsafe(no_mangle)]
pub extern "C" fn dmodpkg_validate(
    project_path: *const c_char,
    options_json: *const c_char,
) -> *mut c_char {
    let project_path_str = match from_c_str(project_path) {
        Ok(s) => s,
        Err(e) => return to_c_string(error_json(&format!("Invalid project path: {}", e))),
    };

    let options = if options_json.is_null() {
        ValidationOptions::default()
    } else {
        match from_c_str(options_json) {
            Ok(json_str) => match serde_json::from_str::<serde_json::Value>(json_str) {
                Ok(json) => {
                    let strict = json.get("strict").and_then(|v| v.as_bool()).unwrap_or(false);
                    ValidationOptions {
                        strict,
                        check_files_exist: true,
                        validate_images: true,
                        max_file_size: Some(100 * 1024 * 1024),
                    }
                }
                Err(e) => {
                    return to_c_string(error_json(&format!("Invalid options JSON: {}", e)))
                }
            },
            Err(e) => return to_c_string(error_json(&format!("Invalid options string: {}", e))),
        }
    };

    // Read config
    let config_path = PathBuf::from(project_path_str).join("mod.config.json");
    let config_content = match std::fs::read_to_string(&config_path) {
        Ok(content) => content,
        Err(e) => {
            return to_c_string(error_json(&format!(
                "Failed to read mod.config.json: {}",
                e
            )))
        }
    };

    let config = match crate::ModConfig::from_json(&config_content) {
        Ok(cfg) => cfg,
        Err(e) => return to_c_string(error_json(&format!("Invalid mod.config.json: {}", e))),
    };

    match validate_project(Path::new(project_path_str), &config, &options) {
        Ok(result) => {
            let ffi_result = ValidationResultFFI {
                valid: !result.has_warnings(),
                warnings: result.warnings.into_iter().map(|w| w.into()).collect(),
                errors: Vec::new(),
            };
            match serde_json::to_string(&ffi_result) {
                Ok(json) => to_c_string(json),
                Err(e) => to_c_string(error_json(&format!("Serialization failed: {}", e))),
            }
        }
        Err(e) => to_c_string(error_json(&e.to_string())),
    }
}

/// List files in a package
///
/// # Arguments
/// * `package_path` - Path to the .dmodpkg file
/// * `layer` - Layer name to filter by (null for all files)
///
/// # Returns
/// JSON string with FileListFFI or error
#[unsafe(no_mangle)]
pub extern "C" fn dmodpkg_list_files(
    package_path: *const c_char,
    layer: *const c_char,
) -> *mut c_char {
    let package_path_str = match from_c_str(package_path) {
        Ok(s) => s,
        Err(e) => return to_c_string(error_json(&format!("Invalid package path: {}", e))),
    };

    let result = if layer.is_null() {
        list_files(package_path_str)
    } else {
        match from_c_str(layer) {
            Ok(layer_name) => list_layer_files(package_path_str, layer_name),
            Err(e) => return to_c_string(error_json(&format!("Invalid layer name: {}", e))),
        }
    };

    match result {
        Ok(files) => {
            let ffi_result = FileListFFI {
                files: files.into_iter().map(|f| f.into()).collect(),
            };
            match serde_json::to_string(&ffi_result) {
                Ok(json) => to_c_string(json),
                Err(e) => to_c_string(error_json(&format!("Serialization failed: {}", e))),
            }
        }
        Err(e) => to_c_string(error_json(&e.to_string())),
    }
}

