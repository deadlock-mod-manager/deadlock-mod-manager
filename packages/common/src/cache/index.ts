import TTLCache from "@isaacs/ttlcache";
import { createCache, memoryStore } from "cache-manager";

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
 * meant to be used directly and not through the cache manager
 * or the @Cacheable decorator.
 */
export const TTL_CACHE = new TTLCache({
  max: 1000,
  ttl: 1000 * 60 * 15,
});

export const DEFAULT_CACHE = createCache(
  memoryStore({
    max: 1000,
    ttl: 1000 * 60 * 15,
  }),
);
