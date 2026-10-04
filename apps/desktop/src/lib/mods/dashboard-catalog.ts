import type { ModDto } from "@deadlock-mods/shared";
import {
  FEATURED_POOL_SIZE,
  MOD_CATEGORY_ORDER,
  MOD_OUTDATED_CUTOFF_SECONDS,
  TRENDING_LIMIT,
  TRENDING_WINDOW_DAYS,
} from "@/lib/constants";
import {
  CATALOG_QUERY_DEFAULTS,
  queryGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import { MODS_LIST_QUERY_KEY } from "@/lib/mods/mod-query-cache";
import type { CatalogQuery } from "@/types/generated/CatalogQuery";

export const dashboardCatalogQueryKey = (hideNsfw: boolean) =>
  [...MODS_LIST_QUERY_KEY, "dashboard", { hideNsfw }] as const;

// Headroom for candidates the dashboard hooks still drop client-side (not
// downloadable, no preview image or hero).
const FEATURED_CANDIDATES = FEATURED_POOL_SIZE * 3;
const TRENDING_CANDIDATES = TRENDING_LIMIT * 2;

/**
 * The slice of the catalog the dashboard ranks: the top downloads the featured
 * pick draws from, plus each category's top recent and all-time mods. Feeding
 * this to `pickFeaturedMod` and `useTrendingByCategory` yields the same picks
 * as the whole catalog, without loading all of it.
 */
export const getDashboardCatalogMods = async ({
  hideNsfw,
  now = new Date(),
}: {
  hideNsfw: boolean;
  now?: Date;
}): Promise<ModDto[]> => {
  const byDownloads = {
    ...CATALOG_QUERY_DEFAULTS,
    sort: "downloadCount",
  } satisfies CatalogQuery;
  const recentCutoff =
    Math.floor(now.getTime() / 1_000) - TRENDING_WINDOW_DAYS * 24 * 60 * 60;
  const pages = await Promise.all([
    queryGameBananaCatalog({
      ...byDownloads,
      hideNsfw: true,
      hideObsolete: true,
      updatedAfter: MOD_OUTDATED_CUTOFF_SECONDS,
      pageSize: FEATURED_CANDIDATES,
    }),
    ...MOD_CATEGORY_ORDER.flatMap((category) => [
      queryGameBananaCatalog({
        ...byDownloads,
        categories: [category],
        hideNsfw,
        updatedAfter: recentCutoff,
        pageSize: TRENDING_CANDIDATES,
      }),
      queryGameBananaCatalog({
        ...byDownloads,
        categories: [category],
        hideNsfw,
        pageSize: TRENDING_CANDIDATES,
      }),
    ]),
  ]);

  const mods = new Map<string, ModDto>();
  for (const page of pages) {
    for (const mod of page.items) {
      mods.set(mod.remoteId, mod);
    }
  }
  return [...mods.values()];
};
