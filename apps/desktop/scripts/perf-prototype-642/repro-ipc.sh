#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../../.." && pwd)"
ARTIFACT="${1:-stable}"
SIZE_MIB="${2:-200}"
MODE="${3:-read}"
PORT="${DMM_642_INSPECTOR_PORT:-2642}"
TIMEOUT_SECONDS="${DMM_642_TIMEOUT_SECONDS:-30}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RESULT_ROOT="$REPO_ROOT/result/issue-642"
RUN_ROOT="$RESULT_ROOT/runs/$RUN_STAMP-$ARTIFACT-${SIZE_MIB}mib-$MODE"
FIXTURE_ROOT="$RESULT_ROOT/fixtures"
FIXTURE="$FIXTURE_ROOT/raw-${SIZE_MIB}mib.vpk"
CACHE_ROOT="$RESULT_ROOT/cache"
EXTRACT_ROOT="$RESULT_ROOT/extracted"

[[ "$SIZE_MIB" =~ ^[0-9]+$ && "$SIZE_MIB" -gt 0 ]] || fail "SIZE_MIB must be a positive integer"
case "$MODE" in
  read) PROBE_TEMPLATE="$SCRIPT_DIR/probe-read.js" ;;
  parse) PROBE_TEMPLATE="$SCRIPT_DIR/probe-parse.js" ;;
  extract) PROBE_TEMPLATE="$SCRIPT_DIR/probe-extract.js" ;;
  roundtrip) PROBE_TEMPLATE="$SCRIPT_DIR/probe-roundtrip.js" ;;
  *) fail "Mode must be read, parse, extract, or roundtrip" ;;
esac

STABLE_NAME="Deadlock.Mod.Manager_1.1.0_amd64.deb"
STABLE_URL="https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/v1.1.0/$STABLE_NAME"
STABLE_SHA="18a1eb0e68d794365ff67be2e9a733b93de0902246d956b17b73cc6430205009"
MAIN_NAME="Deadlock.Mod.Manager_1.2.0-nightly.20260825.db775912_amd64.deb"
MAIN_URL="https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/$MAIN_NAME"
MAIN_SHA="14e887792248128a6be0e5336628dc8c4c70ac257704c74b65c950ca530fdbf0"

download_verified() {
  local name="$1" url="$2" expected="$3"
  local destination="$CACHE_ROOT/$name"
  if [[ ! -f "$destination" ]]; then
    curl --fail --location --retry 3 --output "$destination.part-$RUN_STAMP" "$url"
    [[ "$(sha256sum "$destination.part-$RUN_STAMP" | awk '{print $1}')" == "$expected" ]] || fail "SHA-256 mismatch for $name"
    mv "$destination.part-$RUN_STAMP" "$destination"
  fi
  [[ "$(sha256sum "$destination" | awk '{print $1}')" == "$expected" ]] || fail "Cached SHA-256 mismatch for $name"
  printf '%s\n' "$destination"
}

extract_deb() {
  local label="$1" package="$2" digest="$3"
  local destination="$EXTRACT_ROOT/$label-$digest"
  if [[ ! -d "$destination" ]]; then
    mkdir -p "$destination"
    if command -v dpkg-deb >/dev/null 2>&1; then
      dpkg-deb --extract "$package" "$destination"
    else
      local archive_root="$destination.__archive"
      mkdir -p "$archive_root"
      bsdtar -xf "$package" -C "$archive_root"
      local data_archive
      data_archive="$(find "$archive_root" -maxdepth 1 -type f -name 'data.tar.*' -print -quit)"
      [[ -n "$data_archive" ]] || fail "Could not locate data.tar.* in $package"
      bsdtar -xf "$data_archive" -C "$destination"
    fi
  fi
  local binary
  binary="$(find "$destination" -type f -name deadlock-mod-manager -perm -u+x -print -quit)"
  [[ -n "$binary" ]] || fail "Desktop binary not found in $destination"
  printf '%s\n' "$binary"
}

