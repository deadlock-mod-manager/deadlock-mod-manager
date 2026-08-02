import { load, type Store } from "@tauri-apps/plugin-store";
import { createLogger } from "@/lib/logger";

const logger = createLogger("stats-cache");

// A separate store file so the ~540 KB match history never lands in the zustand
// blob that carries the mod library.
const STORE_FILE = "stats-cache.json";
// Bump when a cached payload's shape changes; older entries are then ignored.
const CACHE_VERSION = 1;

export const STATS_TTL = {
  matchHistory: 10 * 60 * 1000,
  heroStats: 10 * 60 * 1000,
  mmrHistory: 30 * 60 * 1000,
  rank: 30 * 60 * 1000,
  mates: 60 * 60 * 1000,
  steamProfiles: 24 * 60 * 60 * 1000,
  benchmark: 24 * 60 * 60 * 1000,
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
  /** True when the network failed and this is the last known good payload. */
  isStale: boolean;
};

let storePromise: Promise<Store> | null = null;

const getCacheStore = (): Promise<Store> => {
  storePromise ??= load(STORE_FILE, { autoSave: true, defaults: {} });
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

/**
 * Disk-backed read-through cache. Returns cached data while it is younger than
 * `ttl`, and falls back to whatever is cached when the network call fails, so the
 * dashboard stays usable offline instead of erroring out.
 */
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

/**
 * Drops the player-specific entries on a manual refresh while keeping the
 * rarely-changing asset payloads (the hero list alone is ~1 MB).
 */
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
