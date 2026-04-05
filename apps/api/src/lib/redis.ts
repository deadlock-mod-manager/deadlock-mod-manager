import { createRedisCache } from "@deadlock-mods/common";
import IORedis, { type Callback, type Result } from "ioredis";
import { CACHE_TTL } from "./constants";
import { env } from "./env";
import { logger } from "./logger";

/**
 * Lua script that atomically increments a rate-limit counter and sets its TTL.
 * If the key is new (counter == 1) or somehow lost its TTL, the expiry is (re-)applied.
 * Returns {current_count, ttl}.
 */
const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
elseif redis.call('TTL', KEYS[1]) == -1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

declare module "ioredis" {
  interface RedisCommander {
    rateLimit(
      key: string,
      windowSeconds: number,
      callback?: Callback<[number, number]>,
    ): Result<[number, number], { type: "default" }>;
  }
}

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redis.defineCommand("rateLimit", {
  numberOfKeys: 1,
  lua: RATE_LIMIT_SCRIPT,
});

export const redisPublisher = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redis.on("error", (error) => {
  logger.withError(error).error("Redis error");
  process.exit(1);
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

redisPublisher.on("error", (error) => {
  logger.withError(error).error("Redis publisher error");
});

redisPublisher.on("connect", () => {
  logger.info("Redis publisher connected");
});

/**
 * Shared cache-manager instance for the API.
 */
export const cache = createRedisCache(env.REDIS_URL, {
  ttl: CACHE_TTL.DEFAULT,
});
