#!/bin/sh
# Chromium's own sandbox cannot run inside the Flatpak container, and zypak's
# sandbox emulation is incompatible with CEF's Chromium 147 (renderer fd setup
# fails at spawn, leaving an endless "Aw, Snap!" crash loop). Run unsandboxed
# and rely on the Flatpak container instead, like other CEF Flatpaks do.
exec /app/share/deadlock-mod-manager/deadlock-mod-manager --no-sandbox "$@"
