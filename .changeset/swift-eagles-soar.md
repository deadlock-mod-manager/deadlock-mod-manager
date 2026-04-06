---
"@deadlock-mods/desktop": patch
---

Fix download queue getting blocked by slow archive extractions by decoupling extraction from the download queue. Extractions now run in separate background tasks with a 10-minute timeout, and downloads use connect/read timeouts to prevent stalled connections.
