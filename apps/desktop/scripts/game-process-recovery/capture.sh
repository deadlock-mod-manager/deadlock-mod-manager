#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 7 ]]; then
  echo "usage: $0 LABEL OUTPUT_ROOT WINDOW_X WINDOW_Y WINDOW_WIDTH WINDOW_HEIGHT CAPTURE_ROOT" >&2
  exit 2
fi

label=$1
output_root=$2
window_x=$3
window_y=$4
window_width=$5
window_height=$6
capture_root=$7
events_path="$output_root/$label-events.ndjson"
done_path="$output_root/$label-done.json"
error_path="$output_root/$label-error.txt"
full_path="$capture_root/full.png"
last=0

mkdir -p "$capture_root"

while true; do
  if [[ -f "$events_path" ]]; then
    count=$(wc -l < "$events_path")
    while ((last < count)); do
      last=$((last + 1))
      line=$(sed -n "${last}p" "$events_path" | sed '1s/^\xef\xbb\xbf//' | tr -d '\r')
      name=$(jq -r .name <<< "$line")
      spectacle -b -n -o "$full_path"
      magick "$full_path" \
        -crop "${window_width}x${window_height}+${window_x}+${window_y}" \
        +repage "$capture_root/$(printf '%02d' "$last")-$name.png"
      echo "captured $last $name"
    done
  fi

  if [[ -f "$done_path" || -f "$error_path" ]]; then
    break
  fi
  sleep 0.2
done

mv "$full_path" "$capture_root/final-full.png"
