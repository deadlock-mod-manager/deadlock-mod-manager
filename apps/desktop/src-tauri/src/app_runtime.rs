#[cfg(feature = "cef")]
pub type AppRuntime = tauri_runtime_cef::CefRuntime;

#[cfg(not(feature = "cef"))]
pub type AppRuntime = tauri::Wry;

pub type AppHandle = tauri::AppHandle<AppRuntime>;

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
