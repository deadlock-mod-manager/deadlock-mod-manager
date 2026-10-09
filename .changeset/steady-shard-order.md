---
"@deadlock-mods/desktop": patch
---

Keep load order intact in profiles with more than 99 mods: re-enabling a mod puts it back in its place instead of loading it last, and stray files in overflow addon folders are reported even when they share a name with a mod in the main folder.
