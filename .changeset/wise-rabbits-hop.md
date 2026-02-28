---
"@deadlock-mods/api": patch
---

Fix ReportService swallowing Redis publish errors; rethrow so callers can handle
