{
  lib,
  rustPlatform,
  src,
  pnpm_11,
  fetchPnpmDeps,
  pnpmConfigHook,
  pkg-config,
  wrapGAppsHook3,
  desktop-file-utils,
  webkitgtk_4_1,
  cairo,
  gdk-pixbuf,
  glib,
  glib-networking,
  gtk3,
  libayatana-appindicator,
  libsoup_3,
  pango,
  openssl,
  bzip2,
  gst_all_1,
  makeDesktopItem,
  fontconfig,
  cargo-tauri,
  nodejs,
  protobuf,
}:

rustPlatform.buildRustPackage (finalAttrs: {
  pname = "deadlock-mod-manager";
  version = "nightly";
  inherit src;

  # Build from apps/desktop directory
  cargoRoot = "apps/desktop";
  buildAndTestSubdir = finalAttrs.cargoRoot;

  cargoHash = "sha256-400mLF5wcqYXci43g29I2JpleZi0nj3yl3aqwWhYXSk=";

  nativeBuildInputs = [
    rustPlatform.cargoSetupHook cargo-tauri.hook nodejs

    pnpmConfigHook
    pnpm_11
    pkg-config
    wrapGAppsHook3
    protobuf
  ];

  buildInputs = [
    webkitgtk_4_1
    cairo
    gdk-pixbuf
    glib
    glib-networking
    gtk3
    libayatana-appindicator
    libsoup_3
    pango

    openssl
    bzip2
    desktop-file-utils

    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
    gst_all_1.gst-plugins-bad
  ];

  pnpmRoot = ".";
  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs)
      pname
      version
      src
      ;
    pnpm = pnpm_11;
    fetcherVersion = 4;
    sourceRoot = "source";
    hash = "sha256-569z5zhm1r5Lmxfii7e8swdk8jvW8Rcg5yl9b7QJ3bQ=";
  };

  postPatch = ''
    substituteInPlace apps/desktop/src-tauri/tauri.conf.json \
      --replace '"createUpdaterArtifacts": true' '"createUpdaterArtifacts": false'
  '';

  # Environment variables
  env.VITE_API_URL = "https://api.deadlockmods.app";

  # Skip tests that require network access
  checkFlags = [
    "--skip=download_manager::downloader::tests::test_download_file"
  ];

  preFixup = ''
    gappsWrapperArgs+=(
      --set FONTCONFIG_FILE "${fontconfig.out}/etc/fonts/fonts.conf"
--set TAURI_DIST_DIR "$out/share/deadlock-modmanager/dist"

      --set DISABLE_UPDATE_DESKTOP_DATABASE 1
      --prefix PATH : ${lib.makeBinPath [ desktop-file-utils ]}
      # The tray icon dlopens libayatana-appindicator3 at runtime
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath [ libayatana-appindicator ]}
      --add-flags "--disable-auto-update"
    )
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "deadlock-mod-manager";
      desktopName = "Deadlock Mod Manager Nightly";
      exec = "deadlock-mod-manager %u";
      terminal = false;
      type = "Application";
      icon = "deadlock-mod-manager";
      mimeTypes = [ "x-scheme-handler/deadlock-mod-manager" ];
      categories = [
        "Utility"
        "Game"
      ];
    })
  ];

  meta = {
    description = "Mod manager for the Valve game Deadlock";
    homepage = "https://github.com/deadlock-mod-manager/deadlock-mod-manager";
    license = lib.licenses.gpl3Plus;
    maintainers = with lib.maintainers; [
      mistyttm
      schromp
    ];
    platforms = lib.platforms.linux;
    mainProgram = "deadlock-mod-manager";
  };
})
