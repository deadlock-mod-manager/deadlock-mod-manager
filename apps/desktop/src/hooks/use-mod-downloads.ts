import { useQuery } from "@tanstack/react-query";
import { getModDownloads } from "@/lib/api-client";
import { usePersistedStore } from "@/lib/store";
import type { ModDownloadItem } from "@/types/mods";

const EMPTY_DOWNLOADS: ModDownloadItem[] = [];

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
  const localDownloads = usePersistedStore((state) => {
    if (!remoteId) {
      return undefined;
    }
    const localMod = state.localMods.find((mod) => mod.remoteId === remoteId);
    return localMod?.downloads;
  });

  const query = useQuery({
    queryKey: ["mod-downloads", remoteId],
    queryFn: () => {
      if (!remoteId) {
        throw new Error("Mod remote ID is required");
      }
      return getModDownloads(remoteId);
    },
    enabled: enabled && !!remoteId && isDownloadable,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    placeholderData: () => {
      if (!localDownloads || localDownloads.length === 0) {
        return undefined;
      }
      return {
        downloads: localDownloads,
        count: localDownloads.length,
      };
    },
    meta: {
      skipGlobalErrorHandler: true,
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
