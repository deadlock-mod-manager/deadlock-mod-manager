---
"@deadlock-mods/mirror-service": patch
---

Fix health endpoints to validate Redis, S3, and database connectivity before reporting healthy (returns 503 when dependencies unavailable)
