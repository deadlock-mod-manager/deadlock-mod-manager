import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  didGameExit,
  gameinfoAutoResetPauseCount,
  isGameinfoAutoResetPaused,
} from "@/lib/gameinfo-auto-reset";
import logger from "@/lib/logger";
import { refreshGameinfoState } from "@/lib/gameinfo-reset";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import {
  gameinfoCleanupRevision,
  isGameRunning,
  removeModSearchPaths,
} from "@/lib/tauri-commands";

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

  const { data: gameRunning } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: isGameRunning,
    staleTime: STALE_TIME_POLL,
    enabled: !!gamePath && autoResetEnabled,
  });

  const { mutate: resetGameinfo } = useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async () => {
      const pauseCount = gameinfoAutoResetPauseCount();
      const revision = await gameinfoCleanupRevision();
      if (revision === null) return;
      if (
        isGameinfoAutoResetPaused() ||
        pauseCount !== gameinfoAutoResetPauseCount()
      )
        return;
      if (!(await removeModSearchPaths(revision))) return;
      await refreshGameinfoState(queryClient, setLastLaunchVanilla);
      logger.info("Removed DMM search paths after the game closed");
      toast.info(t("settings.dmmPathsRemovedOnExit"));
    },
    onError: (error) => {
      logger
        .withError(error)
        .error("Failed to remove DMM search paths after the game closed");
      toast.error(t("settings.dmmPathsRemovalFailed"));
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
