import type { Database, JobLock } from '@deadlock-mods/database';
import { jobLocks } from '@deadlock-mods/database';
import { eq, lt } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../env';
import { logger as mainLogger } from '../logger';

const logger = mainLogger.child().withContext({
  service: 'distributed-lock',
});

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
  release: () => Promise<void>;
  updateHeartbeat: () => Promise<void>;
}

export class DistributedLockService {
  private readonly db: Database;
  private readonly heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private readonly instanceId: string;

  constructor(db: Database, instanceId?: string) {
    this.db = db;
    this.instanceId = instanceId || env.POD_NAME || `pod-${uuidv4()}`;
  }

  /**
   * Acquire a distributed lock for a job
   */
  async acquireLock(
    jobName: string,
    options: LockOptions = {}
  ): Promise<AcquiredLock | null> {
    const {
      timeout = 5 * 60 * 1000, // 5 minutes default
      heartbeatInterval = 30 * 1000, // 30 seconds default
      instanceId = this.instanceId,
    } = options;

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
        logger.warn(`Failed to acquire lock for job: ${jobName}`);
        return null;
      }

      const acquiredLock = result[0];

      // Verify we actually got the lock (not an expired one from another instance)
      if (acquiredLock.lockedBy !== instanceId) {
        logger.warn(
          `Lock for job ${jobName} is held by another instance: ${acquiredLock.lockedBy}`
        );
        return null;
      }

      logger
        .withMetadata({
          lockId: acquiredLock.id,
          instanceId,
          expiresAt: acquiredLock.expiresAt,
        })
        .info(`Successfully acquired lock for job: ${jobName}`);

      // Set up automatic heartbeat
      this.startHeartbeat(acquiredLock.id, jobName, heartbeatInterval);

      const lock: AcquiredLock = {
        jobName,
        instanceId,
        lockId: acquiredLock.id,
        release: async () => {
          await this.releaseLock(acquiredLock.id);
        },
        updateHeartbeat: async () => {
          await this.updateHeartbeat(acquiredLock.id);
        },
      };

      return lock;
    } catch (error) {
      logger.withError(error).error(`Error acquiring lock for job ${jobName}:`);
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
        logger
          .withMetadata({
            jobName: result[0].jobName,
          })
          .info(`Successfully released lock: ${lockId}`);
      }
    } catch (error) {
      logger.withError(error).error(`Error releasing lock ${lockId}`);
      throw error;
    }
  }

  /**
   * Update heartbeat for a specific lock
   */
  private async updateHeartbeat(lockId: string): Promise<void> {
    try {
      await this.db
        .update(jobLocks)
        .set({ heartbeatAt: new Date() })
        .where(eq(jobLocks.id, lockId));
    } catch (error) {
      logger
        .withError(error)
        .error(`Error updating heartbeat for lock ${lockId}`);
    }
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
        logger
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
      logger.withError(error).error('Error cleaning up expired locks');
    }
  }

  /**
   * Start automatic heartbeat for a lock
   */
  private startHeartbeat(
    lockId: string,
    jobName: string,
    interval: number
  ): void {
    // Clear any existing timer for this lock
    this.stopHeartbeat(lockId);

    const timer = setInterval(async () => {
      try {
        await this.updateHeartbeat(lockId);
        logger
          .withMetadata({ jobName })
          .debug(`Updated heartbeat for lock: ${lockId}`);
      } catch (error) {
        logger
          .withError(error)
          .error(`Failed to update heartbeat for lock ${lockId}`);
        this.stopHeartbeat(lockId);
      }
    }, interval);

    this.heartbeatTimers.set(lockId, timer);
  }

  /**
   * Stop heartbeat for a lock
   */
  private stopHeartbeat(lockId: string): void {
    const timer = this.heartbeatTimers.get(lockId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(lockId);
    }
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
      logger
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
      logger
        .withError(error)
        .error(`Error getting lock info for job ${jobName}`);
      return { isLocked: false };
    }
  }

  /**
   * Cleanup all timers (call this when shutting down)
   */
  cleanup(): void {
    this.heartbeatTimers.forEach((timer) => {
      clearInterval(timer);
    });
    this.heartbeatTimers.clear();
    logger.info('Cleaned up all heartbeat timers');
  }
}
