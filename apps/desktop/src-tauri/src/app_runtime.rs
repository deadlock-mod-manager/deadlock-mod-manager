// CEF builds patch `tauri` to the upstream `feat/cef` branch, where the
// runtime lives in its own crate instead of behind a `tauri` feature
// (see `scripts/cef-patch.ts`).
#[cfg(feature = "cef")]
pub type AppRuntime = tauri_runtime_cef::CefRuntime;

#[cfg(not(feature = "cef"))]
pub type AppRuntime = tauri::Wry;

pub type AppHandle = tauri::AppHandle<AppRuntime>;

/// Chromium can't create its sandbox inside Flatpak's, and the runtime only
/// detects that case for AppImages. It also ignores Chromium switches passed on
/// the real command line, so `--no-sandbox` has to be set here.
#[cfg(feature = "cef")]
pub fn cef_runtime() -> tauri_runtime_cef::Cef {
  use tauri_runtime_cef::SandboxPolicy;
  let sandbox = if crate::flatpak::running_in_flatpak() {
    SandboxPolicy::Disabled
  } else {
    SandboxPolicy::Auto
  };
  tauri_runtime_cef::Cef::default().sandbox(sandbox)
}
