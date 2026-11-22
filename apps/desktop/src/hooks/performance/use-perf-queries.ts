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

const CATALOG_RECHECK_MS = 60 * 60 * 1000;

let catalogRefresh: Promise<CatalogSummary> | null = null;
let lastCatalogCheck = 0;

export const refreshPerfCatalogNow = (queryClient: QueryClient) => {
  if (catalogRefresh) return catalogRefresh;
  lastCatalogCheck = Date.now();
  catalogRefresh = refreshPerfCatalog()
    .then(async (summary) => {
      const catalogKey = perfQueryKeys.catalog();
      const previous = queryClient.getQueryData<CatalogSummary>(catalogKey);
      await queryClient.cancelQueries({ queryKey: catalogKey });
      queryClient.setQueryData(catalogKey, summary);
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

export const usePerfCatalog = (enabled = true) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (enabled) refreshPerfCatalogInBackground(queryClient);
  }, [enabled, queryClient]);

  return useQuery({
    queryKey: perfQueryKeys.catalog(),
    queryFn: getPerfCatalog,
    staleTime: STALE_TIME_API,
    enabled,
    meta: { skipGlobalErrorHandler: true },
  });
};

export const usePerfStatus = (enabled = true) =>
  useQuery({
    queryKey: perfQueryKeys.status(),
    queryFn: getPerfStatus,
    enabled,
    refetchOnWindowFocus: true,
    meta: { skipGlobalErrorHandler: true },
  });

const removedNames = (convars: ConvarMeta[]) =>
  new Set(
    convars
      .filter((convar) => convar.status === "removed")
      .map((convar) => convar.name),
  );

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

const keepUnchangedEntries = (resolved: ResolvedConfig) => resolved;

export const usePerfResolve = (request: PerfApplyRequest | null) =>
  useQuery({
    queryKey: perfQueryKeys.resolve(request),
    queryFn: request ? () => resolvePerfConfig(request) : skipToken,
    placeholderData: (previous) => previous,
    select: keepUnchangedEntries,
    meta: { skipGlobalErrorHandler: true },
  });
