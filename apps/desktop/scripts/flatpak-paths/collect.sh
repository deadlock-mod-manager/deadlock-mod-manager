#!/usr/bin/env bash

set -euo pipefail

app_id="${1:-dev.stormix.deadlock-mod-manager}"
app_data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/flatpak"
app_log="$HOME/.var/app/$app_id/data/$app_id/logs/deadlock-mod-manager.log"

section() {
  printf '\n## %s\n' "$1"
}

print_command() {
  local label="$1"
  shift
  printf '%s: ' "$label"
  if command -v "$1" >/dev/null 2>&1; then
    "$@" 2>&1 || true
  else
    printf 'not installed\n'
  fi
}

section "Capture"
date --utc --iso-8601=seconds
printf 'app_id=%s\n' "$app_id"
printf 'flatpak_data=%s\n' "$app_data_dir"

section "Operating system and session"
if [[ -r /etc/os-release ]]; then
  grep -E '^(NAME|VERSION|ID|ID_LIKE|BUILD_ID|VARIANT)=' /etc/os-release || true
fi
printf 'desktop=%s\n' "${XDG_CURRENT_DESKTOP:-unset}"
printf 'session=%s\n' "${XDG_SESSION_TYPE:-unset}"
printf 'wayland_display=%s\n' "${WAYLAND_DISPLAY:-unset}"
printf 'display=%s\n' "${DISPLAY:-unset}"

section "Flatpak and portal versions"
print_command flatpak flatpak --version
for package in flatpak xdg-desktop-portal xdg-desktop-portal-kde xdg-desktop-portal-gtk; do
  if command -v pacman >/dev/null 2>&1; then
    pacman -Q "$package" 2>/dev/null || true
  elif command -v rpm >/dev/null 2>&1; then
    rpm -q "$package" 2>/dev/null || true
  elif command -v dpkg-query >/dev/null 2>&1; then
    dpkg-query -W -f='${Package} ${Version}\n' "$package" 2>/dev/null || true
  fi
done

section "Portal services"
systemctl --user --no-pager --plain --type=service --all 2>/dev/null \
  | grep 'xdg-desktop-portal' \
  || true

section "Installed application"
flatpak info --user "$app_id" 2>&1 || flatpak info "$app_id" 2>&1 || true

section "Effective permissions"
flatpak info --user --show-permissions "$app_id" 2>&1 \
  || flatpak info --show-permissions "$app_id" 2>&1 \
  || true

section "Bundle metadata"
flatpak info --user --show-metadata "$app_id" 2>&1 \
  || flatpak info --show-metadata "$app_id" 2>&1 \
  || true

section "Document portal grants"
flatpak documents 2>&1 || true

section "Steam paths visible inside the sandbox"
flatpak run --command=sh "$app_id" -c '
for path in \
  "$HOME/.steam" \
  "$HOME/.local/share/Steam" \
  "$HOME/.var/app/com.valvesoftware.Steam/data/Steam" \
  "$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam" \
  "$HOME/.var/app/com.valvesoftware.Steam/.steam/steam" \
  "$HOME/.var/app/com.valvesoftware.Steam/.steam/root"; do
  if [ -e "$path" ]; then
    printf "visible %s\n" "$path"
  else
    printf "hidden-or-missing %s\n" "$path"
  fi
done
' 2>&1 || true

section "Recent path, portal, and startup diagnostics"
if [[ -r "$app_log" ]]; then
  tail -n 400 "$app_log" \
    | grep -Ei 'deep.?link|xdg-mime|portal|game path|steam path|Runtime\(CreateWindow\)|manually set' \
    | tail -n 160 \
    || true
else
  printf 'No readable application log at %s\n' "$app_log"
fi
