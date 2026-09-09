#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

output="${1:-retired-catalog-$(date -u +%Y%m%dT%H%M%SZ).dump}"

pg_dump "$DATABASE_URL" \
  --data-only \
  --format=custom \
  --compress=9 \
  --table=public.mod \
  --table=public.mod_download \
  --table=public.mirrored_files \
  --file="$output"

sha256sum "$output" > "$output.sha256"
echo "Catalog export written to $output (checksum: $output.sha256)"
