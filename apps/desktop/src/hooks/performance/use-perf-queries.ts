import {
  type QueryClient,
  skipToken,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import logger from "@/lib/logger";
import {
  getPerfCatalog,
  getPerfStatus,
  refreshPerfCatalog,
  resolvePerfConfig,
} from "@/lib/performance/api";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { STALE_TIME_API } from "@/lib/query-constants";
import type { CatalogSummary } from "@/types/generated/CatalogSummary";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { ResolvedConfig } from "@/types/generated/ResolvedConfig";

let catalogRefresh: Promise<void> | null = null;

/**
 * Asks the API for a newer catalog, once per session (app start, or the first
 * catalog read). The bundled one keeps working when that fails.
 */
export const refreshPerfCatalogOnce = (queryClient: QueryClient) => {
  catalogRefresh ??= refreshPerfCatalog()
    .then(async (summary) => {
      const catalogKey = perfQueryKeys.catalog();
      const previous = queryClient.getQueryData<CatalogSummary>(catalogKey);
      // Cancel a read still in flight so it can't land afterwards with the
      // old catalog, then use the refreshed summary as is.
      await queryClient.cancelQueries({ queryKey: catalogKey });
      queryClient.setQueryData(catalogKey, summary);
      // Presets resolve against the catalog, so other results only go stale
      // when it actually changed.
      if (previous?.version === summary.version) return;
      await queryClient.invalidateQueries({
        queryKey: perfQueryKeys.all,
        predicate: (query) => query.queryKey[1] !== catalogKey[1],
      });
    })
    .catch((error) =>
      logger.withError(error).warn("Performance catalog refresh failed"),
    );
  return catalogRefresh;
};

/** The catalog with counts computed against the user's gameinfo.gi. */
export const usePerfCatalog = () => {
  const queryClient = useQueryClient();
  useEffect(() => {
    refreshPerfCatalogOnce(queryClient);
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
