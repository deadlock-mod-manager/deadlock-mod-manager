import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { isGameRunning } from "@/lib/tauri-commands";

export const useCrosshairConfigReconciliation = () => {
  const queryClient = useQueryClient();
  const gamePath = usePersistedStore((state) => state.gamePath);
  const crosshairsEnabled = usePersistedStore(
    (state) => state.crosshairsEnabled,
  );

  const { data: gameRunning } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: isGameRunning,
    staleTime: STALE_TIME_POLL,
    refetchInterval: 5000,
    enabled: !!gamePath && !crosshairsEnabled,
  });

  useQuery({
    queryKey: ["disabled-crosshair-config-reconciliation", gamePath],
    queryFn: async () => {
      try {
        await invoke("disable_custom_crosshairs");
        await queryClient.invalidateQueries({
          queryKey: ["autoexec-config"],
        });
        logger.info("Reconciled disabled custom crosshair config");
        return true;
      } catch (error) {
        logger
          .withError(error)
          .error("Failed to reconcile disabled custom crosshair config");
        throw error;
      }
    },
    enabled: !!gamePath && !crosshairsEnabled && gameRunning === false,
    staleTime: Infinity,
    retry: false,
    meta: {
      skipGlobalErrorHandler: true,
    },
  });
};
