---
"@deadlock-mods/desktop": patch
---

Fix the Linux Flatpak crashing to Chromium's "Aw, Snap!" page on launch by running CEF without its own sandbox; zypak's sandbox emulation is incompatible with CEF's Chromium 147 and killed every renderer at spawn.
