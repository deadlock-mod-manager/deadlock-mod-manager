---
"@deadlock-mods/api": patch
"@deadlock-mods/database": patch
---

Keep released desktop versions working against the v2 API: report endpoints accept legacy catalog mod IDs again, VPK analysis responses include the `mod` relation older clients require, and existing reports and VPK fingerprints are backfilled with their GameBanana submission identity.
