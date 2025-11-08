# @deadlock-mods/mirror-service

## 1.1.1

### Patch Changes

- eb3b7c7: Extend file retention period from 14 to 90 days to provide more stable mirror fallback during GameBanana outages
- Updated dependencies [3127b8d]
  - @deadlock-mods/database@1.6.0
  - @deadlock-mods/shared@1.6.0
  - @deadlock-mods/distributed-lock@1.0.3
  - @deadlock-mods/feature-flags@0.2.1
  - @deadlock-mods/instrumentation@0.1.3

## 1.1.0

### Minor Changes

- 921a7a8: Add background workers for mirror service validation and cleanup

  - Validation worker runs every hour (configurable) to check for stale files by comparing mirroredFiles with modDownloads
  - Cleanup worker runs daily to remove unused files older than 14 days (configurable)
  - Added Redis configuration and cron job scheduling using @deadlock-mods/queue
  - Enhanced MirroredFileRepository with new query methods for validation and cleanup
  - Added lastValidated and isStale fields to mirroredFiles schema
  - Implemented graceful shutdown handling for background workers

- 921a7a8: Add metrics endpoint to mirror service with cache hit rate, storage usage, download counts, and bandwidth savings tracking

### Patch Changes

- eb3b7c7: Extend file retention period from 14 to 90 days to provide more stable mirror fallback during GameBanana outages
- 5a0fa6e: Add HTTP cache headers to enable Cloudflare edge caching and reduce bandwidth usage
- Updated dependencies [f02f058]
- Updated dependencies [921a7a8]
- Updated dependencies [921a7a8]
- Updated dependencies [921a7a8]
- Updated dependencies [0a2b9f4]
- Updated dependencies [23e1528]
- Updated dependencies [51c1afb]
  - @deadlock-mods/feature-flags@0.2.0
  - @deadlock-mods/database@1.5.0
  - @deadlock-mods/shared@1.5.0
  - @deadlock-mods/distributed-lock@1.0.2
  - @deadlock-mods/instrumentation@0.1.2
