---
"@deadlock-mods/desktop": patch
---

Fix CEF Flatpak bundle missing the CEF runtime. The CEF `.deb` ships its binary as a symlink under `/usr/bin/` pointing into `/usr/share/Deadlock Mod Manager/` (where `libcef.so`, `*.pak`, `locales/`, snapshot blobs, and `chrome-sandbox` live), and the binary has `RUNPATH=$ORIGIN`, so it must stay next to `libcef.so`. The Flatpak manifest previously followed the symlink and copied only the bare ELF, producing a `.flatpak` the same size as the WebKit build that would have failed to load `libcef.so`. The manifest now detects the symlinked layout, copies the entire runtime directory to `/app/share/Deadlock Mod Manager/`, and recreates the symlink at `/app/bin/deadlock-mod-manager`. WebKit (wry) bundles continue to install the binary directly into `/app/bin/`.
