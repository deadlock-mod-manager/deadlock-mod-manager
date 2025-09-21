import IORedis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export const redis = new IORedis(env.REDIS_URL, {
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
