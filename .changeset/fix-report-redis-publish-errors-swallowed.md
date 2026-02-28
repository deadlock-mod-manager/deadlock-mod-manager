---
"@deadlock-mods/api": patch
---

Fix ReportService swallowing Redis publish errors; rethrow after logging so callers can handle failures
