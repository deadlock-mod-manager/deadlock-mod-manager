#!/bin/sh
# Chromium's own sandbox cannot run inside the Flatpak container, and zypak's
# sandbox emulation is incompatible with CEF's Chromium 147 (renderer fd setup
# fails at spawn, leaving an endless "Aw, Snap!" crash loop). The app disables
# Chromium's sandbox itself under Flatpak (see `app_runtime.rs`).
exec /app/share/deadlock-mod-manager/deadlock-mod-manager "$@"
