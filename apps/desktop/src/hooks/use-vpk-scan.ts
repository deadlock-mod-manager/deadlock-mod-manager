import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getProfileVpkSnapshot } from "@/lib/tauri-commands";
import { findUnmatchedVpks, isVpkOwned } from "@/lib/vpk-scan";
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

  // Unknown until the snapshot loads: only the manifest knows each mod's shard.
  const isLibraryVpk = useCallback(
    (locator: string): boolean | undefined =>
      snapshot ? isVpkOwned(locator, snapshot.manifest, localMods) : undefined,
    [snapshot, localMods],
  );

  return {
    isLibraryVpk,
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
