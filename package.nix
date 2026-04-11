{
  lib,
  rustPlatform,
  rustToolchain,
  src,
  nodejs_22,
  pnpm_9,
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
  libsoup_3,
  pango,
  openssl,
  bzip2,
  gst_all_1,
  makeDesktopItem,
  fontconfig,
}:

rustPlatform.buildRustPackage (finalAttrs: {
  pname = "deadlock-mod-manager";
  version = "nightly";
  inherit src;

  # Build from apps/desktop directory
  cargoRoot = "apps/desktop";
  buildAndTestSubdir = finalAttrs.cargoRoot;

  cargoHash = "sha256-6ljyPdobcoBaYyarc7Iin5N24y1YXPafrYAk2xvBtvY=";

  nativeBuildInputs = [
    rustToolchain
    nodejs_22
    pnpmConfigHook
    pnpm_9
    pkg-config
    wrapGAppsHook3
  ];

  buildInputs = [
    # GTK and WebKit dependencies
    webkitgtk_4_1
    cairo
    gdk-pixbuf
    glib
    glib-networking
    gtk3
    libsoup_3
    pango
    
    # System libraries
    openssl
    bzip2
    desktop-file-utils
    
    # GStreamer for media playback in WebKit
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
    pnpm = pnpm_9;
    fetcherVersion = 2;
    sourceRoot = "source";
    hash = "sha256-fFcKyqAo/HpGBaEJMk6Lq0FafNXrGu9z9nHnav5d6Hg=";
  };

  # Environment variables
  env.VITE_API_URL = "https://api.deadlockmods.app";

  # Skip tests that require network access
  doCheck = false;

  preFixup = ''
    gappsWrapperArgs+=(
      --set FONTCONFIG_FILE "${fontconfig.out}/etc/fonts/fonts.conf"
      --set TAURI_DIST_DIR "$out/share/deadlock-mod-manager/dist"
      --set DISABLE_UPDATE_DESKTOP_DATABASE 1
      --prefix PATH : ${lib.makeBinPath [ desktop-file-utils ]}
      --add-flags "--disable-auto-update"
    )
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "deadlock-mod-manager";
      desktopName = "Deadlock Mod Manager";
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
