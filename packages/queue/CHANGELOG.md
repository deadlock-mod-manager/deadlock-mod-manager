# @deadlock-mods/queue

## 0.1.1

### Patch Changes

- 3da6533: Fix BaseQueue job options (retries, backoff, etc.) being ignored at wrong BullMQ level
- 3da6533: Fix cron jobs ignoring defaultJobOptions (retries, backoff, removeOnFail) from queue config
