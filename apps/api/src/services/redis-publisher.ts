import {
  type NewModEvent,
  type NewModEventData,
  NewModEventSchema,
  REDIS_CHANNELS,
} from "@deadlock-mods/shared";
import { logger as mainLogger } from "@/lib/logger";
import { redis } from "@/lib/redis";

const logger = mainLogger.child().withContext({
  service: "redis-publisher",
});

export class RedisPublisherService {
  private static instance: RedisPublisherService | null = null;

  private constructor() {}

  static getInstance(): RedisPublisherService {
    if (!RedisPublisherService.instance) {
      RedisPublisherService.instance = new RedisPublisherService();
    }
    return RedisPublisherService.instance;
  }

  async publishNewMod(modData: NewModEventData): Promise<void> {
    try {
      const event: NewModEvent = {
        type: "new_mod",
        data: modData,
      };

      // Validate the event with Zod schema before publishing
      const validatedEvent = NewModEventSchema.parse(event);
      const message = JSON.stringify(validatedEvent);

      logger
        .withMetadata({
          modTitle: modData.title,
          modId: modData.id,
          channel: REDIS_CHANNELS.NEW_MODS,
        })
        .info("Publishing new mod event");

      const subscriberCount = await redis.publish(
        REDIS_CHANNELS.NEW_MODS,
        message,
      );

      logger
        .withMetadata({
          modTitle: modData.title,
          modId: modData.id,
          subscriberCount,
        })
        .info("Successfully published new mod event");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          modTitle: modData.title,
          modId: modData.id,
        })
        .error("Failed to publish new mod event");
      throw error;
    }
  }
}
