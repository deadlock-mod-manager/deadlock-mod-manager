import {
  type QueryClient,
  skipToken,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import logger from "@/lib/logger";
import {
  getConvars,
  getPerfCatalog,
  getPerfStatus,
  refreshPerfCatalog,
  resolvePerfConfig,
} from "@/lib/performance/api";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { STALE_TIME_API } from "@/lib/query-constants";
import type { CatalogSummary } from "@/types/generated/CatalogSummary";
import type { ConvarMeta } from "@/types/generated/ConvarMeta";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { ResolvedConfig } from "@/types/generated/ResolvedConfig";

/** Background checks run at most this often. */
const CATALOG_RECHECK_MS = 60 * 60 * 1000;

let catalogRefresh: Promise<CatalogSummary> | null = null;
let lastCatalogCheck = 0;

/**
 * Asks the API for a newer catalog and adopts it. Calls made while a check is
 * in flight share it. Rejects when the API can't be reached; the current
 * catalog keeps working.
 */
export const refreshPerfCatalogNow = (queryClient: QueryClient) => {
  if (catalogRefresh) return catalogRefresh;
  lastCatalogCheck = Date.now();
  catalogRefresh = refreshPerfCatalog()
    .then(async (summary) => {
      const catalogKey = perfQueryKeys.catalog();
      const previous = queryClient.getQueryData<CatalogSummary>(catalogKey);
      // Cancel a read still in flight so it can't land afterwards with the
      // old catalog, then use the refreshed summary as is.
      await queryClient.cancelQueries({ queryKey: catalogKey });
      queryClient.setQueryData(catalogKey, summary);
      // Presets resolve against the catalog, so other results only go stale
      // when it actually changed.
      if (previous?.version === summary.version) return summary;
      await queryClient.invalidateQueries({
        queryKey: perfQueryKeys.all,
        predicate: (query) => query.queryKey[1] !== catalogKey[1],
      });
      return summary;
    })
    .finally(() => {
      catalogRefresh = null;
    });
  return catalogRefresh;
};

/**
 * Checks for a newer catalog at app start (or the first catalog read), then
 * at most once an hour. Never rejects.
 */
export const refreshPerfCatalogInBackground = async (
  queryClient: QueryClient,
) => {
  if (!catalogRefresh && Date.now() - lastCatalogCheck < CATALOG_RECHECK_MS) {
    return;
  }
  try {
    await refreshPerfCatalogNow(queryClient);
  } catch (error) {
    logger.withError(error).warn("Performance catalog refresh failed");
  }
};

/** The catalog with counts computed against the user's gameinfo.gi. */
export const usePerfCatalog = () => {
  const queryClient = useQueryClient();
  useEffect(() => {
    refreshPerfCatalogInBackground(queryClient);
  }, [queryClient]);

  return useQuery({
    queryKey: perfQueryKeys.catalog(),
    queryFn: getPerfCatalog,
    staleTime: STALE_TIME_API,
    meta: { skipGlobalErrorHandler: true },
  });
};

/** What the file holds versus what the user chose. Re-read on window focus. */
export const usePerfStatus = () =>
  useQuery({
    queryKey: perfQueryKeys.status(),
    queryFn: getPerfStatus,
    refetchOnWindowFocus: true,
    meta: { skipGlobalErrorHandler: true },
  });

const removedNames = (convars: ConvarMeta[]) =>
  new Set(
    convars
      .filter((convar) => convar.status === "removed")
      .map((convar) => convar.name),
  );

/**
 * The names the current game build no longer has, per the synced catalog.
 * Names the catalog doesn't know (launch flags, commands) are never included.
 */
export const useRemovedConvars = (names: readonly string[]) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    refreshPerfCatalogInBackground(queryClient);
  }, [queryClient]);

  return useQuery({
    queryKey: perfQueryKeys.convars(names),
    queryFn: names.length > 0 ? () => getConvars([...names]) : skipToken,
    staleTime: STALE_TIME_API,
    select: removedNames,
    meta: { skipGlobalErrorHandler: true },
  }).data;
};

// Each edit changes the request, so each result is a different query. A
// stable `select` makes the observer share unchanged entries with its previous
// result, so memoized rows skip re-rendering.
const keepUnchangedEntries = (resolved: ResolvedConfig) => resolved;

/** What applying `request` would write. `null` disables the query. */
export const usePerfResolve = (request: PerfApplyRequest | null) =>
  useQuery({
    queryKey: perfQueryKeys.resolve(request),
    queryFn: request ? () => resolvePerfConfig(request) : skipToken,
    placeholderData: (previous) => previous,
    select: keepUnchangedEntries,
    meta: { skipGlobalErrorHandler: true },
  });
