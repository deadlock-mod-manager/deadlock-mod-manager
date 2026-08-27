#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../../.." && pwd)"
ARTIFACT="${1:-main}"
PORT="${DMM_643_INSPECTOR_PORT:-2643}"
POST_FAILURE_WAIT_SECONDS="${DMM_643_POST_FAILURE_WAIT_SECONDS:-20}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RESULT_ROOT="$REPO_ROOT/result/issue-643"
RUN_ROOT="$RESULT_ROOT/runs/$RUN_STAMP-$ARTIFACT"
GAME_ROOT="$RUN_ROOT/fake-deadlock"
GAMEINFO="$GAME_ROOT/game/citadel/gameinfo.gi"
REMOTE_HELPER="$SCRIPT_DIR/webkit-evaluate.mjs"
CACHE_ROOT="$RESULT_ROOT/cache"
EXTRACT_ROOT="$RESULT_ROOT/extracted"
VANILLA_SHA="c1b27311c5243126314b29c3dc782425e11fd351f185eb48e68275db8996cd2e"

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
  main)
    PACKAGE_NAME="$MAIN_NAME"
    PACKAGE_URL="$MAIN_URL"
    PACKAGE_SHA="$MAIN_SHA"
    ;;
  *) fail "Artifact must be stable or main" ;;
esac

for required in awk curl find node pgrep ps python3 sha256sum setsid timeout; do
  command -v "$required" >/dev/null || fail "$required is required"
done
if ! command -v dpkg-deb >/dev/null 2>&1; then
  command -v bsdtar >/dev/null || fail "dpkg-deb or bsdtar is required"
fi
[[ -f "$REMOTE_HELPER" ]] || fail "WebKit helper not found: $REMOTE_HELPER"
if pgrep -f '(^|/)deadlock-mod-manager([[:space:]]|$)' >/dev/null 2>&1; then
  fail "Close every running Deadlock Mod Manager instance before measuring"
fi

mkdir -p "$CACHE_ROOT" "$EXTRACT_ROOT" "$GAME_ROOT/game/citadel" "$RUN_ROOT/xdg-config" "$RUN_ROOT/xdg-cache" "$RUN_ROOT/snapshots"
PACKAGE="$(download_verified "$PACKAGE_NAME" "$PACKAGE_URL" "$PACKAGE_SHA")"
BINARY="$(extract_deb "$ARTIFACT" "$PACKAGE" "$PACKAGE_SHA")"
curl --fail --location --silent --show-error \
  --output "$GAMEINFO" \
  https://api.deadlockmods.app/artifacts/deadlock/gameinfo.gi
[[ "$(sha256sum "$GAMEINFO" | awk '{print $1}')" == "$VANILLA_SHA" ]] || fail "Vanilla gameinfo.gi fixture changed; record a new fixed fixture before measuring"
cp --reflink=auto "$GAMEINFO" "$RUN_ROOT/snapshots/000-initial.gi"
python3 "$SCRIPT_DIR/generate-state.py" --xdg-data-home "$RUN_ROOT/xdg-data" >"$RUN_ROOT/state-path.txt"
sed "s|__GAME_PATH__|$GAME_ROOT|g" "$SCRIPT_DIR/probe-reset-enable.js" >"$RUN_ROOT/probe.js"

cleanup() {
  if [[ -n "${WATCHER_PID:-}" ]]; then
    kill -TERM "$WATCHER_PID" >/dev/null 2>&1 || true
    wait "$WATCHER_PID" 2>/dev/null || true
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

(
  LAST_HASH="$(sha256sum "$GAMEINFO" | awk '{print $1}')"
  SNAPSHOT=1
  while kill -0 "$APP_PID" >/dev/null 2>&1; do
    CURRENT_HASH="$(sha256sum "$GAMEINFO" 2>/dev/null | awk '{print $1}')"
    if [[ -n "$CURRENT_HASH" && "$CURRENT_HASH" != "$LAST_HASH" ]]; then
      SNAPSHOT=$((SNAPSHOT + 1))
      cp --reflink=auto "$GAMEINFO" "$RUN_ROOT/snapshots/$(printf '%03d' "$SNAPSHOT")-$CURRENT_HASH.gi"
      LAST_HASH="$CURRENT_HASH"
    fi
    sleep 0.01
  done
) &
WATCHER_PID=$!

set +e
timeout --signal=TERM 45s node "$REMOTE_HELPER" "$PORT" "$RUN_ROOT/probe.js" >"$RUN_ROOT/probe.json" 2>"$RUN_ROOT/probe-error.log"
PROBE_STATUS=$?
set -e
kill -TERM "$WATCHER_PID" >/dev/null 2>&1 || true
wait "$WATCHER_PID" 2>/dev/null || true
WATCHER_PID=""

APP_SURVIVED_POST_FAILURE=true
APP_EXIT_STATUS=null
for ((tick = 0; tick < POST_FAILURE_WAIT_SECONDS * 2; tick += 1)); do
  if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
    APP_SURVIVED_POST_FAILURE=false
    set +e
    wait "$APP_PID"
    APP_EXIT_STATUS=$?
    set -e
    break
  fi
  sleep 0.5
done

python3 - "$RUN_ROOT" <<'PY'
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
rows = []
for path in sorted((root / "snapshots").glob("*.gi")):
    data = path.read_bytes()
    rows.append({
        "name": path.name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "crlf": data.count(b"\r\n"),
        "bareLf": data.count(b"\n") - data.count(b"\r\n"),
        "markers": b"Deadlock Mod Manager - Start" in data,
        "addonsPath": b"citadel/addons" in data,
    })
(root / "snapshots.json").write_text(json.dumps(rows, indent=2) + "\n")
PY

printf '{"artifact":"%s","binarySha256":"%s","probe":' "$ARTIFACT" "$(sha256sum "$BINARY" | awk '{print $1}')"
if [[ -s "$RUN_ROOT/probe.json" ]]; then
  tr -d '\n' <"$RUN_ROOT/probe.json"
else
  printf 'null'
fi
printf ',"snapshots":'
tr -d '\n' <"$RUN_ROOT/snapshots.json"
printf ',"appSurvivedPostFailure":%s,"appExitStatus":%s,"runRoot":"%s"}\n' \
  "$APP_SURVIVED_POST_FAILURE" "$APP_EXIT_STATUS" "$RUN_ROOT"

[[ "$PROBE_STATUS" -eq 0 ]] || fail "Transition probe failed or the app crashed; inspect $RUN_ROOT"
node -e '
  const result = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  const retry = result.stages.find((stage) => stage.name === "retry-enable");
  if (retry?.error) {
    console.error(retry.error);
    process.exit(3);
  }
' "$RUN_ROOT/probe.json" || fail "Reproduced reset-to-enable failure"