case "$ARTIFACT" in
  stable)
    PACKAGE_NAME="$STABLE_NAME"
    PACKAGE_URL="$STABLE_URL"
    PACKAGE_SHA="$STABLE_SHA"
    ;;
  main | nightly)
    ARTIFACT="main"
    PACKAGE_NAME="$MAIN_NAME"
    PACKAGE_URL="$MAIN_URL"
    PACKAGE_SHA="$MAIN_SHA"
    ;;
  *) fail "Artifact must be stable or main" ;;
esac

for required in awk curl date find node ps python3 setsid sha256sum stat timeout truncate; do
  command -v "$required" >/dev/null || fail "$required is required"
done
if ! command -v dpkg-deb >/dev/null 2>&1; then
  command -v bsdtar >/dev/null || fail "dpkg-deb or bsdtar is required"
fi
if pgrep -f '(^|/)deadlock-mod-manager([[:space:]]|$)' >/dev/null 2>&1; then
  fail "Close every running Deadlock Mod Manager instance before measuring"
fi

mkdir -p "$CACHE_ROOT" "$EXTRACT_ROOT" "$FIXTURE_ROOT" "$RUN_ROOT/xdg-config" "$RUN_ROOT/xdg-cache"
PACKAGE="$(download_verified "$PACKAGE_NAME" "$PACKAGE_URL" "$PACKAGE_SHA")"
BINARY="$(extract_deb "$ARTIFACT" "$PACKAGE" "$PACKAGE_SHA")"
if [[ ! -f "$FIXTURE" || "$(stat -c %s "$FIXTURE")" -ne "$((SIZE_MIB * 1024 * 1024))" ]]; then
  cp --reflink=auto "$REPO_ROOT/packages/vpk-parser/data/pak95_dir.vpk" "$FIXTURE"
  truncate -s "${SIZE_MIB}M" "$FIXTURE"
fi

# Prevent startup auto-detection, cache scanning, and presence monitoring from
# contaminating the IPC sample.
python3 "$SCRIPT_DIR/generate-state.py" --xdg-data-home "$RUN_ROOT/xdg-data" >"$RUN_ROOT/state-path.txt"

SOURCE_PATH="$FIXTURE"
if [[ "$MODE" == "extract" ]]; then
  command -v 7z >/dev/null || fail "7z is required for the extraction fixture"
  ARCHIVE_FIXTURE="$FIXTURE_ROOT/raw-${SIZE_MIB}mib.7z"
  if [[ ! -f "$ARCHIVE_FIXTURE" ]]; then
    (cd "$FIXTURE_ROOT" && 7z a -t7z -mx=5 "$(basename "$ARCHIVE_FIXTURE")" "$(basename "$FIXTURE")" >/dev/null)
  fi
  MOD_ROOT="$RUN_ROOT/xdg-data/dev.stormix.deadlock-mod-manager/mods/issue-642"
  TARGET_PATH="$MOD_ROOT/files"
  mkdir -p "$TARGET_PATH"
  SOURCE_PATH="$MOD_ROOT/$(basename "$ARCHIVE_FIXTURE")"
  cp --reflink=auto "$ARCHIVE_FIXTURE" "$SOURCE_PATH"
fi
if [[ "$MODE" == "roundtrip" ]]; then
  MOD_ROOT="$RUN_ROOT/xdg-data/dev.stormix.deadlock-mod-manager/mods/issue-642"
  mkdir -p "$MOD_ROOT"
  TARGET_PATH="$MOD_ROOT/copied-${SIZE_MIB}mib.vpk"
fi

sed \
  -e "s|__FIXTURE_PATH__|$FIXTURE|g" \
  -e "s|__ARCHIVE_PATH__|$SOURCE_PATH|g" \
  -e "s|__TARGET_PATH__|${TARGET_PATH:-}|g" \
  "$PROBE_TEMPLATE" >"$RUN_ROOT/probe.js"

