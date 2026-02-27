---
"@deadlock-mods/desktop": minor
---

Deprecate AppImage distribution in favour of Flatpak on Linux.

The AppImage build target has been removed. Linux users should now install the app via Flatpak, which provides better desktop integration, sandboxing, and GPU compatibility (including NVIDIA via `--device=all` and a WebKitGTK DMABuf workaround).

The `.deb` and `.rpm` targets are retained for direct package manager installs. AUR packages (`deadlock-modmanager` and `deadlock-modmanager-git`) have been updated accordingly — the binary package now sources the `.deb` release artifact instead of an AppImage, and the git package builds from source without relying on any bundle format.
