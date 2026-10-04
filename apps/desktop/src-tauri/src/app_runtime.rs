// CEF builds patch `tauri` to the upstream `feat/cef` branch, where the
// runtime lives in its own crate instead of behind a `tauri` feature
// (see `scripts/cef-patch.ts`).
#[cfg(feature = "cef")]
pub type AppRuntime = tauri_runtime_cef::CefRuntime;

#[cfg(not(feature = "cef"))]
pub type AppRuntime = tauri::Wry;

pub type AppHandle = tauri::AppHandle<AppRuntime>;
