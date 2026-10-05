---
"@deadlock-mods/desktop": patch
---

Fix CEF builds after Tauri moved the CEF runtime into its own crate, and read the hardware ID without the machine-uid plugin. The CEF Flatpak starts again, and the CEF `.deb` now declares the NSS, GBM, ALSA and xkbcommon-x11 libraries it needs.
