import { useQuery } from "@tanstack/react-query";
import { checkModUpdates } from "@/lib/api";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

export const useCheckUpdates = () => {
  const localMods = usePersistedStore((state) => state.localMods);

  const installedMods = localMods.filter(
    (mod) =>
      mod.status === ModStatus.Installed &&
      mod.downloadedAt &&
      mod.remoteId &&
      !mod.remoteId.startsWith("local://"),
  );

  const modsToCheck = installedMods.map((mod) => ({
    remoteId: mod.remoteId,
    installedAt: mod.downloadedAt!,
  }));

  const query = useQuery({
    queryKey: ["check-mod-updates", modsToCheck],
    queryFn: () => checkModUpdates(modsToCheck),
    enabled: modsToCheck.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  return {
    updatableMods: query.data?.updates ?? [],
    updatableCount: query.data?.updates.length ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};
