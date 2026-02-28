---
"@deadlock-mods/queue": patch
---

Fix BaseQueue passing job options at wrong level — BullMQ expects them in defaultJobOptions, so attempts, backoff, timeout, and removeOnComplete/removeOnFail were ignored
