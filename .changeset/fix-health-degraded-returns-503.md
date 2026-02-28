---
"@deadlock-mods/api": patch
"@deadlock-mods/auth": patch
---

Fix health endpoint returning 503 for degraded status, preventing unnecessary Kubernetes pod restarts on dependency failures