cleanup() {
  if [[ -n "${SAMPLER_PID:-}" ]]; then
    kill -TERM "$SAMPLER_PID" >/dev/null 2>&1 || true
    wait "$SAMPLER_PID" 2>/dev/null || true
  fi
  if [[ -n "${PROCESS_GROUP:-}" ]]; then
    kill -TERM -- "-$PROCESS_GROUP" >/dev/null 2>&1 || true
    for _ in 1 2 3 4 5; do
      kill -0 -- "-$PROCESS_GROUP" >/dev/null 2>&1 || break
      sleep 0.2
    done
    kill -KILL -- "-$PROCESS_GROUP" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

env \
  XDG_DATA_HOME="$RUN_ROOT/xdg-data" \
  XDG_CONFIG_HOME="$RUN_ROOT/xdg-config" \
  XDG_CACHE_HOME="$RUN_ROOT/xdg-cache" \
  WEBKIT_INSPECTOR_HTTP_SERVER="127.0.0.1:$PORT" \
  setsid "$BINARY" --disable-auto-update >"$RUN_ROOT/app.log" 2>&1 &
APP_PID=$!
sleep 10
kill -0 "$APP_PID" >/dev/null 2>&1 || fail "Desktop app exited during startup"
PROCESS_GROUP="$(ps -o pgid= -p "$APP_PID" | tr -d ' ')"

printf 'epoch_ms,app_rss_kib,webview_rss_kib,network_rss_kib,total_rss_kib\n' >"$RUN_ROOT/memory.csv"
(
  while kill -0 "$APP_PID" >/dev/null 2>&1; do
    read -r APP_RSS_KIB WEBVIEW_RSS_KIB NETWORK_RSS_KIB TOTAL_RSS_KIB < <(
      ps -g "$PROCESS_GROUP" -o comm=,rss= | awk '
        /deadlock-mod-ma/ { app += $2 }
        /WebKitWebProces/ { webview += $2 }
        /WebKitNetworkPr/ { network += $2 }
        { total += $2 }
        END { print app + 0, webview + 0, network + 0, total + 0 }
      '
    )
    printf '%s,%s,%s,%s,%s\n' \
      "$(date +%s%3N)" "$APP_RSS_KIB" "$WEBVIEW_RSS_KIB" "$NETWORK_RSS_KIB" "$TOTAL_RSS_KIB"
    sleep 0.05
  done
) >>"$RUN_ROOT/memory.csv" &
SAMPLER_PID=$!

set +e
timeout --signal=TERM "$TIMEOUT_SECONDS" \
  node "$SCRIPT_DIR/webkit-evaluate.mjs" "$PORT" "$RUN_ROOT/probe.js" \
  >"$RUN_ROOT/probe.json" 2>"$RUN_ROOT/probe-error.log"
PROBE_STATUS=$?
set -e
kill -TERM "$SAMPLER_PID" >/dev/null 2>&1 || true
wait "$SAMPLER_PID" 2>/dev/null || true
SAMPLER_PID=""

BASELINE_RSS_KIB="$(awk -F, 'NR == 2 { print $5 }' "$RUN_ROOT/memory.csv")"
PEAK_RSS_KIB="$(awk -F, 'NR > 1 && $5 > peak { peak = $5 } END { print peak + 0 }' "$RUN_ROOT/memory.csv")"
printf '{"artifact":"%s","mode":"%s","binarySha256":"%s","fixtureBytes":%s,"baselineRssKiB":%s,"peakRssKiB":%s,"rssDeltaKiB":%s,"probe":' \
  "$ARTIFACT" \
  "$MODE" \
  "$(sha256sum "$BINARY" | awk '{print $1}')" \
  "$(stat -c %s "$SOURCE_PATH")" \
  "$BASELINE_RSS_KIB" \
  "$PEAK_RSS_KIB" \
  "$((PEAK_RSS_KIB - BASELINE_RSS_KIB))"
if [[ -s "$RUN_ROOT/probe.json" ]]; then
  tr -d '\n' <"$RUN_ROOT/probe.json"
else
  printf 'null'
fi
printf ',"runRoot":"%s"}\n' "$RUN_ROOT"

[[ "$PROBE_STATUS" -eq 0 ]] || fail "IPC command failed or timed out; inspect $RUN_ROOT"
node -e '
  const result = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  if (!result.hasFocus || result.visibilityState !== "visible") process.exit(2);
  if (result.maxTimerGapMs > 250) process.exit(3);
' "$RUN_ROOT/probe.json" || case "$?" in
  2) fail "Invalid responsiveness sample: app was not focused and visible" ;;
  3) fail "Reproduced UI stall over 250 ms" ;;
  *) fail "Could not validate probe result" ;;
esac
