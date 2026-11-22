#!/bin/sh
set -eu

instance=$1
scope=$2
ref=$3
cd /
command -v flatpak >/dev/null
exec 3>>"$4"

(
  exec 1>&3 2>&1 3>&-
  attempts=0
  while [ "$attempts" -lt 60 ]; do
    instances=$(flatpak ps --columns=instance) || {
      echo "Could not list Flatpak instances during relaunch" >&2
      exit 1
    }
    running=false
    for current in $instances; do
      if [ "$current" = "$instance" ]; then
        running=true
        break
      fi
    done
    if [ "$running" = false ]; then
      exec flatpak run "$scope" "$ref"
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  echo "Timed out waiting for Flatpak instance $instance to exit" >&2
  exit 1
) </dev/null &
