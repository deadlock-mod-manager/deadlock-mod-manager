import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MOD_PATHS_KEY } from "@/hooks/use-game-config-alert";
import {
  didGameExit,
  gameinfoAutoResetPauseCount,
  isGameinfoAutoResetPaused,
} from "@/lib/gameinfo-auto-reset";
import logger from "@/lib/logger";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import {
  gameinfoHasModPaths,
  isGameRunning,
  resetToVanilla,
} from "@/lib/tauri-commands";

/**
 * Puts gameinfo.gi back to vanilla when Deadlock closes, so a later launch
 * straight from Steam starts without mods. Opt-in through settings.
 */
export const useGameinfoAutoReset = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const gamePath = usePersistedStore((state) => state.gamePath);
  const autoResetEnabled = usePersistedStore(
    (state) => state.autoResetGameinfoOnExit,
  );
  const setLastLaunchVanilla = usePersistedStore(
    (state) => state.setLastLaunchVanilla,
  );
  const previousRunning = useRef<boolean | undefined>(undefined);
  const lastPauseCount = useRef(gameinfoAutoResetPauseCount());

  // useHeroDetection already polls this key every 5s; a second interval here
  // would drift out of phase and double the process scans.
  const { data: gameRunning } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: isGameRunning,
    staleTime: STALE_TIME_POLL,
    enabled: !!gamePath && autoResetEnabled,
  });

  const { mutate: resetGameinfo } = useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async () => {
      if (!(await gameinfoHasModPaths())) return;
      await resetToVanilla();
      // Same as a vanilla launch: the missing mod paths are on purpose, so the
      // "mods detached" banner stays quiet until the next modded launch.
      setLastLaunchVanilla(true);
      logger.info("Reset gameinfo.gi to vanilla after the game closed");
      toast.info(t("settings.autoResetGameinfoSuccess"));
      queryClient.invalidateQueries({ queryKey: MOD_PATHS_KEY });
      queryClient.invalidateQueries({ queryKey: ["gameinfo-status"] });
    },
    onError: (error) => {
      logger
        .withError(error)
        .error("Failed to reset gameinfo.gi after the game closed");
      toast.error(t("settings.autoResetGameinfoFailed"));
    },
  });

  useEffect(() => {
    const previous = previousRunning.current;
    previousRunning.current = gameRunning;
    const pauses = gameinfoAutoResetPauseCount();
    const pausedSinceLastPoll = pauses !== lastPauseCount.current;
    lastPauseCount.current = pauses;
    if (
      !autoResetEnabled ||
      pausedSinceLastPoll ||
      isGameinfoAutoResetPaused()
    ) {
      return;
    }
    if (didGameExit(previous, gameRunning)) resetGameinfo();
  }, [autoResetEnabled, gameRunning, resetGameinfo]);
};
