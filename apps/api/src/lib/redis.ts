import IORedis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

let redis: IORedis | null = null;

export function getRedisClient(): IORedis | null {
  if (!env.REDIS_URL) {
    return null;
  }

  if (redis) {
    return redis;
  }

  redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  redis.on("error", (error: Error) => {
    logger.withError(error).error("Redis connection error");
  });

  redis.on("connect", () => {
    logger.info("Redis connected");
  });

  redis.on("ready", () => {
    logger.info("Redis ready");
  });

  redis.on("close", () => {
    logger.info("Redis connection closed");
  });

  return redis;
}

export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
