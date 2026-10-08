import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import logger from "@/lib/logger";
import { syncPerfConfig } from "@/lib/performance/api";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { usePersistedStore } from "@/lib/store";
import { refreshPerfCatalogOnce } from "./use-perf-queries";

/** Window focus fires in bursts (alt-tab, dialogs); one check is enough. */
const MIN_SYNC_INTERVAL_MS = 10_000;

/**
 * Puts the chosen performance config back into gameinfo.gi when a game update
 * or reset replaced it: at app start (after the catalog refresh, so new
 * statuses apply) and when the window gets focus. Launches re-apply too; this
 * covers starting Deadlock from Steam after the mod manager has run.
 */
export const usePerfBackgroundSync = () => {
  const queryClient = useQueryClient();
  const gamePath = usePersistedStore((state) => state.gamePath);

  useEffect(() => {
    if (!gamePath) return;
    let lastSync = 0;
    const sync = async () => {
      if (Date.now() - lastSync < MIN_SYNC_INTERVAL_MS) return;
      lastSync = Date.now();
      try {
        if (await syncPerfConfig()) {
          logger.info("Re-applied the performance config to gameinfo.gi");
          await queryClient.invalidateQueries({
            queryKey: perfQueryKeys.status(),
          });
        }
      } catch (error) {
        logger.withError(error).warn("Performance config sync failed");
      }
    };

    refreshPerfCatalogOnce(queryClient).then(sync);
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [gamePath, queryClient]);
};
