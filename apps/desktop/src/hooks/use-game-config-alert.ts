import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";
import { deriveGameConfigAlert } from "@/lib/game-update";
import { usePersistedStore } from "@/lib/store";
import {
  gameinfoHasModPaths,
  getInstalledBuildId,
  resyncProfileShards,
} from "@/lib/tauri-commands";

// Steam only changes the build while it updates, so a slow poll plus the
// window-focus refetch catches it. The gameinfo check is a single file read.
const BUILD_POLL_MS = 5 * 60_000;
const MOD_PATHS_POLL_MS = 15_000;
export const MOD_PATHS_KEY = ["gameinfo-mod-paths"];

/**
 * Watches for the two ways a Steam update breaks mods: a new build id in the
 * app manifest, and gameinfo.gi losing the search paths DMM wrote.
 */
export const useGameConfigAlert = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const gamePath = usePersistedStore((s) => s.gamePath);
  const knownBuildId = usePersistedStore((s) => s.knownGameBuildId);
  const setKnownBuildId = usePersistedStore((s) => s.setKnownGameBuildId);
  const lastLaunchVanilla = usePersistedStore((s) => s.lastLaunchVanilla);
  const setLastLaunchVanilla = usePersistedStore((s) => s.setLastLaunchVanilla);
  const enabledModsCount = usePersistedStore((s) => s.getEnabledModsCount());
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);

  const { data: buildId = null } = useQuery({
    queryKey: ["installed-build-id"],
    queryFn: getInstalledBuildId,
    enabled: !!gamePath,
    refetchInterval: BUILD_POLL_MS,
    meta: { skipGlobalErrorHandler: true },
  });

  const { data: hasModPaths } = useQuery({
    queryKey: MOD_PATHS_KEY,
    queryFn: gameinfoHasModPaths,
    enabled: !!gamePath,
    refetchInterval: MOD_PATHS_POLL_MS,
    meta: { skipGlobalErrorHandler: true },
  });

  // First run on this install: remember the build without announcing it.
  useEffect(() => {
    if (buildId != null && knownBuildId == null) setKnownBuildId(buildId);
  }, [buildId, knownBuildId, setKnownBuildId]);

  const alert = deriveGameConfigAlert({
    buildId,
    knownBuildId,
    hasModPaths,
    enabledModsCount,
    lastLaunchVanilla,
  });

  const acknowledgeUpdate = () => {
    if (buildId != null) setKnownBuildId(buildId);
  };

  const reapply = useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: () =>
      resyncProfileShards(getActiveProfile()?.folderName ?? null),
    onSuccess: async () => {
      acknowledgeUpdate();
      setLastLaunchVanilla(false);
      toast.success(t("gameConfig.reapplied"));
      await queryClient.invalidateQueries({ queryKey: MOD_PATHS_KEY });
    },
    onError: (error) =>
      toast.error(t("gameConfig.reapplyFailed"), {
        description: getErrorMessage(error),
      }),
  });

  return { alert, enabledModsCount, acknowledgeUpdate, reapply };
};
