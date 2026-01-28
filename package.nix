{
  pkgs,
  lib,
  version,
  src,
  cargoHash,
  pnpmHash,
}:

pkgs.rustPlatform.buildRustPackage {
  pname = "deadlock-mod-manager";
  inherit version src;

  cargoRoot = "apps/desktop";
  buildAndTestSubdir = "apps/desktop";
  inherit cargoHash;

  nativeBuildInputs = with pkgs; [
    rustPlatform.cargoSetupHook
    cargo-tauri.hook
    nodejs_22
    pnpmConfigHook
    pnpm_9
    pkg-config
    wrapGAppsHook3
  ];

  buildInputs = with pkgs; [
    webkitgtk_4_1
    cairo
    gdk-pixbuf
    glib
    glib-networking
    gtk3
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
  pnpmDeps = pkgs.fetchPnpmDeps {
    pname = "deadlock-mod-manager";
    inherit version src;
    pnpm = pkgs.pnpm_9;
    fetcherVersion = 2;
    sourceRoot = "source";
    hash = pnpmHash;
  };

  # Fetch patch from nixpkgs to disable updater artifacts (avoids need for signing key)
  patches = [
    (pkgs.fetchurl {
      url = "https://raw.githubusercontent.com/NixOS/nixpkgs/master/pkgs/by-name/de/deadlock-mod-manager/no-updater-artifacts.patch";
      hash = "sha256-Ve0WIq4noldm1CwkEv9JelKsnY8kBjX3cpuv3R83quc=";
    })
  ];

  VITE_API_URL = "https://api.deadlockmods.app";

  # Skip tests that require network access
  checkFlags = [
    "--skip=download_manager::downloader::tests::test_download_file"
  ];

  preFixup = ''
    gappsWrapperArgs+=(
      --set FONTCONFIG_FILE "${pkgs.fontconfig.out}/etc/fonts/fonts.conf"
      --set TAURI_DIST_DIR "$out/share/deadlock-modmanager/dist"
      --set WEBKIT_DISABLE_COMPOSITING_MODE 1
      --set WEBKIT_DISABLE_DMABUF_RENDERER 1
      --set DISABLE_UPDATE_DESKTOP_DATABASE 1
      --prefix PATH : ${lib.makeBinPath [ pkgs.desktop-file-utils ]}
      --add-flags "--disable-auto-update"
    )
  '';

  desktopItems = [
    (pkgs.makeDesktopItem {
      desktopName = "deadlock-mod-manager";
      name = "Deadlock Mod Manager";
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

  meta = with lib; {
    description = "Mod manager for the Valve game Deadlock";
    homepage = "https://github.com/deadlock-mod-manager/deadlock-mod-manager";
    license = licenses.gpl3Plus;
    maintainers = with maintainers; [
      mistyttm
      schromp
    ];
    platforms = platforms.linux;
    mainProgram = "deadlock-mod-manager";
  };
}
