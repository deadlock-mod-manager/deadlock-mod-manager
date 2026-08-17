import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getProfileInstalledVpks } from "@/lib/tauri-commands";
import { findUnmatchedVpks } from "@/lib/vpk-scan";
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
  } = useQuery({
    queryKey: ["profile-vpks", activeProfile?.folderName],
    queryFn: () => getProfileInstalledVpks(activeProfile?.folderName ?? null),
    enabled: !!activeProfile,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  const unmatchedVpks = useMemo(
    () => findUnmatchedVpks(vpkFiles ?? [], localMods),
    [vpkFiles, localMods],
  );

  return {
    unmatchedVpkCount: unmatchedVpks.length,
    unmatchedVpks,
    isLoading,
    isRefetching,
    error,
    hasUnmatchedVpks: unmatchedVpks.length > 0,
    refetch,
    activeProfileFolder: activeProfile?.folderName ?? null,
  };
};
