import { queryOptions, useQuery } from "@tanstack/react-query";
import { getModDownloads } from "@/lib/api-client";
import { usePersistedStore } from "@/lib/store";
import { findLocalMod } from "@/lib/store/selectors";
import type { ModDownloadItem } from "@/types/mods";

const EMPTY_DOWNLOADS: ModDownloadItem[] = [];

/**
 * File lists come from a live GameBanana request that shares the provider's
 * rate budget with mod details and catalog sync, so list views should fetch
 * them on demand with `queryClient.fetchQuery` instead of per rendered row.
 */
export const modDownloadsQueryOptions = (remoteId: string) =>
  queryOptions({
    queryKey: ["mod-downloads", remoteId],
    queryFn: () => getModDownloads(remoteId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    meta: {
      skipGlobalErrorHandler: true,
    },
  });

interface UseModDownloadsOptions {
  /**
   * The remote ID of the mod to fetch downloads for
   */
  remoteId?: string;
  /**
   * Whether the mod is downloadable - used to conditionally enable the query
   */
  isDownloadable?: boolean;
  /**
   * Whether to enable the query (overrides other conditions if false)
   */
  enabled?: boolean;
}

/**
 * Hook to fetch mod downloads with proper React Query caching
 *
 * @param options Configuration options for the hook
 * @returns Query result with downloads data and loading state
 */
export const useModDownloads = ({
  remoteId,
  isDownloadable = true,
  enabled = true,
}: UseModDownloadsOptions) => {
  const localDownloads = usePersistedStore(
    (state) => findLocalMod(state.localMods, remoteId)?.downloads,
  );

  const query = useQuery({
    ...modDownloadsQueryOptions(remoteId ?? ""),
    enabled: enabled && !!remoteId && isDownloadable,
    placeholderData: () => {
      if (!localDownloads || localDownloads.length === 0) {
        return undefined;
      }
      return {
        downloads: localDownloads,
        count: localDownloads.length,
      };
    },
    throwOnError: false,
  });

  const availableFiles: ModDownloadItem[] =
    query.data?.downloads ?? EMPTY_DOWNLOADS;

  return {
    ...query,
    availableFiles,
    downloadCount: query.data?.count ?? 0,
  };
};
