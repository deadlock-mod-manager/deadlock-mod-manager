import { db } from "@deadlock-mods/database";
import {
  type AcquiredLock,
  DistributedLockService,
} from "@deadlock-mods/distributed-lock";
import type { GameBanana } from "@deadlock-mods/shared";
import * as Sentry from "@sentry/node";
import { env } from "../lib/env";
import { logger as mainLogger, wideEventContext } from "../lib/logger";
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
  ): Promise<{ success: boolean; message: string; locked?: boolean }> {
    const wide = wideEventContext.get();
    wide?.merge({
      service: "mod-sync",
      operation: "synchronize_mod",
      remoteId,
    });

    const lockJobName = `synchronize-mod-${remoteId}`;
    let lock: AcquiredLock | null = null;

    try {
      lock = await this.lockService.acquireLock(lockJobName, {
        timeout: 5 * 60 * 1000,
        heartbeatInterval: 30 * 1000,
      });

      wide?.set("lockAcquired", !!lock);

      if (!lock) {
        wide?.set("outcomeReason", "already_locked");
        return {
          success: false,
          message: `Synchronization already in progress for mod ${remoteId}`,
          locked: true,
        };
      }

      const provider =
        providerRegistry.getProvider<GameBananaSubmission>("gamebanana");

      const submission = { _idRow: Number(remoteId) } as GameBananaSubmission;
      const result = await provider.createMod(submission, "all");

      wide?.merge({
        modCreated: !!result.mod,
        filesChanged: result.filesChanged,
      });

      if (!result.mod) {
        return {
          success: false,
          message: `Failed to synchronize mod ${remoteId}`,
        };
      }

      if (result.filesChanged) {
        await cache.del("mods:listing");
      }

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
    } finally {
      if (lock) {
        try {
          await lock.release();
        } catch (releaseError) {
          logger
            .withError(releaseError)
            .error("Error releasing single mod sync lock");
        }
      }
    }
  }

  async synchronizeMods(
    options: {
      skipLock?: boolean;
      checkInId?: string;
      monitorSlug?: string;
    } = {},
  ): Promise<{ success: boolean; message: string; locked?: boolean }> {
    const {
      skipLock = false,
      checkInId,
      monitorSlug = this.MONITOR_SLUG,
    } = options;

    const wide = wideEventContext.get();
    wide?.merge({
      service: "mod-sync",
      operation: "synchronize_mods",
      skipLock,
    });

    let lock: AcquiredLock | null = null;

    try {
      if (!skipLock) {
        lock = await this.lockService.acquireLock(this.JOB_NAME, {
          timeout: 10 * 60 * 1000,
          heartbeatInterval: 30 * 1000,
        });

        if (!lock) {
          wide?.set("outcomeReason", "already_locked");
          return {
            success: false,
            message:
              "Could not acquire lock, another synchronization is already running",
            locked: true,
          };
        }
      }

      wide?.merge({
        lockAcquired: !!lock,
        instanceId: lock?.instanceId,
      });

      const provider =
        providerRegistry.getProvider<GameBanana.GameBananaSubmission>(
          "gamebanana",
        );
      await provider.synchronize();

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
      if (lock) {
        try {
          await lock.release();
        } catch (releaseError) {
          logger.withError(releaseError).error("Error releasing lock");
        }
      }
    }
  }
}
