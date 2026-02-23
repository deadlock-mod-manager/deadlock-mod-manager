import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { checkModUpdates } from "@/lib/api";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

type CheckUpdatesData = Awaited<ReturnType<typeof checkModUpdates>>;

export const useCheckUpdates = (options?: {
  onSuccess?: (data: CheckUpdatesData) => void;
  onError?: (error: Error) => void;
}) => {
  const localMods = usePersistedStore((state) => state.localMods);

  const installedMods = localMods.filter(
    (mod) =>
      mod.status === ModStatus.Installed &&
      mod.remoteId &&
      !mod.remoteId.startsWith("local://"),
  );

  const modsToCheck = installedMods.map((mod) => ({
    remoteId: mod.remoteId,
    installedAt:
      mod.downloadedAt ??
      mod.selectedDownload?.createdAt ??
      mod.createdAt ??
      new Date(0),
  }));

  const query = useQuery({
    queryKey: ["check-mod-updates", modsToCheck],
    queryFn: () => checkModUpdates(modsToCheck),
    enabled: modsToCheck.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const refetch = useCallback(async () => {
    const result = await query.refetch();
    if (result.isError && result.error && options?.onError) {
      options.onError(result.error);
    } else if (!result.isError && result.data && options?.onSuccess) {
      options.onSuccess(result.data);
    }
    return result;
  }, [query.refetch, options?.onSuccess, options?.onError]);

  return {
    updatableMods: query.data?.updates ?? [],
    updatableCount: query.data?.updates.length ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch,
  };
};
