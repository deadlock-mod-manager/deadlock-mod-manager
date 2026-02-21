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
    fi
    
    # Also copy the .a file if it exists
    if [ -f target/release/libvpk_parser.a ]; then
      cp target/release/libvpk_parser.a $out/lib/
    fi

    # Verify at least one artifact was copied
    if ! ls "$out/lib/libvpk_parser."* >/dev/null 2>&1; then
      echo "Error: No library artifacts found in target/release/" >&2
      echo "Expected libvpk_parser.so or libvpk_parser.a" >&2
      exit 1
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
