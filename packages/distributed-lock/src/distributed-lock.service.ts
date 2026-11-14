import type { Database, JobLock } from "@deadlock-mods/database";
import { RuntimeError, ValidationError } from "@deadlock-mods/common";
import { and, eq, gt, jobLocks, lt } from "@deadlock-mods/database";
import type { Logger } from "@deadlock-mods/logging";
import { v4 as uuidv4 } from "uuid";

export interface LockOptions {
  /** Lock timeout in milliseconds (default: 5 minutes) */
  timeout?: number;
  /** Heartbeat interval in milliseconds (default: 30 seconds) */
  heartbeatInterval?: number;
  /** Pod/instance identifier (default: generated UUID) */
  instanceId?: string;
}

export interface AcquiredLock {
  jobName: string;
  instanceId: string;
  lockId: string;
  /** Aborts with a RuntimeError when ownership is lost or the lock is released. */
  signal: AbortSignal;
  release: () => Promise<void>;
  updateHeartbeat: () => Promise<void>;
}

export interface DistributedLockConfig {
  /** Default instance identifier */
  defaultInstanceId?: string;
}

interface ActiveLock {
  timeout: number;
  interval: number;
  expiresAt: Date;
  expiryTimer: NodeJS.Timeout;
  controller: AbortController;
  /** The renewal in flight, if any. Renewals never overlap. */
  renewal?: Promise<void>;
}

export class DistributedLockService {
  private readonly db: Database;
  private readonly logger: Logger;
  private readonly heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private readonly activeLocks = new Map<string, ActiveLock>();
  private readonly instanceId: string;

  constructor(
    db: Database,
    logger: Logger,
    config: DistributedLockConfig = {},
  ) {
    this.db = db;
    this.instanceId = config.defaultInstanceId || `pod-${uuidv4()}`;
    this.logger = logger.child().withContext({
      service: "distributed-lock",
    });
  }

