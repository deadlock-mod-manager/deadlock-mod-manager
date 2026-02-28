#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AUR_DIR="$REPO_ROOT/distribution/aur"

ALL_PACKAGES=(
  "deadlock-modmanager"
  "deadlock-modmanager-bin"
  "deadlock-modmanager-git"
)

MODE="build"
USE_CHROOT=false
BIN_ONLY=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Test AUR PKGBUILDs locally.

Options:
  --chroot      Use extra-x86_64-build (clean chroot) instead of makepkg -sf
  --lint-only   Only run namcap on each PKGBUILD (no build)
  --bin-only    Only test deadlock-modmanager-bin (fastest)
  -h, --help    Show this help message
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --chroot)    USE_CHROOT=true; shift ;;
    --lint-only) MODE="lint"; shift ;;
    --bin-only)  BIN_ONLY=true; shift ;;
    -h|--help)   usage ;;
    *)           echo "Unknown option: $1" >&2; usage ;;
  esac
done

if ! command -v makepkg &>/dev/null; then
  echo "ERROR: makepkg not found. This script must be run on Arch Linux." >&2
  exit 1
fi

if [[ "$MODE" == "lint" ]] && ! command -v namcap &>/dev/null; then
  echo "ERROR: namcap not found. Install it with: sudo pacman -S namcap" >&2
  exit 1
fi

if [[ "$USE_CHROOT" == true ]] && ! command -v extra-x86_64-build &>/dev/null; then
  echo "ERROR: extra-x86_64-build not found. Install it with: sudo pacman -S devtools" >&2
  exit 1
fi

packages=("${ALL_PACKAGES[@]}")
if [[ "$BIN_ONLY" == true ]]; then
  packages=("deadlock-modmanager-bin")
fi

declare -A results
failed=0

for pkg in "${packages[@]}"; do
  pkg_dir="$AUR_DIR/$pkg"
  if [[ ! -f "$pkg_dir/PKGBUILD" ]]; then
    echo "SKIP: $pkg (no PKGBUILD found at $pkg_dir)"
    results[$pkg]="SKIP"
    continue
  fi

  echo ""
  echo "========================================"
  echo "Testing: $pkg"
  echo "========================================"

  if [[ "$MODE" == "lint" ]]; then
    if (cd "$pkg_dir" && namcap PKGBUILD); then
      results[$pkg]="PASS"
    else
      results[$pkg]="FAIL"
      ((failed++))
    fi
  elif [[ "$USE_CHROOT" == true ]]; then
    if (cd "$pkg_dir" && extra-x86_64-build); then
      results[$pkg]="PASS"
    else
      results[$pkg]="FAIL"
      ((failed++))
    fi
  else
    if (cd "$pkg_dir" && makepkg -sf --noconfirm); then
      results[$pkg]="PASS"
    else
      results[$pkg]="FAIL"
      ((failed++))
    fi
  fi
done

echo ""
echo "========================================"
echo "Results"
echo "========================================"
for pkg in "${packages[@]}"; do
  printf "  %-30s %s\n" "$pkg" "${results[$pkg]}"
done
echo ""

if [[ $failed -gt 0 ]]; then
  echo "FAILED: $failed package(s) failed."
  exit 1
else
  echo "All packages passed."
fi
