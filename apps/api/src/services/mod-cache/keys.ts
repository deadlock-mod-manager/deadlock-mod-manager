export const MOD_DETAIL_CACHE_PREFIX = "mod:" as const;
export const MOD_LISTING_CACHE_KEY = "mods:listing" as const;

export const modDetailCacheKey = (remoteId: string): string =>
  `${MOD_DETAIL_CACHE_PREFIX}${remoteId}`;
