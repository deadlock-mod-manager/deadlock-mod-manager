{
  description = "Deadlock Mod Manager - A mod manager for the Valve game Deadlock";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
      bun2nix,
    }:
    let
      # Package only supports Linux (Tauri with GTK/WebKit)
      linuxSystems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
    in
    # Dev shells for all default systems
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };
        isLinux = builtins.elem system linuxSystems;

        # Rust toolchain for Tauri and native libraries
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [
            "rust-src"
            "rust-analyzer"
            "clippy"
          ];
          targets = 
            if system == "x86_64-linux" then [ "x86_64-unknown-linux-gnu" ]
            else if system == "aarch64-linux" then [ "aarch64-unknown-linux-gnu" ]
            else [ ];
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
          # GStreamer for media playback
          gst_all_1.gstreamer
          gst_all_1.gst-plugins-base
          gst_all_1.gst-plugins-good
          gst_all_1.gst-plugins-bad
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
        # Packages only available on Linux (Tauri with GTK/WebKit)
        packages = pkgs.lib.optionalAttrs isLinux {
          # Nightly build from the current source
          # cargoHash is managed by CI workflow
          default = pkgs.callPackage ./package.nix {
            inherit rustToolchain;
            src = self;
          };

          nightly = self.packages.${system}.default;

          # Native FFI libraries for Bun
          vpk-parser = pkgs.callPackage ./packages/vpk-parser/package.nix {
            inherit rustToolchain;
            src = self;
          };
        };

        # Dev shell only available on Linux (requires GTK/WebKit)
        devShells = pkgs.lib.optionalAttrs isLinux {
          default = pkgs.mkShell {
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
              redis

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

              # Rust environment
              export CARGO_HOME="$PWD/.cargo"
              export RUSTUP_HOME="$PWD/.rustup"

              # Set up pnpm
              export PNPM_HOME="$HOME/.local/share/pnpm"
              export PATH="$PNPM_HOME:$PATH"

              # Development environment defaults
              export DATABASE_URL="postgresql://turborepo:123456789@localhost:5435/turborepo"
              export REDIS_URL="redis://localhost:6379"
              export NODE_ENV="development"

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
        };
      }
    );
}
