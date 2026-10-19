---
"@deadlock-mods/lockdex": patch
"@deadlock-mods/vpk-parser": patch
---

Fix memory leaks that got Lockdex OOM-killed during the backfill. The VPK parser now frees every result string the native library returns, and the Lockdex image moves to Bun 1.4, which no longer leaks memory for each terminated RAR extraction worker.
