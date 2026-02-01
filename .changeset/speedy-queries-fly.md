---
"@deadlock-mods/database": patch
"@deadlock-mods/api": patch
---

Optimize database queries and add Redis caching for high-volume endpoints

- Change OAuth access token indexes to unique indexes for faster lookups
- Add Redis caching to report counts endpoint with 24h TTL
- Add Redis caching to individual mod lookup endpoint
