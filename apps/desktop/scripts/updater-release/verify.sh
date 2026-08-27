#!/usr/bin/env bash

set -uo pipefail

if (( $# == 0 )); then
  echo "Usage: $0 <updater-manifest-url> [...]" >&2
  exit 2
fi

for command in curl jq; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 2
  fi
done

failures=0
temporary_files=()

cleanup() {
  if (( ${#temporary_files[@]} > 0 )); then
    rm -f -- "${temporary_files[@]}"
  fi
}
trap cleanup EXIT

record_failure() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

for endpoint in "$@"; do
  manifest_file=$(mktemp)
  temporary_files+=("$manifest_file")

  printf '\nManifest: %s\n' "$endpoint"

  manifest_status=$(
    curl --connect-timeout 10 --max-time 30 \
      --location --silent --show-error \
      --output "$manifest_file" \
      --write-out '%{http_code}' \
      "$endpoint" || true
  )

  if [[ "$manifest_status" != "200" ]]; then
    record_failure "manifest returned HTTP $manifest_status"
    continue
  fi

  if ! jq --exit-status '
    (.version | type == "string" and length > 0) and
    (.platforms | type == "object" and length > 0) and
    ([.platforms[] |
      (.url | type == "string" and startswith("https://")) and
      (.signature | type == "string")
    ] | all)
  ' "$manifest_file" >/dev/null; then
    record_failure "manifest schema is incomplete"
    continue
  fi

  printf 'Version: %s\n' "$(jq --raw-output '.version' "$manifest_file")"

  while IFS=$'\t' read -r platform url signature; do
    printf '  %-28s ' "$platform"

    if [[ "$platform" == *-flatpak ]]; then
      printf 'FAIL package-managed format in native updater manifest\n'
      failures=$((failures + 1))
      continue
    fi

    if [[ -z "$signature" ]]; then
      printf 'FAIL empty updater signature\n'
      failures=$((failures + 1))
      continue
    fi

    artifact_status=$(
      curl --connect-timeout 10 --max-time 30 \
        --location --head --silent --show-error \
        --output /dev/null \
        --write-out '%{http_code}' \
        "$url" || true
    )

    if [[ "$artifact_status" == "200" ]]; then
      printf 'PASS %s\n' "$url"
    else
      printf 'FAIL HTTP %s %s\n' "$artifact_status" "$url"
      failures=$((failures + 1))
    fi
  done < <(
    jq --raw-output \
      '.platforms | to_entries[] | [.key, .value.url, .value.signature] | @tsv' \
      "$manifest_file"
  )
done

printf '\nFailures: %d\n' "$failures"
(( failures == 0 ))
