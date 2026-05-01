---
"@deadlock-mods/desktop": patch
"@deadlock-mods/vpk-merger": patch
---

Fix compression lifecycle, backup merge, batch paths, uninstall, VPK I/O. Skip mods with missing staged VPKs during compression rebuild instead of failing the entire operation. Fix addon file count showing inflated numbers when compression is active by deduplicating shared shard files. Preserve original VPK names in compression fallback path to prevent multi-VPK mods from losing files.
