import { cache } from "../../lib/redis";
import { MOD_LISTING_CACHE_KEY, modDetailCacheKey } from "./keys";

export type ModCacheInvalidationScope = {
  detail?: boolean;
  listing?: boolean;
};

export type ModSyncCacheInvalidationOptions = {
  remoteId: string;
  filesChanged: boolean;
  contentChanged: boolean;
  deferListingInvalidation?: boolean;
};

class ModCacheService {
  static readonly instance = new ModCacheService();

  async invalidate(
    remoteId: string,
    scope: ModCacheInvalidationScope,
  ): Promise<void> {
    if (scope.detail) {
      await cache.del(modDetailCacheKey(remoteId));
    }

    if (scope.listing) {
      await this.invalidateListing();
    }
  }

  async invalidateListing(): Promise<void> {
    await cache.del(MOD_LISTING_CACHE_KEY);
  }

  async invalidateAfterModSync(
    options: ModSyncCacheInvalidationOptions,
  ): Promise<void> {
    const cacheChanged = options.filesChanged || options.contentChanged;
    if (!cacheChanged) {
      return;
    }

    await this.invalidate(options.remoteId, {
      detail: true,
      listing: !options.deferListingInvalidation,
    });
  }
}

export const modCache = ModCacheService.instance;
