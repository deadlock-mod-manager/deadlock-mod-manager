---
"@deadlock-mods/mirror-service": minor
"@deadlock-mods/database": minor
---

Add background workers for mirror service validation and cleanup

- Validation worker runs every hour (configurable) to check for stale files by comparing mirroredFiles with modDownloads
- Cleanup worker runs daily to remove unused files older than 14 days (configurable)
- Added Redis configuration and cron job scheduling using @deadlock-mods/queue
- Enhanced MirroredFileRepository with new query methods for validation and cleanup
- Added lastValidated and isStale fields to mirroredFiles schema
- Implemented graceful shutdown handling for background workers
