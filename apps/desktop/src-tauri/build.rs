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

  tauri_build::build()
}
