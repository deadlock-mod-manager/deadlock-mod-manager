import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getProfileVpkSnapshot } from "@/lib/tauri-commands";
import { findUnmatchedVpks } from "@/lib/vpk-scan";
import { usePersistedStore } from "@/lib/store";

export const PROFILE_VPKS_QUERY_KEY = ["profile-vpks"] as const;

export const useVpkScan = () => {
  const activeProfile = usePersistedStore((state) => {
    const { activeProfileId, profiles } = state;
    return profiles[activeProfileId];
  });
  const localMods = usePersistedStore((state) => state.localMods);

  const {
    data: snapshot,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery({
    queryKey: [...PROFILE_VPKS_QUERY_KEY, activeProfile?.folderName],
    queryFn: () => getProfileVpkSnapshot(activeProfile?.folderName ?? null),
    enabled: !!activeProfile,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  const unmatchedVpks = useMemo(
    () =>
      snapshot
        ? findUnmatchedVpks(snapshot.files, snapshot.manifest, localMods)
        : [],
    [snapshot, localMods],
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
