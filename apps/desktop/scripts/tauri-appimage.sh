#!/usr/bin/env bash
set -euo pipefail

# tauri-action also invokes commands such as --version through tauriScript.
if [ "${1:-}" != build ] && [ "${1:-}" != bundle ]; then
  exec pnpm tauri "$@"
fi

pnpm tauri "$@"
bundle_dir="${CARGO_TARGET_DIR:-target}/release/bundle/appimage"
shopt -s nullglob
images=("$bundle_dir"/*.AppImage)
if [ "${#images[@]}" -ne 1 ]; then
  echo "Expected one release AppImage, found ${#images[@]}" >&2
  exit 1
fi
image=${images[0]}
if [ -e "$image.tar.gz" ]; then
  echo "Legacy updater archives are not supported by this repackaging step." >&2
  exit 1
fi
plugin="${XDG_CACHE_HOME:-$HOME/.cache}/tauri/linuxdeploy-plugin-appimage.AppImage"
output_dir=$(mktemp -d "$bundle_dir/repack.XXXXXX")
trap 'rm -rf -- "$output_dir"' EXIT
bash scripts/repack-appimage-wayland.sh "$image" "$output_dir/fixed.AppImage" "$plugin"

# tauri-action discovers artifacts after this wrapper returns. Replace the
# signature too, so the updater verifies the final bytes that get uploaded.
signed=false
if [ -f "$image.sig" ]; then
  signed=true
  rm -- "$image.sig"
fi
mv -- "$output_dir/fixed.AppImage" "$image"
if [ "$signed" = true ]; then
  pnpm tauri signer sign "$image"
  test -s "$image.sig"
fi
