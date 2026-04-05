---
"@deadlock-mods/api": patch
---

Fix non-atomic INCR+EXPIRE race condition in Redis rate limiter that could permanently block endpoints
