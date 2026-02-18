{
  lib,
  rustPlatform,
  rustToolchain,
  src,
}:

rustPlatform.buildRustPackage {
  pname = "dmodpkg";
  version = "0.1.0";
  
  inherit src;
  sourceRoot = "source/packages/dmodpkg";

  cargoHash = "sha256-dXq1rhW0LcRb3rQcKX31ncUJ8LdI7fPK2KaxeARnPXc=";

  nativeBuildInputs = [ rustToolchain ];

  buildInputs = [ ];

  # Skip tests that may require test data
  doCheck = false;

  # Install the shared library
  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib
    
    # Copy the shared library (works for .so on Linux, .dylib on macOS)
    if [ -f target/release/libdmodpkg.so ]; then
      cp target/release/libdmodpkg.so $out/lib/
    fi
    
    # Also copy the .a file if it exists
    if [ -f target/release/libdmodpkg.a ]; then
      cp target/release/libdmodpkg.a $out/lib/
    fi

    runHook postInstall
  '';

  meta = with lib; {
    description = "Native library for Deadlock mod package format (.dmodpkg)";
    homepage = "https://github.com/deadlock-mod-manager/deadlock-mod-manager";
    license = licenses.gpl3Only;
    platforms = platforms.linux;
    maintainers = [ ];
  };
}
