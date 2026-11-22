import type { RedisOptions } from "ioredis";

export const redisConnectionOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  reconnectOnError(error) {
    // Existing TCP connections can still point at the old primary after failover.
    // READONLY rejects the write, so it can be resent after reconnecting.
    return /(?:^|[\s-])READONLY(?:\s|$)/.test(error.message) ? 2 : false;
  },
};
