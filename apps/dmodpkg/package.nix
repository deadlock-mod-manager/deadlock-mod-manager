{
  lib,
  stdenv,
  bun,
  makeWrapper,
  dmodpkg,
}:

let
  bunApp = stdenv.mkDerivation {
    pname = "dmodpkg-cli";
    version = "0.1.0";

    src = ../../apps/dmodpkg;

    nativeBuildInputs = [
      bun
      makeWrapper
    ];

    buildPhase = ''
      runHook preBuild
      
      # Use bun to build the CLI
      bun build src/index.ts --outdir dist --target bun
      
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      # Create directories
      mkdir -p $out/bin
      mkdir -p $out/share/dmodpkg-cli

      # Copy the built files
      cp -r dist $out/share/dmodpkg-cli/
      cp package.json $out/share/dmodpkg-cli/

      # Create wrapper script that:
      # 1. Sets LD_LIBRARY_PATH to find the native dmodpkg library
      # 2. Runs the CLI with bun
      makeWrapper ${bun}/bin/bun $out/bin/dmodpkg \
        --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath [ dmodpkg ]} \
        --add-flags "run $out/share/dmodpkg-cli/dist/index.js"

      runHook postInstall
    '';

    meta = with lib; {
      description = "Command-line interface for creating and managing Deadlock mod packages";
      homepage = "https://github.com/deadlock-mod-manager/deadlock-mod-manager";
      license = licenses.gpl3Only;
      mainProgram = "dmodpkg";
      platforms = platforms.linux;
      maintainers = [ ];
    };
  };
in
  bunApp