  /**
   * Acquire a distributed lock for a job
   */
  async acquireLock(
    jobName: string,
    options: LockOptions = {},
  ): Promise<AcquiredLock | null> {
    const {
      timeout = 5 * 60 * 1000, // 5 minutes default
      heartbeatInterval = 30 * 1000, // 30 seconds default
      instanceId = this.instanceId,
    } = options;
    // The owner stops one beat before expiry, so the first renewal needs room.
    if (timeout <= 2 * heartbeatInterval) {
      throw new ValidationError(
        `Lock timeout (${timeout} ms) must exceed twice the heartbeat interval (${heartbeatInterval} ms)`,
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeout);
    const lockId = `lock-${uuidv4()}`;

    try {
      // Clean up expired locks first
      await this.cleanupExpiredLocks();

      // Try to acquire the lock using upsert with conflict handling
      const result = await this.db
        .insert(jobLocks)
        .values({
          id: lockId,
          jobName,
          lockedBy: instanceId,
          lockedAt: now,
          expiresAt,
          heartbeatAt: now,
        })
        .onConflictDoUpdate({
          target: jobLocks.jobName,
          set: {
            id: lockId,
            lockedBy: instanceId,
            lockedAt: now,
            expiresAt,
            heartbeatAt: now,
          },
          where: lt(jobLocks.expiresAt, now), // Only update if the existing lock is expired
        })
        .returning();

      if (result.length === 0) {
        this.logger.warn(`Failed to acquire lock for job: ${jobName}`);
        return null;
      }

      const acquiredLock = result[0];

      // Verify we actually got the lock (not an expired one from another instance)
      if (acquiredLock.lockedBy !== instanceId) {
        this.logger.warn(
          `Lock for job ${jobName} is held by another instance: ${acquiredLock.lockedBy}`,
        );
        return null;
      }

      this.logger
        .withMetadata({
          lockId: acquiredLock.id,
          instanceId,
          expiresAt: acquiredLock.expiresAt,
        })
        .info(`Successfully acquired lock for job: ${jobName}`);

      // Set up automatic heartbeat
      const signal = this.startHeartbeat(
        acquiredLock.id,
        jobName,
        heartbeatInterval,
        timeout,
        expiresAt,
      );

      const lock: AcquiredLock = {
        jobName,
        instanceId,
        lockId: acquiredLock.id,
        signal,
        release: async () => {
          await this.releaseLock(acquiredLock.id);
        },
        updateHeartbeat: async () => {
          await this.updateHeartbeat(acquiredLock.id);
        },
      };

      return lock;
    } catch (error) {
      this.logger
        .withError(error)
        .error(`Error acquiring lock for job ${jobName}:`);
      return null;
    }
  }

  /**
   * Release a specific lock
   */
  async releaseLock(lockId: string): Promise<void> {
    try {
      // Stop heartbeat timer
      this.stopHeartbeat(lockId);

      // Delete the lock
      const result = await this.db
        .delete(jobLocks)
        .where(eq(jobLocks.id, lockId))
        .returning();

      if (result.length > 0) {
        this.logger
          .withMetadata({
            jobName: result[0].jobName,
          })
          .info(`Successfully released lock: ${lockId}`);
      }
    } catch (error) {
      this.logger.withError(error).error(`Error releasing lock ${lockId}`);
      throw error;
    }
  }

  /**
   * Update heartbeat for a specific lock
   */
  private async updateHeartbeat(lockId: string): Promise<void> {
    const activeLock = this.activeLocks.get(lockId);
    if (!activeLock) {
      throw new RuntimeError(`Lock ${lockId} is no longer held`);
    }
    // A slow renewal must not race the next one: an older response arriving
    // last would move the lease, and the expiry timer, back in time.
    if (!activeLock.renewal) {
      activeLock.renewal = this.renew(lockId, activeLock).finally(() => {
        activeLock.renewal = undefined;
      });
    }
    return activeLock.renewal;
  }

  private async renew(lockId: string, activeLock: ActiveLock): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + activeLock.timeout);
    let renewed: { id: string }[];
    try {
      renewed = await this.db
        .update(jobLocks)
        .set({ heartbeatAt: now, expiresAt })
        .where(and(eq(jobLocks.id, lockId), gt(jobLocks.expiresAt, now)))
        .returning({ id: jobLocks.id });
    } catch (error) {
      // Nobody else can take the lock before it expires, so a failed renewal
      // is retried on the next beat; the expiry timer stops the owner in time.
      throw new RuntimeError(`Failed to renew lock ${lockId}`, error);
    }
    // Released or stopped while the renewal was in flight.
    if (this.activeLocks.get(lockId) !== activeLock) return;
    if (renewed.length === 0) {
      const failure = new RuntimeError(`Lock ${lockId} is no longer held`);
      this.stopHeartbeat(lockId, failure);
      throw failure;
    }
    activeLock.expiresAt = expiresAt;
    clearTimeout(activeLock.expiryTimer);
    activeLock.expiryTimer = this.scheduleExpiry(
      lockId,
      expiresAt,
      activeLock.interval,
    );
  }

  /**
   * Abort the owner one beat before its lease runs out, whether or not a
   * renewal is still pending: after that another instance may claim the row.
   */
  private scheduleExpiry(
    lockId: string,
    expiresAt: Date,
    interval: number,
  ): NodeJS.Timeout {
    return setTimeout(
      () =>
        this.stopHeartbeat(
          lockId,
          new RuntimeError(`Lost lock ${lockId}: it expired before a renewal`),
        ),
      Math.max(0, expiresAt.getTime() - interval - Date.now()),
    );
  }

  /**
   * Clean up expired locks
   */
  private async cleanupExpiredLocks(): Promise<void> {
    try {
      const now = new Date();
      const result = await this.db
        .delete(jobLocks)
        .where(lt(jobLocks.expiresAt, now))
        .returning();

      if (result.length > 0) {
        this.logger
          .withMetadata({
            expiredLocks: result.map((lock: JobLock) => ({
              jobName: lock.jobName,
              lockedBy: lock.lockedBy,
              expiredAt: lock.expiresAt,
            })),
          })
          .info(`Cleaned up ${result.length} expired locks`);
      }
    } catch (error) {
      this.logger.withError(error).error("Error cleaning up expired locks");
    }
  }

  /**
   * Start automatic heartbeat for a lock
   */
  private startHeartbeat(
    lockId: string,
    jobName: string,
    interval: number,
    timeout: number,
    expiresAt: Date,
  ): AbortSignal {
    this.stopHeartbeat(lockId);
    const activeLock: ActiveLock = {
      timeout,
      interval,
      expiresAt,
      expiryTimer: this.scheduleExpiry(lockId, expiresAt, interval),
      controller: new AbortController(),
    };
    this.activeLocks.set(lockId, activeLock);

    const timer = setInterval(async () => {
      try {
        await this.updateHeartbeat(lockId);
        this.logger
          .withMetadata({ jobName })
          .debug(`Updated heartbeat for lock: ${lockId}`);
      } catch (error) {
        this.logger
          .withError(error)
          .error(`Failed to update heartbeat for lock ${lockId}`);
      }
    }, interval);

    this.heartbeatTimers.set(lockId, timer);
    return activeLock.controller.signal;
  }

  /**
   * Stop heartbeat for a lock
   */
  private stopHeartbeat(
    lockId: string,
    reason = new RuntimeError(`Lock ${lockId} is no longer held`),
  ): void {
    const timer = this.heartbeatTimers.get(lockId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(lockId);
    }
    const activeLock = this.activeLocks.get(lockId);
    this.activeLocks.delete(lockId);
    clearTimeout(activeLock?.expiryTimer);
    activeLock?.controller.abort(reason);
  }

  /**
   * Check if a lock is currently held for a job
   */
  async isLocked(jobName: string): Promise<boolean> {
    try {
      await this.cleanupExpiredLocks();

      const result = await this.db
        .select()
        .from(jobLocks)
        .where(eq(jobLocks.jobName, jobName))
        .limit(1);

      return result.length > 0;
    } catch (error) {
      this.logger
        .withError(error)
        .error(`Error checking lock status for job ${jobName}`);
      return false;
    }
  }

  /**
   * Get lock information for a job
   */
  async getLockInfo(jobName: string): Promise<{
    isLocked: boolean;
    lockedBy?: string;
    lockedAt?: Date;
    expiresAt?: Date;
    heartbeatAt?: Date;
  }> {
    try {
      await this.cleanupExpiredLocks();

      const result = await this.db
        .select()
        .from(jobLocks)
        .where(eq(jobLocks.jobName, jobName))
        .limit(1);

      if (result.length === 0) {
        return { isLocked: false };
      }

      const lock = result[0];
      return {
        isLocked: true,
        lockedBy: lock.lockedBy,
        lockedAt: lock.lockedAt,
        expiresAt: lock.expiresAt,
        heartbeatAt: lock.heartbeatAt,
      };
    } catch (error) {
      this.logger
        .withError(error)
        .error(`Error getting lock info for job ${jobName}`);
      return { isLocked: false };
    }
  }

  /**
   * Cleanup all timers (call this when shutting down)
   */
  cleanup(): void {
    for (const lockId of this.activeLocks.keys()) {
      this.stopHeartbeat(lockId);
    }
    this.logger.info("Cleaned up all heartbeat timers");
  }
}
