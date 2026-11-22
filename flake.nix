{
  description = "Deadlock Mod Manager - A mod manager for the Valve game Deadlock";

  nixConfig = {
    extra-substituters = [ "https://deadlock-mod-manager.cachix.org" ];
    extra-trusted-public-keys = [
      "deadlock-mod-manager.cachix.org-1:wUjtzL6yN2i9zTq1YrXHBr0mx3LP7tBGsosk3N+/A/M="
    ];
  };

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
    let
      linuxSystems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
    in
    flake-utils.lib.eachSystem linuxSystems (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };
        isLinux = builtins.elem system linuxSystems;

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
          libayatana-appindicator
          gst_all_1.gstreamer
          gst_all_1.gst-plugins-base
          gst_all_1.gst-plugins-good
          gst_all_1.gst-plugins-bad
          glib-networking
        ];

        buildInputs =
          with pkgs;
          tauriLibraries
          ++ [
            pkg-config
            openssl.dev
          ];

        nativeBuildInputs = with pkgs; [
          pkg-config
          makeWrapper
        ];

        libraries = tauriLibraries;

        nightlySrc = pkgs.lib.fileset.toSource {
          root = ./.;
          fileset = pkgs.lib.fileset.difference ./. (
            pkgs.lib.fileset.unions (
              map pkgs.lib.fileset.maybeMissing [
                ./.agents
                ./.changeset
                ./.coderabbit.yaml
                ./.cursor
                ./.dockerignore
                ./.github
                ./distribution
                ./docs
                ./infrastructure
                ./rfcs
                ./skills-lock.json
                ./AGENTS.md
                ./AI_POLICY.md
                ./CLAUDE.md
                ./CODE_OF_CONDUCT.md
                ./CONTRIBUTING.md
                ./README.md
                ./SECURITY.md
                ./THIRD-PARTY-NOTICES.md
              ]
            )
          );
        };

      in
      {
        packages = pkgs.lib.optionalAttrs isLinux {
          default = pkgs.callPackage ./package.nix {
            src = nightlySrc;
          };

          nightly = self.packages.${system}.default;

          e2e = self.packages.${system}.default.overrideAttrs (prev: {
            cargoBuildFeatures = [ "e2e-harness" ];
            tauriBuildFlags = [
              "--config"
              "src-tauri/tauri.e2e.conf.json"
            ];
            env = prev.env // {
              VITE_DMM_E2E_HARNESS = "1";
            };
            doCheck = false;
          });

          vpk-parser = pkgs.callPackage ./packages/vpk-parser/package.nix {
            inherit rustToolchain;
            src = self;
          };

          kv-parser = pkgs.callPackage ./packages/kv-parser/package.nix {
            inherit rustToolchain;
            src = self;
          };

          dmodpkg = pkgs.callPackage ./packages/dmodpkg/package.nix {
            inherit rustToolchain;
            src = self;
          };

          dmodpkg-cli = pkgs.callPackage ./apps/dmodpkg/package.nix {
            inherit (self.packages.${system}) dmodpkg;
          };
        };

        devShells = pkgs.lib.optionalAttrs isLinux {
          default = pkgs.mkShell {
            inherit buildInputs nativeBuildInputs;

            packages = with pkgs; [
              rustToolchain
              cargo-watch
              cargo-edit

              nodejs_24
              pnpm_11
              bun

              turbo
              lefthook
              git

              docker
              docker-compose

              postgresql
              redis

              gnumake
              gcc

              ripgrep
              fd
              jq
            ];

            shellHook = ''
              export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath libraries}:$LD_LIBRARY_PATH
              export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules"
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

            RUST_BACKTRACE = "1";
            CARGO_TARGET_DIR = "./target";
          };
        };
      }
    );
}
