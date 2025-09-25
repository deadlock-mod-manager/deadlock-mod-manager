#!/usr/bin/env bun

/**
 * Test script for mod events using existing database records
 *
 * Usage:
 * bun run apps/api/src/scripts/test-mod-events.ts [--latest]
 *
 * Options:
 * --latest: Use the most recent record (default: false, uses random record)
 *
 * Note: This script sends only one test event. For multiple events testing,
 * use --count=N and --delay=MS parameters if needed.
 */

import { db, RssItemRepository } from "@deadlock-mods/database";
import { logger } from "@/lib/logger";
import { RedisPublisherService } from "@/services/redis-publisher";

const fetchRssItems = async (count: number, latest: boolean) => {
  const rssItemRepository = new RssItemRepository(db);

  if (latest) {
    // Get the most recent records - findAll already sorts by pubDate desc
    const allItems = await rssItemRepository.findAll("gamebanana");
    return allItems.slice(0, count);
  } else {
    // Get random records
    const allItems = await rssItemRepository.findAll("gamebanana");

    if (allItems.length === 0) {
      throw new Error(
        "No RSS items found in database. Please run the RSS processor first.",
      );
    }

    // Shuffle array and take first 'count' items
    const shuffled = [...allItems].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, allItems.length));
  }
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const count = args.find((arg) => arg.startsWith("--count="))?.split("=")[1];
  const delay = args.find((arg) => arg.startsWith("--delay="))?.split("=")[1];
  const latest = args.includes("--latest");

  return {
    count: count ? parseInt(count, 10) : 1,
    delay: delay ? parseInt(delay, 10) : 1000,
    latest,
  };
};

const testModEvents = async () => {
  try {
    const { count, delay, latest } = parseArgs();

    logger
      .withMetadata({ count, delay, latest })
      .info("Starting test mod events using database records");

    // Fetch RSS items from database
    logger.info("Fetching RSS items from database...");
    const rssItems = await fetchRssItems(count, latest);

    if (rssItems.length === 0) {
      throw new Error(
        "No RSS items found. Please run the RSS processor first to populate the database.",
      );
    }

    logger
      .withMetadata({
        foundItems: rssItems.length,
        requestedCount: count,
        selectionMethod: latest ? "latest" : "random",
      })
      .info("Found RSS items from database");

    const redisPublisher = RedisPublisherService.getInstance();

    for (let i = 0; i < rssItems.length; i++) {
      const rssItem = rssItems[i];

      const modEventData = {
        id: rssItem.id,
        title: rssItem.title,
        link: rssItem.link,
        pubDate: rssItem.pubDate.toISOString(),
        image: rssItem.image || undefined,
        source: "gamebanana" as const,
      };

      logger
        .withMetadata({
          modTitle: modEventData.title,
          modId: modEventData.id,
          eventNumber: i + 1,
          totalEvents: rssItems.length,
          originalPubDate: rssItem.pubDate.toISOString(),
        })
        .info("Publishing test mod event from database record");

      await redisPublisher.publishNewMod(modEventData);

      logger
        .withMetadata({
          eventNumber: i + 1,
          totalEvents: rssItems.length,
        })
        .info("Test mod event published successfully");

      // Add delay between events if there are more to send
      if (i < rssItems.length - 1 && delay > 0) {
        logger
          .withMetadata({ delayMs: delay })
          .debug("Waiting before next event");
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    logger
      .withMetadata({ totalEvents: rssItems.length })
      .info("All test mod events published successfully");

    logger.info("Check the bot logs to see if the forum posts were created");

    process.exit(0);
  } catch (error) {
    logger.withError(error).error("Failed to publish test mod events");
    console.error(error);
    process.exit(1);
  }
};

if (import.meta.main) {
  testModEvents();
}
