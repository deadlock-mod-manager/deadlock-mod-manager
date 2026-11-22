import { queryOptions, useQuery } from "@tanstack/react-query";
import { getModDownloads } from "@/lib/api-client";
import { usePersistedStore } from "@/lib/store";
import { findLocalMod } from "@/lib/store/selectors";
import type { ModDownloadItem } from "@/types/mods";

const EMPTY_DOWNLOADS: ModDownloadItem[] = [];

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
  remoteId?: string;
  isDownloadable?: boolean;
  enabled?: boolean;
}

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
