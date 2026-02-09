---
"@deadlock-mods/desktop": patch
---

Fix xdg-open failures on Linux AppImage distributions (Fedora, Arch) by setting proper working directory. When running as AppImage, the app now detects this and sets current_dir to $HOME or / before spawning xdg-open/gio, preventing failures caused by the AppImage temp extraction directory. Also prioritizes gio open over xdg-open on AppImage for better KDE Plasma compatibility.
