import { parseNewModEvent, REDIS_CHANNELS } from "@deadlock-mods/shared";
import IORedis from "ioredis";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";
import { ForumPosterService } from "./forum-poster";

const logger = mainLogger.child().withContext({
  service: "redis-subscriber",
});

export class RedisSubscriberService {
  private static instance: RedisSubscriberService | null = null;
  private subscriber: IORedis | null = null;
  private forumPoster: ForumPosterService;
  private isStarted = false;

  private constructor() {
    this.forumPoster = ForumPosterService.getInstance();
  }

  static getInstance(): RedisSubscriberService {
    if (!RedisSubscriberService.instance) {
      RedisSubscriberService.instance = new RedisSubscriberService();
    }
    return RedisSubscriberService.instance;
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      logger.warn("Redis subscriber already started");
      return;
    }

    try {
      logger.info("Starting Redis subscriber service");

      // Create a dedicated subscriber connection
      this.subscriber = new IORedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: false,
      });

      this.subscriber.on("error", (error) => {
        logger.withError(error).error("Redis subscriber error");
      });

      this.subscriber.on("connect", () => {
        logger.info("Redis subscriber connected");
      });

      this.subscriber.on("ready", () => {
        logger.info("Redis subscriber ready");
      });

      // Subscribe to new mod events
      await this.subscriber.subscribe(REDIS_CHANNELS.NEW_MODS);

      // Handle incoming messages
      this.subscriber.on("message", async (channel, message) => {
        await this.handleMessage(channel, message);
      });

      this.isStarted = true;
      logger.info("Redis subscriber service started successfully");
    } catch (error) {
      logger.withError(error).error("Failed to start Redis subscriber service");
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted || !this.subscriber) {
      return;
    }

    try {
      logger.info("Stopping Redis subscriber service");

      await this.subscriber.unsubscribe();
      await this.subscriber.quit();

      this.subscriber = null;
      this.isStarted = false;

      logger.info("Redis subscriber service stopped");
    } catch (error) {
      logger.withError(error).error("Error stopping Redis subscriber service");
    }
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    try {
      logger
        .withMetadata({
          channel,
          messageLength: message.length,
        })
        .debug("Received Redis message");

      switch (channel) {
        case REDIS_CHANNELS.NEW_MODS:
          await this.handleNewModEvent(message);
          break;
        default:
          logger
            .withMetadata({ channel })
            .warn("Received message from unknown channel");
      }
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          channel,
          message: message.substring(0, 200), // Log first 200 chars for debugging
        })
        .error("Error handling Redis message");
    }
  }

  private async handleNewModEvent(message: string): Promise<void> {
    try {
      // Parse JSON first
      const rawData = JSON.parse(message);

      // Validate with Zod schema for runtime safety
      const event = parseNewModEvent(rawData);

      logger
        .withMetadata({
          modTitle: event.data.title,
          modId: event.data.id,
        })
        .info("Processing new mod event");

      await this.forumPoster.postNewMod(event);

      logger
        .withMetadata({
          modTitle: event.data.title,
          modId: event.data.id,
        })
        .info("Successfully processed new mod event");
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger
          .withError(error)
          .withMetadata({
            message: message.substring(0, 200),
          })
          .error("Failed to parse new mod event JSON");
      } else if (error instanceof Error && error.name === "ZodError") {
        logger
          .withError(error)
          .withMetadata({
            message: message.substring(0, 200),
          })
          .error("Failed to validate new mod event schema");
      } else {
        logger.withError(error).error("Error processing new mod event");
      }
    }
  }
}
