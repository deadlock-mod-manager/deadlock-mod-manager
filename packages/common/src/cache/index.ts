import TTLCache from "@isaacs/ttlcache";
import { createKeyv } from "@keyv/redis";
import { createCache } from "cache-manager";

export const createTTLCache = <K, V>(
  options: TTLCache.Options<K, V>,
): TTLCache<K, V> => {
  return new TTLCache<K, V>({
    ...options,
  });
};

/**
 * Unlike the default cache, this cache does not do LRU tracking,
 * it is bound primarily by time. This cache is synchronous and is
 * meant to be used directly and not through the cache manager.
 */
export const TTL_CACHE = new TTLCache({
  max: 1000,
  ttl: 1000 * 60 * 15,
});

/**
 * Default TTL for cache entries (5 minutes)
 */
export const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Default TTL for feature flags (1 hour)
 */
export const FEATURE_FLAG_CACHE_TTL = 60 * 60 * 1000;

/**
 * Cache type for use in type annotations.
 * This is the return type of createCache from cache-manager.
 */
export type Cache = ReturnType<typeof createCache>;

/**
 * Create a Redis-backed cache using cache-manager with @keyv/redis.
 *
 * @param redisUrl - Redis connection URL (e.g., 'redis://localhost:6379')
 * @param options - Optional configuration including TTL
 * @returns A cache-manager Cache instance
 */
export const createRedisCache = (
  redisUrl: string,
  options?: { ttl?: number },
): Cache => {
  const ttl = options?.ttl ?? DEFAULT_CACHE_TTL;
  const redisStore = createKeyv(redisUrl);

  return createCache({
    stores: [redisStore],
    ttl,
  });
};
