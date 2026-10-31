---
"@deadlock-mods/desktop": patch
---

Keep the plugin platform out of default release builds and enable it automatically during desktop development. In builds compiled with the plugins feature, disabling the experimental Plugins setting stops workers and revokes sessions while preserving per-plugin settings.
