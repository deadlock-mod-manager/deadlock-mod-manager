fn main() {
  if std::env::var_os("CARGO_FEATURE_CEF").is_some()
    && std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux")
  {
    println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");
  }

  if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
    println!("cargo:rustc-link-arg=/DELAYLOAD:comctl32.dll");
    println!("cargo:rustc-link-arg=delayimp.lib");
  }

  if std::env::var_os("CARGO_FEATURE_CEF").is_some() {
    println!("cargo:rerun-if-changed=capabilities");
    tauri_build::try_build(
      tauri_build::Attributes::new().capabilities_path_pattern("./capabilities/*.json"),
    )
    .expect("failed to run tauri-build");
  } else {
    tauri_build::build()
  }
}
