import { useMemo } from "react";
import { useQuery } from "react-query";
import { getProfileInstalledVpks } from "@/lib/api";
import { usePersistedStore } from "@/lib/store";

export const useVpkScan = () => {
  const activeProfile = usePersistedStore((state) => {
    const { activeProfileId, profiles } = state;
    return profiles[activeProfileId];
  });
  const localMods = usePersistedStore((state) => state.localMods);

  const {
    data: vpkFiles,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery(
    ["profile-vpks", activeProfile?.folderName],
    () => getProfileInstalledVpks(activeProfile?.folderName ?? null),
    {
      enabled: !!activeProfile,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    },
  );

  const unmatchedVpkData = useMemo(() => {
    if (!vpkFiles || vpkFiles.length === 0) {
      return { count: 0, files: [] };
    }

    const matchedVpks = new Set<string>();

    for (const mod of localMods) {
      if (mod.installedVpks) {
        for (const installedVpk of mod.installedVpks) {
          const filename = installedVpk.split(/[\\/]/).pop() || installedVpk;
          matchedVpks.add(filename);
        }
      }

      for (const vpk of vpkFiles) {
        if (vpk.startsWith(`${mod.remoteId}_`)) {
          matchedVpks.add(vpk);
        }
      }
    }

    const unmatchedVpks = vpkFiles.filter((vpk) => !matchedVpks.has(vpk));

    return { count: unmatchedVpks.length, files: unmatchedVpks };
  }, [vpkFiles, localMods]);

  return {
    unmatchedVpkCount: unmatchedVpkData.count,
    unmatchedVpks: unmatchedVpkData.files,
    isLoading,
    isRefetching,
    error,
    hasUnmatchedVpks: unmatchedVpkData.count > 0,
    refetch,
  };
};
