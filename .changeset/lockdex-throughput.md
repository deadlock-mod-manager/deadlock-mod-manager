---
"@deadlock-mods/lockdex": minor
"@deadlock-mods/vpk-parser": minor
"@deadlock-mods/database": patch
"@deadlock-mods/queue": patch
---

Speed up Lockdex and let it catch up on files it never indexed. Downloads now run 8 at a time while extraction and VPK hashing keep a single slot. VPKs are hashed from disk in chunks instead of being loaded into memory twice, and RAR archives are extracted to disk in a short-lived worker. A backfill job every 5 minutes queues files that have no ingestion yet, after live update events. VPKs written before file ids existed are now claimed instead of failing on the sha256 unique index, and files that can never be indexed are recorded and fail without retries. `GET /metrics` on port 9100 reports queue depth, throughput and coverage.
