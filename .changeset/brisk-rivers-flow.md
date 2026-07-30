---
"@deadlock-mods/api": patch
"@deadlock-mods/bot": patch
"@deadlock-mods/lockdex": patch
"@deadlock-mods/mirror-service": patch
"@deadlock-mods/queue": minor
---

Fix cron workers consuming jobs from unrelated services

Each service now owns a dedicated cron queue, and a single worker per service
dispatches jobs to the processor registered under that job's name. Cron jobs are
also no longer scheduled until the service explicitly starts, so a job that is
already due at boot can no longer fail while later jobs are still registering.
