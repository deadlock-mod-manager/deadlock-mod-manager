# @deadlock-mods/distributed-lock

A distributed lock service for coordinating work across multiple instances/pods in the Deadlock Mod Manager ecosystem.

## Features

- **Distributed Locking**: Coordinate work across multiple application instances
- **Automatic Heartbeats**: Keep locks alive with configurable heartbeat intervals
- **Timeout Management**: Automatically release expired locks
- **Lock Status Querying**: Check lock status and get detailed lock information
- **Resource Cleanup**: Proper cleanup of timers and resources

## Installation

```bash
pnpm add @deadlock-mods/distributed-lock
```

## Usage

```typescript
import { DistributedLockService } from "@deadlock-mods/distributed-lock";
import { db } from "@deadlock-mods/database";

// Create service instance
const lockService = new DistributedLockService(db, {
  defaultInstanceId: "my-app-instance-1",
});

// Acquire a lock
const lock = await lockService.acquireLock("critical-job", {
  timeout: 10 * 60 * 1000, // 10 minutes
  heartbeatInterval: 30 * 1000, // 30 seconds
});

if (lock) {
  try {
    // Do your critical work here
    console.log("Lock acquired, doing work...");

    // Manually update heartbeat if needed
    await lock.updateHeartbeat();
  } finally {
    // Always release the lock
    await lock.release();
  }
} else {
  console.log("Could not acquire lock, job may already be running");
}

// Check lock status
const isLocked = await lockService.isLocked("critical-job");
const lockInfo = await lockService.getLockInfo("critical-job");

// Cleanup when shutting down
process.on("SIGTERM", () => {
  lockService.cleanup();
});
```

## API

### DistributedLockService

#### Constructor

```typescript
new DistributedLockService(database: Database, config?: DistributedLockConfig)
```

#### Methods

- `acquireLock(jobName: string, options?: LockOptions): Promise<AcquiredLock | null>`
- `isLocked(jobName: string): Promise<boolean>`
- `getLockInfo(jobName: string): Promise<LockInfo>`
- `cleanup(): void`

### Types

```typescript
interface LockOptions {
  timeout?: number; // Lock timeout in ms (default: 5 minutes)
  heartbeatInterval?: number; // Heartbeat interval in ms (default: 30 seconds)
  instanceId?: string; // Instance identifier (default: generated UUID)
}

interface AcquiredLock {
  jobName: string;
  instanceId: string;
  lockId: string;
  release: () => Promise<void>;
  updateHeartbeat: () => Promise<void>;
}
```
