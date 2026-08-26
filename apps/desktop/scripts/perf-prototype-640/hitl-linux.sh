#!/usr/bin/env bash
# Linux measurement loop for issue #640.
# Usage: bash apps/desktop/scripts/perf-prototype-640/hitl-linux.sh

set -euo pipefail

step() {
  printf '\n>>> %s\n' "$1"
  read -r -p "    [Enter when done] " _
}

capture() {
  local var="$1" question="$2" answer
  printf '\n>>> %s\n' "$question"
  read -r -p "    > " answer
  printf -v "$var" '%s' "$answer"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../../.." && pwd)"
SAMPLE_COUNT="${DMM_PERF_SAMPLES:-5}"
FIXTURE_COUNT="${DMM_PERF_FIXTURE_COUNT:-250}"
SETTLE_SECONDS="${DMM_PERF_SETTLE_SECONDS:-15}"
MEASUREMENT_BLOCK="${DMM_PERF_BLOCK:-0}"
CASE_FILTER="${DMM_PERF_CASE:-all}"
PROBE_CLOCK="${DMM_PERF_PROBE_CLOCK:-animation-frame}"
AUTOMATE="${DMM_PERF_AUTOMATE:-1}"
INSPECTOR_PORT="${DMM_PERF_INSPECTOR_PORT:-2999}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RESULT_ROOT="$REPO_ROOT/result/issue-640"
RUN_ROOT="$RESULT_ROOT/runs/$RUN_STAMP"
CACHE_ROOT="$RESULT_ROOT/cache"
EXTRACT_ROOT="$RESULT_ROOT/extracted"
ACTIVE_PROCESS_GROUP=""
ACTIVE_SAMPLER_PID=""

[[ "$(uname -s)" == "Linux" ]] || fail "This harness must run on Linux"
[[ "$SAMPLE_COUNT" =~ ^[0-9]+$ && "$SAMPLE_COUNT" -gt 0 ]] || fail "DMM_PERF_SAMPLES must be a positive integer"
[[ "$FIXTURE_COUNT" =~ ^[0-9]+$ && "$FIXTURE_COUNT" -gt 0 ]] || fail "DMM_PERF_FIXTURE_COUNT must be a positive integer"
[[ "$SETTLE_SECONDS" =~ ^[0-9]+$ ]] || fail "DMM_PERF_SETTLE_SECONDS must be a non-negative integer"
[[ "$MEASUREMENT_BLOCK" =~ ^[012]$ ]] || fail "DMM_PERF_BLOCK must be 0, 1, or 2"
case "$CASE_FILTER" in
  all | paginated-animated | paginated-static | paginated-occult-off | unpaginated-animated) ;;
  *) fail "DMM_PERF_CASE must be all or a known case name" ;;
esac
case "$PROBE_CLOCK" in
  animation-frame | timer) ;;
  *) fail "DMM_PERF_PROBE_CLOCK must be animation-frame or timer" ;;
esac
[[ "$AUTOMATE" =~ ^[01]$ ]] || fail "DMM_PERF_AUTOMATE must be 0 or 1"

for required in awk bash cat curl date find grep mv pgrep ps python3 sed setsid sha256sum sleep tr uname; do
  require_command "$required"
done
if [[ "$AUTOMATE" == "1" ]]; then
  require_command node
fi
if ! command -v dpkg-deb >/dev/null 2>&1; then
  require_command bsdtar
fi

if pgrep -f '(^|/)deadlock-mod-manager([[:space:]]|$)' >/dev/null 2>&1; then
  fail "Close every running Deadlock Mod Manager instance before measuring"
fi

mkdir -p "$CACHE_ROOT" "$EXTRACT_ROOT" "$RESULT_ROOT/runs"
mkdir "$RUN_ROOT"

STABLE_NAME="Deadlock.Mod.Manager_1.1.0_amd64.deb"
STABLE_URL="https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/v1.1.0/$STABLE_NAME"
STABLE_SHA="18a1eb0e68d794365ff67be2e9a733b93de0902246d956b17b73cc6430205009"
NIGHTLY_NAME="Deadlock.Mod.Manager_1.2.0-nightly.20260825.db775912_amd64.deb"
NIGHTLY_URL="https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/$NIGHTLY_NAME"
NIGHTLY_SHA="14e887792248128a6be0e5336628dc8c4c70ac257704c74b65c950ca530fdbf0"

