#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 INPUT.AppImage OUTPUT.AppImage LINUXDEPLOY_APPIMAGE_PLUGIN" >&2
  exit 1
fi
input=$(realpath -- "$1")
output=$(realpath -m -- "$2")
plugin=$(realpath -- "$3")
if [ "$input" = "$output" ] || [ -e "$output" ]; then
  echo "Output must be a new path; existing artifacts are not overwritten." >&2
  exit 1
fi
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
export APPIMAGE_EXTRACT_AND_RUN=1
cd "$work"
"$input" --appimage-extract > /dev/null
appdir="$work/squashfs-root"
test -x "$appdir/AppRun"

# Keep host Wayland libraries paired with the host EGL/Mesa driver.
# https://github.com/tauri-apps/tauri/issues/11988
for library in libwayland-client.so libwayland-server.so libwayland-cursor.so libwayland-egl.so; do
  find "$appdir/usr/lib" -name "$library" -delete
  find "$appdir/usr/lib" -name "$library.*" -delete
done

# Reuse the input runtime so repacking needs no network download.
runtime_size=$("$input" --appimage-offset)
if [[ ! "$runtime_size" =~ ^[1-9][0-9]*$ ]]; then
  echo "Invalid AppImage runtime size." >&2
  exit 1
fi
head -c "$runtime_size" "$input" > "$work/runtime"
LDAI_OUTPUT="$output" LDAI_RUNTIME_FILE="$work/runtime" ARCH=x86_64 "$plugin" --appdir "$appdir"
test -s "$output"
mkdir "$work/verify"
cd "$work/verify"
"$output" --appimage-extract > /dev/null
test -x squashfs-root/AppRun
test -x squashfs-root/usr/bin/deadlock-mod-manager
if find squashfs-root/usr/lib -name 'libwayland-*.so*' -print -quit | grep -q .; then
  echo "Bundled Wayland library remains in output." >&2
  exit 1
fi
echo "Verified AppImage: $output"
echo "Updater signatures must be generated from this final artifact before release."
