{
  lib,
  rustPlatform,
  rustToolchain,
  src,
}:

rustPlatform.buildRustPackage {
  pname = "vpk-parser";
  version = "0.1.0";
  
  inherit src;
  sourceRoot = "source/packages/vpk-parser";

  cargoHash = "sha256-ED1oUainokfMqMDFaEW9QkHBa15eoSsMtYtwkty7T6U=";

  nativeBuildInputs = [ rustToolchain ];

  buildInputs = [ ];

  # Skip tests that may require test data
  doCheck = false;

  # Install the shared library
  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib
    
    # Copy the shared library (works for .so on Linux, .dylib on macOS)
    if [ -f target/release/libvpk_parser.so ]; then
      cp target/release/libvpk_parser.so $out/lib/
    elif [ -f target/release/libvpk_parser.dylib ]; then
      cp target/release/libvpk_parser.dylib $out/lib/
    fi
    
    # Also copy the .a file if it exists
    if [ -f target/release/libvpk_parser.a ]; then
      cp target/release/libvpk_parser.a $out/lib/
    fi

    runHook postInstall
  '';

  meta = with lib; {
    description = "High-performance VPK (Valve Package Format) parser for Deadlock mod files";
    homepage = "https://github.com/deadlock-mod-manager/deadlock-mod-manager";
    license = licenses.gpl3Only;
    platforms = platforms.linux;
    maintainers = [ ];
  };
}
