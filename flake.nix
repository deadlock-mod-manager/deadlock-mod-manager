{
  description = "Deadlock Mod Manager - A mod manager for the Valve game Deadlock";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        # Rust toolchain for Tauri and native libraries
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [
            "rust-src"
            "rust-analyzer"
          ];
          targets = [ "x86_64-unknown-linux-gnu" ];
        };

        # System libraries needed for Tauri
        tauriLibraries = with pkgs; [
          webkitgtk_4_1
          gtk3
          cairo
          gdk-pixbuf
          glib
          dbus
          openssl
          librsvg
          libsoup_3
        ];

        # Build inputs for native development
        buildInputs =
          with pkgs;
          tauriLibraries
          ++ [
            pkg-config
            openssl.dev
          ];

        # Native build inputs (compilers, linkers, etc.)
        nativeBuildInputs = with pkgs; [
          pkg-config
          makeWrapper
        ];

        # Development libraries for linking
        libraries = with pkgs; [
          webkitgtk_4_1
          gtk3
          cairo
          gdk-pixbuf
          glib
          dbus
          openssl
          librsvg
          libsoup_3
        ];

      in
      {
        devShells.default = pkgs.mkShell {
          inherit buildInputs nativeBuildInputs;

          packages = with pkgs; [
            # Rust toolchain
            rustToolchain
            cargo-watch
            cargo-edit

            # Node.js ecosystem
            nodejs_22
            nodePackages.pnpm
            bun

            # Development tools
            biome
            turbo
            lefthook
            git

            # Docker and container tools
            docker
            docker-compose

            # Database tools
            postgresql

            # Build tools
            gnumake
            gcc

            # Additional utilities
            ripgrep
            fd
            jq
          ];

          shellHook = ''
            export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath libraries}:$LD_LIBRARY_PATH
            export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig:$PKG_CONFIG_PATH"
            export RUST_SRC_PATH="${rustToolchain}/lib/rustlib/src/rust/library"

            # Set up pnpm
            export PNPM_HOME="$HOME/.local/share/pnpm"
            export PATH="$PNPM_HOME:$PATH"

            # Verify pnpm installation
            if ! command -v pnpm &> /dev/null; then
              echo "Installing pnpm..."
              npm install -g pnpm
            fi
          '';

          # Environment variables for Tauri development
          WEBKIT_DISABLE_COMPOSITING_MODE = "1";

          # Rust environment
          RUST_BACKTRACE = "1";
          CARGO_TARGET_DIR = "./target";
        };
      }
    );
}
