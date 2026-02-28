---
"@deadlock-mods/api": patch
"@deadlock-mods/database": patch
---

Fix TOCTOU race condition in announcement endpoints that caused server crashes instead of 404 errors when announcements were deleted between existence check and update
