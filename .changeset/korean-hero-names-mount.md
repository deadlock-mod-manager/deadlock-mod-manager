---
"@deadlock-mods/desktop": patch
---

Fix localized hero name art (e.g. Korean) showing as plain text when mods are enabled by writing the current `Game_UILanguage` and `Game_LowViolence` search paths to gameinfo.gi
