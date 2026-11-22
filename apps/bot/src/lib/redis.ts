import {
  createRedisCache,
  FEATURE_FLAG_CACHE_TTL,
} from "@deadlock-mods/common";
import IORedis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redis.on("error", (error) => {
  logger.withError(error).error("Redis error");
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

/**
 * Shared cache-manager instance for the bot.
 */
export const cache = createRedisCache(env.REDIS_URL, {
  ttl: FEATURE_FLAG_CACHE_TTL,
});

export default redis;
