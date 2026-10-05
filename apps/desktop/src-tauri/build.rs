fn main() {
  if std::env::var_os("CARGO_FEATURE_CEF").is_some()
    && std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux")
  {
    println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");
  }

  // `TaskDialogIndirect` lives in the side-by-side comctl32 v6, which only a
  // manifest brings in. The app binary has one; `cargo test` binaries do not,
  // so they died at load time with STATUS_ENTRYPOINT_NOT_FOUND. Delay-loading
  // moves the bind to the first call, which tests never make.
  if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
    println!("cargo:rustc-link-arg=/DELAYLOAD:comctl32.dll");
    println!("cargo:rustc-link-arg=delayimp.lib");
  }

  // The MCP bridge plugin only builds against Wry, so CEF builds skip the
  // runtime-specific capabilities under `capabilities/wry/`.
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
