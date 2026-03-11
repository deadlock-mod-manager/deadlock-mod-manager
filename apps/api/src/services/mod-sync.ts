import { db } from "@deadlock-mods/database";
import {
  type AcquiredLock,
  DistributedLockService,
} from "@deadlock-mods/distributed-lock";
import type { GameBanana } from "@deadlock-mods/shared";
import * as Sentry from "@sentry/node";
import { env } from "../lib/env";
import { logger as mainLogger } from "../lib/logger";
import { providerRegistry } from "../providers";
import type { GameBananaSubmission } from "../providers/game-banana/types";
import { cache } from "../lib/redis";

const logger = mainLogger.child().withContext({
  service: "mod-sync",
});

export class ModSyncService {
  private static instance: ModSyncService;
  private readonly lockService: DistributedLockService;
  private readonly JOB_NAME = "synchronize-mods"; // TODO: we'll refactor this to the processor
  private readonly MONITOR_SLUG = "synchronize-mods-cron";

  constructor() {
    this.lockService = new DistributedLockService(db, logger, {
      defaultInstanceId: env.POD_NAME,
    });
  }

  static getInstance(): ModSyncService {
    if (!ModSyncService.instance) {
      ModSyncService.instance = new ModSyncService();
    }
    return ModSyncService.instance;
  }

  async synchronizeMod(
    remoteId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      logger
        .withMetadata({ remoteId })
        .info("Starting single mod synchronization");

      const provider =
        providerRegistry.getProvider<GameBananaSubmission>("gamebanana");

      const submission = { _idRow: Number(remoteId) } as GameBananaSubmission;
      const result = await provider.createMod(submission, "all");

      if (!result.mod) {
        return {
          success: false,
          message: `Failed to synchronize mod ${remoteId}`,
        };
      }

      if (result.filesChanged) {
        await cache.del("mods:listing");
      }

      logger
        .withMetadata({ remoteId })
        .info("Single mod synchronization completed successfully");

      return {
        success: true,
        message: `Mod ${remoteId} synchronized successfully`,
      };
    } catch (error) {
      logger.withError(error).error("Error during single mod synchronization");

      return {
        success: false,
        message: "Synchronization failed",
      };
    }
  }

  async synchronizeMods(
    options: {
      skipLock?: boolean;
      checkInId?: string;
      monitorSlug?: string;
    } = {},
  ): Promise<{ success: boolean; message: string }> {
    const {
      skipLock = false,
      checkInId,
      monitorSlug = this.MONITOR_SLUG,
    } = options;

    let lock: AcquiredLock | null = null;

    try {
      // Try to acquire the lock for this job unless skipped
      if (!skipLock) {
        logger.info("Attempting to acquire lock for mod synchronization");
        lock = await this.lockService.acquireLock(this.JOB_NAME, {
          timeout: 10 * 60 * 1000, // 10 minutes
          heartbeatInterval: 30 * 1000, // 30 seconds heartbeat
        });

        if (!lock) {
          const message =
            "Could not acquire lock, another synchronization is already running";
          logger.info(message);
          return { success: false, message };
        }
      }

      logger
        .withMetadata({
          lockAcquired: !!lock,
          instanceId: lock?.instanceId,
        })
        .info("Starting mod synchronization");

      const provider =
        providerRegistry.getProvider<GameBanana.GameBananaSubmission>(
          "gamebanana",
        );
      await provider.synchronize();

      logger.info("Mod synchronization completed successfully");

      // Report success to Sentry if checkInId is provided
      if (checkInId) {
        Sentry.captureCheckIn({
          checkInId,
          monitorSlug,
          status: "ok",
        });
      }

      return {
        success: true,
        message: "Mod synchronization completed successfully",
      };
    } catch (error) {
      logger.withError(error).error("Error during mod synchronization");

      // Report error to Sentry if checkInId is provided
      if (checkInId) {
        Sentry.captureCheckIn({
          checkInId,
          monitorSlug,
          status: "error",
        });
      }

      return {
        success: false,
        message: "Synchronization failed",
      };
    } finally {
      // Always release the lock if we acquired it
      if (lock) {
        try {
          await lock.release();
          logger.info("Lock released successfully");
        } catch (releaseError) {
          logger.withError(releaseError).error("Error releasing lock");
          // Don't re-throw this error, the main job is done
        }
      }
    }
  }
}
