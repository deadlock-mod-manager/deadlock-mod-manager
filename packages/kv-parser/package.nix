{
  lib,
  rustPlatform,
  rustToolchain,
  src,
}:

rustPlatform.buildRustPackage {
  pname = "kv-parser";
  version = "0.1.0";
  
  inherit src;
  sourceRoot = "source/packages/kv-parser";

  cargoHash = "sha256-DO/szygfj4zVAFkZaj/0rGGEZj/ZjM55ur1mt8HkyfQ=";

  nativeBuildInputs = [ rustToolchain ];

  buildInputs = [ ];

  # Skip tests that may require test data
  doCheck = false;

  # Install the shared library
  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib
    
    # Copy the shared library (works for .so on Linux, .dylib on macOS)
    if [ -f target/release/libkv_parser.so ]; then
      cp target/release/libkv_parser.so $out/lib/
    elif [ -f target/release/libkv_parser.dylib ]; then
      cp target/release/libkv_parser.dylib $out/lib/
    fi
    
    # Also copy the .a file if it exists
    if [ -f target/release/libkv_parser.a ]; then
      cp target/release/libkv_parser.a $out/lib/
    fi

    runHook postInstall
  '';

  meta = with lib; {
    description = "Native KeyValues (VDF) parser library for Bun FFI with AST support";
    homepage = "https://github.com/deadlock-mod-manager/deadlock-mod-manager";
    license = licenses.gpl3Only;
    platforms = platforms.linux;
    maintainers = [ ];
  };
}
