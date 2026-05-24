#[cfg(feature = "cef")]
pub type AppRuntime = tauri::Cef;

#[cfg(not(feature = "cef"))]
pub type AppRuntime = tauri::Wry;

pub type AppHandle = tauri::AppHandle<AppRuntime>;
