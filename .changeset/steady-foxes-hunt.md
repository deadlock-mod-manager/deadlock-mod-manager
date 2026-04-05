---
"@deadlock-mods/lockdex": patch
---

Fix OOM crashes by reducing memory usage during archive extraction and VPK parsing

- Eliminate double-read of RAR archives (single read shared between listing and extraction)
- Iterate RAR file generator lazily instead of materializing all decompressed buffers at once
- Reduce mod-file-processing worker concurrency from 2 to 1 to halve peak memory
- Use VpkParser.parseFile directly and disable entry listing to reduce VPK parsing memory
- Set BUN_JSC_HEAP_SIZE_MAX to 1.5 GiB in Dockerfile to prevent silent OOM kills
- Extract max file size constant for clarity