download_verified() {
  local name="$1" url="$2" expected="$3"
  local destination="$CACHE_ROOT/$name"
  if [[ ! -f "$destination" ]]; then
    printf 'Downloading %s\n' "$name" >&2
    curl --fail --location --retry 3 --output "$destination.part-$RUN_STAMP" "$url"
    local downloaded
    downloaded="$(sha256sum "$destination.part-$RUN_STAMP" | awk '{print $1}')"
    [[ "$downloaded" == "$expected" ]] || fail "SHA-256 mismatch for $name: $downloaded"
    mv "$destination.part-$RUN_STAMP" "$destination"
  fi
  local actual
  actual="$(sha256sum "$destination" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || fail "Cached SHA-256 mismatch for $name: $actual"
  printf '%s\n' "$destination"
}

extract_deb() {
  local label="$1" package="$2" digest="$3"
  local destination="$EXTRACT_ROOT/$label-$digest"
  if [[ ! -d "$destination" ]]; then
    mkdir "$destination"
    if command -v dpkg-deb >/dev/null 2>&1; then
      dpkg-deb --extract "$package" "$destination"
    else
      local archive_root="$destination.__archive"
      mkdir "$archive_root"
      bsdtar -xf "$package" -C "$archive_root"
      local data_archive
      data_archive="$(find "$archive_root" -maxdepth 1 -type f -name 'data.tar.*' -print -quit)"
      [[ -n "$data_archive" ]] || fail "Could not locate data.tar.* in $package"
      bsdtar -xf "$data_archive" -C "$destination"
    fi
  fi
  local binary
  binary="$(find "$destination" -type f -name 'deadlock-mod-manager' -perm -u+x -print -quit)"
  [[ -n "$binary" ]] || fail "Could not locate deadlock-mod-manager in $destination"
  printf '%s\n' "$binary"
}

write_environment() {
  local destination="$RUN_ROOT/environment.txt"
  {
    printf 'captured_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'kernel=%s\n' "$(uname -srvmo)"
    printf 'desktop=%s\n' "${XDG_CURRENT_DESKTOP:-unset}"
    printf 'session_type=%s\n' "${XDG_SESSION_TYPE:-unset}"
    printf 'display=%s\n' "${DISPLAY:-unset}"
    printf 'wayland_display=%s\n' "${WAYLAND_DISPLAY:-unset}"
    printf 'samples=%s\n' "$SAMPLE_COUNT"
    printf 'fixture_count=%s\n' "$FIXTURE_COUNT"
    printf 'settle_seconds=%s\n' "$SETTLE_SECONDS"
    printf 'measurement_block=%s\n' "$MEASUREMENT_BLOCK"
    printf 'case_filter=%s\n' "$CASE_FILTER"
    printf 'probe_clock=%s\n' "$PROBE_CLOCK"
    printf 'automated=%s\n' "$AUTOMATE"
    printf 'stable_sha256=%s\n' "$STABLE_SHA"
    printf 'nightly_sha256=%s\n' "$NIGHTLY_SHA"
    printf '\n[os-release]\n'
    test -r /etc/os-release && cat /etc/os-release || true
    printf '\n[cpu]\n'
    command -v lscpu >/dev/null 2>&1 && lscpu || true
    printf '\n[memory]\n'
    command -v free >/dev/null 2>&1 && free -h || true
    printf '\n[gpu-pci]\n'
    command -v lspci >/dev/null 2>&1 && lspci -nnk | sed -n '/VGA compatible controller\|3D controller\|Display controller/,+3p' || true
    printf '\n[opengl]\n'
    command -v glxinfo >/dev/null 2>&1 && glxinfo -B || true
    printf '\n[vulkan]\n'
    command -v vulkaninfo >/dev/null 2>&1 && vulkaninfo --summary || true
    printf '\n[webkit-packages]\n'
    command -v pacman >/dev/null 2>&1 && pacman -Q | grep -E 'webkit|gtk|mesa|nvidia|vulkan' || true
    printf '\n[power-profile]\n'
    command -v powerprofilesctl >/dev/null 2>&1 && powerprofilesctl get || true
    printf '\n[displays]\n'
    command -v kscreen-doctor >/dev/null 2>&1 && kscreen-doctor -o || true
  } >"$destination" 2>&1
}

record_event() {
  local file="$1" event="$2"
  printf '%s,%s\n' "$(date +%s%3N)" "$event" >>"$file"
}

