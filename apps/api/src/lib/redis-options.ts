import type { RedisOptions } from "ioredis";

export const redisConnectionOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  reconnectOnError(error) {
    return /(?:^|[\s-])READONLY(?:\s|$)/.test(error.message) ? 2 : false;
  },
};
