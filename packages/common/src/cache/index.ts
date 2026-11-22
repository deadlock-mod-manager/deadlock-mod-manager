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

export const TTL_CACHE = new TTLCache({
  max: 1000,
  ttl: 1000 * 60 * 15,
});

export const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

export const FEATURE_FLAG_CACHE_TTL = 60 * 60 * 1000;

export type Cache = ReturnType<typeof createCache>;

export const createNoOpCache = (): Cache => {
  return {
    wrap: <T>(_key: string, fn: () => Promise<T>): Promise<T> => fn(),
    get: async <T>(): Promise<T | undefined> => undefined,
    set: async <T>(_key: string, _value: T, _ttl?: number): Promise<T> =>
      _value,
    del: async (_key: string): Promise<boolean> => true,
    mdel: async (_keys: string[]): Promise<boolean> => true,
    clear: async (): Promise<boolean> => true,
  } as unknown as Cache;
};

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