stop_run() {
  local process_group="$1" sampler_pid="$2"
  kill -TERM "$sampler_pid" >/dev/null 2>&1 || true
  wait "$sampler_pid" 2>/dev/null || true
  kill -TERM -- "-$process_group" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5; do
    kill -0 -- "-$process_group" >/dev/null 2>&1 || return 0
    sleep 0.2
  done
  kill -KILL -- "-$process_group" >/dev/null 2>&1 || true
}

cleanup_active_run() {
  if [[ -n "$ACTIVE_PROCESS_GROUP" && -n "$ACTIVE_SAMPLER_PID" ]]; then
    stop_run "$ACTIVE_PROCESS_GROUP" "$ACTIVE_SAMPLER_PID"
    ACTIVE_PROCESS_GROUP=""
    ACTIVE_SAMPLER_PID=""
  fi
}

trap cleanup_active_run EXIT
trap 'cleanup_active_run; exit 130' INT TERM

run_case() {
  local artifact_label="$1" binary="$2" case_label="$3" pagination="$4" occult="$5"
  local case_root="$RUN_ROOT/$artifact_label/$case_label"
  local xdg_data="$case_root/xdg-data" xdg_config="$case_root/xdg-config" xdg_cache="$case_root/xdg-cache"
  local events="$case_root/events.csv" probe_file="$case_root/probe.json"
  mkdir -p "$case_root" "$xdg_config" "$xdg_cache"
  python3 "$SCRIPT_DIR/generate_fixture.py" \
    --xdg-data-home "$xdg_data" \
    --count "$FIXTURE_COUNT" \
    --pagination "$pagination" \
    --occult "$occult" >"$case_root/fixture-path.txt"
  printf 'epoch_ms,event\n' >"$events"
  local timer_driven=false
  if [[ "$PROBE_CLOCK" == "timer" ]]; then
    timer_driven=true
  fi
  sed \
    -e "s/__DMM_SAMPLE_COUNT__/$SAMPLE_COUNT/g" \
    -e "s/__DMM_FIXTURE_COUNT__/$FIXTURE_COUNT/g" \
    -e "s/__DMM_TIMER_DRIVEN__/$timer_driven/g" \
    "$SCRIPT_DIR/webview-probe.js" >"$case_root/webview-probe.js"

  printf '\n=== %s / %s (pagination=%s, occult=%s) ===\n' "$artifact_label" "$case_label" "$pagination" "$occult"
  record_event "$events" "launch_requested"
  env \
    XDG_DATA_HOME="$xdg_data" \
    XDG_CONFIG_HOME="$xdg_config" \
    XDG_CACHE_HOME="$xdg_cache" \
    WEBKIT_INSPECTOR_HTTP_SERVER="127.0.0.1:$INSPECTOR_PORT" \
    setsid "$binary" --disable-auto-update >"$case_root/app.log" 2>&1 &
  local app_pid=$!
  sleep 1
  kill -0 "$app_pid" >/dev/null 2>&1 || fail "$artifact_label/$case_label exited during startup; inspect $case_root/app.log"
  local process_group
  process_group="$(ps -o pgid= -p "$app_pid" | tr -d ' ')"
  [[ -n "$process_group" ]] || fail "Could not resolve process group for PID $app_pid"
  python3 "$SCRIPT_DIR/sample_process_group.py" \
    --pgid "$process_group" \
    --output "$case_root/process-samples.csv" \
    --interval 0.25 &
  local sampler_pid=$!
  ACTIVE_PROCESS_GROUP="$process_group"
  ACTIVE_SAMPLER_PID="$sampler_pid"

  if [[ "$AUTOMATE" == "1" ]]; then
    node "$SCRIPT_DIR/webkit-remote.mjs" prepare \
      --port "$INSPECTOR_PORT" >"$case_root/prepare.json"
  else
    step "Wait for the app to become interactive, open My Mods from the sidebar, and leave the pointer still."
    capture FIXTURE_VISIBLE "Does My Mods show the isolated $FIXTURE_COUNT-mod fixture without an error? (y/n)"
    if [[ "$FIXTURE_VISIBLE" != "y" && "$FIXTURE_VISIBLE" != "Y" ]]; then
      record_event "$events" "fixture_failed"
      cleanup_active_run
      fail "Fixture did not render for $artifact_label/$case_label"
    fi
  fi
  record_event "$events" "my_mods_ready"

  record_event "$events" "settle_start"
  printf 'Allowing %s seconds for startup caches to settle...\n' "$SETTLE_SECONDS"
  sleep "$SETTLE_SECONDS"
  record_event "$events" "settle_complete"
  record_event "$events" "idle_start"
  printf 'Sampling an enforced 15-second idle window...\n'
  sleep 15
  record_event "$events" "idle_complete"
  if [[ "$AUTOMATE" == "1" ]]; then
    record_event "$events" "probe_requested"
    PROBE_JSON="$(node "$SCRIPT_DIR/webkit-remote.mjs" probe \
      --port "$INSPECTOR_PORT" \
      --script "$case_root/webview-probe.js")"
  else
    if command -v wl-copy >/dev/null 2>&1; then
      wl-copy <"$case_root/webview-probe.js"
      printf 'The probe is now on the clipboard.\n'
    elif command -v xclip >/dev/null 2>&1; then
      xclip -selection clipboard <"$case_root/webview-probe.js"
      printf 'The probe is now on the clipboard.\n'
    else
      printf 'Probe file: %s\n' "$case_root/webview-probe.js"
    fi
    printf 'Inspector target page: http://127.0.0.1:%s\n' "$INSPECTOR_PORT"
    record_event "$events" "probe_prompted"
    capture PROBE_JSON "Open the inspector target, paste the probe in the inspected My Mods console, then paste only the JSON after DMM_ISSUE_640_RESULT="
  fi
  PROBE_JSON="$PROBE_JSON" python3 - "$probe_file" <<'PY'
import json
import os
from pathlib import Path
import sys

value = json.loads(os.environ["PROBE_JSON"])
Path(sys.argv[1]).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
PY
  record_event "$events" "probe_complete"
  cleanup_active_run
}

