import { queryOptions } from "@tanstack/react-query";
import { getGameBananaCatalogFacets } from "@/lib/gamebanana-catalog";
import { MODS_LIST_QUERY_KEY } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API, STALE_TIME_POLL } from "@/lib/query-constants";
import type { CatalogQuery } from "@/types/generated/CatalogQuery";

export const catalogFacetQueryOptions = (
  query: CatalogQuery,
  syncing = false,
) =>
  queryOptions({
    queryKey: [...MODS_LIST_QUERY_KEY, "gamebanana-facets", query],
    queryFn: () => getGameBananaCatalogFacets(query),
    staleTime: STALE_TIME_API,
    // Detail reads and sync batches can enrich SQLite before a full sync settles.
    refetchOnMount: "always",
    refetchInterval: syncing ? STALE_TIME_POLL : false,
  });
