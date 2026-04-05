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
import { logger as mainLogger, wideEventContext } from "../lib/logger";
import { RedisPublisherService } from "./redis-publisher";

const logger = mainLogger.child().withContext({
  service: "gamebanana-rss",
});

export class GameBananaRssService {
  private static instance: GameBananaRssService;
  private readonly lockService: DistributedLockService;
  private readonly rssItemRepository: RssItemRepository;
  private readonly redisPublisher: RedisPublisherService;

  constructor() {
    this.lockService = new DistributedLockService(db, logger, {
      defaultInstanceId: env.POD_NAME,
    });
    this.rssItemRepository = new RssItemRepository(db);
    this.redisPublisher = RedisPublisherService.getInstance();
  }

  static getInstance(): GameBananaRssService {
    if (!GameBananaRssService.instance) {
      GameBananaRssService.instance = new GameBananaRssService();
    }
    return GameBananaRssService.instance;
  }

  async processRssFeed(options: { skipLock?: boolean } = {}) {
    const { skipLock = false } = options;
    const wide = wideEventContext.get();
    wide?.merge({
      service: "gamebanana-rss",
      operation: "process_rss_feed",
      skipLock,
    });

    let lock: AcquiredLock | null = null;

    try {
      if (!skipLock) {
        lock = await this.lockService.acquireLock(GameBananaRssService.name, {
          timeout: 10 * 60 * 1000,
          heartbeatInterval: 30 * 1000,
        });

        if (!lock) {
          wide?.set("outcomeReason", "already_locked");
          return ok();
        }
      }

      wide?.merge({
        lockAcquired: !!lock,
        instanceId: lock?.instanceId,
      });

      const feed = await gamebananaRssParser.parseURL(GAMEBANANA_RSS_FEED_URL);

      wide?.merge({
        feedTitle: feed.title,
        feedItemCount: feed.items?.length || 0,
      });

      if (!feed.items || feed.items.length === 0) {
        wide?.set("outcomeReason", "empty_feed");
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

      wide?.merge({
        totalProcessed: result.totalProcessed,
        newItemCount: result.newItems.length,
        updatedItemCount: result.updatedItems.length,
      });

      if (result.newItems.length > 0) {
        for (const newItem of result.newItems) {
          try {
            await this.redisPublisher.publishNewMod({
              id: newItem.id,
              title: newItem.title,
              link: newItem.link,
              pubDate: newItem.pubDate.toISOString(),
              image: newItem.image || undefined,
              source: "gamebanana",
            });
          } catch (publishError) {
            logger
              .withError(publishError)
              .withMetadata({
                modTitle: newItem.title,
                modId: newItem.id,
              })
              .error("Failed to publish new mod event");
          }
        }
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
      } catch (releaseError) {
        logger.withError(releaseError).error("Error releasing lock");
      }
    }
  }
}
