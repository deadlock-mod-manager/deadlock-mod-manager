---
"@deadlock-mods/distributed-lock": patch
---

Fix distributed locks expiring mid-job despite active heartbeats; heartbeats now correctly extend expiresAt
