import { load, type Store } from "@tauri-apps/plugin-store";
import { createLogger } from "@/lib/logger";
import { resolveStorePath } from "@/lib/runtime-bootstrap";

const logger = createLogger("stats-cache");

const STORE_FILE = "stats-cache.json";
const CACHE_VERSION = 3;

export const STATS_TTL = {
  matchHistory: 10 * 60 * 1000,
  matchMetadata: 7 * 24 * 60 * 60 * 1000,
  heroStats: 10 * 60 * 1000,
  rank: 30 * 60 * 1000,
  mates: 60 * 60 * 1000,
  steamProfiles: 24 * 60 * 60 * 1000,
  benchmark: 24 * 60 * 60 * 1000,
  heroCombs: 60 * 60 * 1000,
  distribution: 12 * 60 * 60 * 1000,
  assets: 7 * 24 * 60 * 60 * 1000,
} as const;

type CacheEntry<T> = {
  version: number;
  fetchedAt: number;
  data: T;
};

export type CachedResult<T> = {
  data: T;
  fetchedAt: number;
  isStale: boolean;
};

const MAX_TTL = Math.max(...Object.values(STATS_TTL));

let storePromise: Promise<Store> | null = null;

const evictExpired = async (store: Store): Promise<void> => {
  const now = Date.now();
  const stale: string[] = [];
  for (const [key, value] of await store.entries<CacheEntry<unknown>>()) {
    if (value?.version !== CACHE_VERSION || now - value.fetchedAt > MAX_TTL) {
      stale.push(key);
    }
  }
  await Promise.all(stale.map((key) => store.delete(key)));
};

const getCacheStore = (): Promise<Store> => {
  storePromise ??= resolveStorePath(STORE_FILE)
    .then((storePath) => load(storePath, { autoSave: true, defaults: {} }))
    .then(async (store) => {
      try {
        await evictExpired(store);
      } catch (error) {
        logger.withError(error).warn("Cache eviction failed");
      }
      return store;
    });
  return storePromise;
};

const readEntry = async <T>(key: string): Promise<CacheEntry<T> | null> => {
  try {
    const store = await getCacheStore();
    const entry = await store.get<CacheEntry<T>>(key);
    if (!entry || entry.version !== CACHE_VERSION) {
      return null;
    }
    return entry;
  } catch (error) {
    logger.withError(error).withMetadata({ key }).warn("Cache read failed");
    return null;
  }
};

const writeEntry = async <T>(key: string, data: T): Promise<number> => {
  const fetchedAt = Date.now();
  try {
    const store = await getCacheStore();
    await store.set(key, { version: CACHE_VERSION, fetchedAt, data });
  } catch (error) {
    logger.withError(error).withMetadata({ key }).warn("Cache write failed");
  }
  return fetchedAt;
};

export const cachedFetch = async <T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  options: { force?: boolean } = {},
): Promise<CachedResult<T>> => {
  const cached = await readEntry<T>(key);

  if (!options.force && cached && Date.now() - cached.fetchedAt < ttl) {
    return { data: cached.data, fetchedAt: cached.fetchedAt, isStale: false };
  }

  try {
    const data = await fetcher();
    return { data, fetchedAt: await writeEntry(key, data), isStale: false };
  } catch (error) {
    if (cached) {
      logger
        .withError(error)
        .withMetadata({ key })
        .warn("Serving stale stats from cache");
      return { data: cached.data, fetchedAt: cached.fetchedAt, isStale: true };
    }
    throw error;
  }
};

export const clearCachedPrefix = async (prefix: string): Promise<void> => {
  try {
    const store = await getCacheStore();
    const keys = await store.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(prefix))
        .map((key) => store.delete(key)),
    );
  } catch (error) {
    logger.withError(error).withMetadata({ prefix }).warn("Cache clear failed");
  }
};