write_environment
STABLE_PACKAGE="$(download_verified "$STABLE_NAME" "$STABLE_URL" "$STABLE_SHA")"
NIGHTLY_PACKAGE="$(download_verified "$NIGHTLY_NAME" "$NIGHTLY_URL" "$NIGHTLY_SHA")"
STABLE_BINARY="$(extract_deb stable "$STABLE_PACKAGE" "$STABLE_SHA")"
NIGHTLY_BINARY="$(extract_deb nightly "$NIGHTLY_PACKAGE" "$NIGHTLY_SHA")"
"$STABLE_BINARY" --version >"$RUN_ROOT/stable-version.txt" 2>&1 || true
"$NIGHTLY_BINARY" --version >"$RUN_ROOT/nightly-version.txt" 2>&1 || true

printf '\nIssue #640 exploratory pass\n'
printf 'Results: %s\n' "$RUN_ROOT"
printf 'Samples per console-probe case: %s (3 warmups)\n' "$SAMPLE_COUNT"
printf 'Measurement block: %s (0 means exploratory)\n' "$MEASUREMENT_BLOCK"
printf 'Case filter: %s\n' "$CASE_FILTER"
printf 'Probe clock: %s\n' "$PROBE_CLOCK"
printf 'Close unrelated heavy workloads and keep the same display/power setup throughout.\n'

run_artifact_pair() {
  local case_label="$1" pagination="$2" occult="$3"
  if [[ "$MEASUREMENT_BLOCK" == "2" ]]; then
    run_case nightly "$NIGHTLY_BINARY" "$case_label" "$pagination" "$occult"
    run_case stable "$STABLE_BINARY" "$case_label" "$pagination" "$occult"
  else
    run_case stable "$STABLE_BINARY" "$case_label" "$pagination" "$occult"
    run_case nightly "$NIGHTLY_BINARY" "$case_label" "$pagination" "$occult"
  fi
}

run_selected_artifact_pair() {
  local case_label="$1" pagination="$2" occult="$3"
  if [[ "$CASE_FILTER" == "all" || "$CASE_FILTER" == "$case_label" ]]; then
    run_artifact_pair "$case_label" "$pagination" "$occult"
  fi
}

# Block 1 is stable -> nightly; block 2 reverses each pair. The cases isolate
# animated/static/disabled occult rendering and unpaginated library rendering.
run_selected_artifact_pair paginated-animated on animated
run_selected_artifact_pair paginated-static on static
run_selected_artifact_pair paginated-occult-off on off
run_selected_artifact_pair unpaginated-animated off animated
python3 "$SCRIPT_DIR/summarize_run.py" "$RUN_ROOT"

printf '\n--- Captured ---\n'
printf 'RUN_ROOT=%s\n' "$RUN_ROOT"
printf 'SAMPLE_COUNT=%s\n' "$SAMPLE_COUNT"
printf 'FIXTURE_COUNT=%s\n' "$FIXTURE_COUNT"
printf 'MEASUREMENT_BLOCK=%s\n' "$MEASUREMENT_BLOCK"
printf 'STATUS=complete\n'
