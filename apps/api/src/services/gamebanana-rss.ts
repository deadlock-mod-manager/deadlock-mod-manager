import { RuntimeError } from "@deadlock-mods/common";
import { db, RssItemRepository } from "@deadlock-mods/database";
import {
  type AcquiredLock,
  DistributedLockService,
} from "@deadlock-mods/distributed-lock";
import { err, ok } from "neverthrow";
import { GAMEBANANA_RSS_FEED_URL } from "@/lib/constants";
import { gamebananaRssParser } from "@/providers/game-banana/rss-parser";
import { env } from "../lib/env";
import { logger as mainLogger } from "../lib/logger";

const logger = mainLogger.child().withContext({
  service: "gamebanana-rss",
});

export class GameBananaRssService {
  private static instance: GameBananaRssService;
  private readonly lockService: DistributedLockService;
  private readonly rssItemRepository: RssItemRepository;

  constructor() {
    this.lockService = new DistributedLockService(db, logger, {
      defaultInstanceId: env.POD_NAME,
    });
    this.rssItemRepository = new RssItemRepository(db);
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

      const feed = await gamebananaRssParser.parseURL(GAMEBANANA_RSS_FEED_URL);

      logger
        .withMetadata({
          feedTitle: feed.title,
          itemCount: feed.items?.length || 0,
        })
        .info("Successfully parsed RSS feed");

      if (!feed.items || feed.items.length === 0) {
        logger.warn("No items found in RSS feed");
        return ok();
      }

      const rssItemsToStore = feed.items.map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: new Date(item.pubDate),
        image: item.image || null,
        guid: item.guid || null,
        source: "gamebanana" as const,
      }));

      const result =
        await this.rssItemRepository.upsertManyByLink(rssItemsToStore);

      logger
        .withMetadata({
          totalProcessed: result.totalProcessed,
          newItems: result.newItems.length,
          updatedItems: result.updatedItems.length,
        })
        .info("RSS items processed successfully");

      if (result.newItems.length > 0) {
        logger
          .withMetadata({
            newItemTitles: result.newItems.map((item) => item.title),
          })
          .info("New RSS items detected");
      }

      return ok({
        totalProcessed: result.totalProcessed,
        newItems: result.newItems,
        updatedItems: result.updatedItems,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      logger
        .withError(error)
        .error("Error during GameBanana RSS feed processing");

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
