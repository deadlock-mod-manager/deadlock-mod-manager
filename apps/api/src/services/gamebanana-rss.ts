import { RuntimeError } from "@deadlock-mods/common";
import { db } from "@deadlock-mods/database";
import {
  type AcquiredLock,
  DistributedLockService,
} from "@deadlock-mods/distributed-lock";
import { err, ok } from "neverthrow";
import { env } from "../lib/env";
import { logger as mainLogger } from "../lib/logger";

const logger = mainLogger.child().withContext({
  service: "gamebanana-rss",
});

export class GameBananaRssService {
  private static instance: GameBananaRssService;
  private readonly lockService: DistributedLockService;

  constructor() {
    this.lockService = new DistributedLockService(db, logger, {
      defaultInstanceId: env.POD_NAME,
    });
  }

  static getInstance(): GameBananaRssService {
    if (!GameBananaRssService.instance) {
      GameBananaRssService.instance = new GameBananaRssService();
    }
    return GameBananaRssService.instance;
  }

  async processRssFeed(options: { skipLock?: boolean } = {}) {
    const { skipLock = false } = options;

    let lock: AcquiredLock | null = null;

    try {
      if (!skipLock) {
        logger.info(
          "Attempting to acquire lock for GameBanana RSS feed processing",
        );
        lock = await this.lockService.acquireLock(GameBananaRssService.name, {
          timeout: 10 * 60 * 1000, // 10 minutes
          heartbeatInterval: 30 * 1000, // 30 seconds heartbeat
        });

        if (!lock) {
          logger.warn(
            "Could not acquire lock, another GameBanana RSS feed processing is already running",
          );
          return ok();
        }
      }

      logger
        .withMetadata({
          lockAcquired: !!lock,
          instanceId: lock?.instanceId,
        })
        .info("Starting GameBanana RSS feed processing");

      // TODO: Implement GameBanana RSS feed processing
      logger.info("GameBanana RSS feed processing completed successfully");
      return ok();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      logger.withError(error).error("Error during mod synchronization");

      return err(
        new RuntimeError(
          "Error during gamebanana rss feed processing",
          errorMessage,
        ),
      );
    } finally {
      try {
        await lock?.release();
        logger.info("Lock released successfully");
      } catch (releaseError) {
        logger.withError(releaseError).error("Error releasing lock");
      }
    }
  }
}
