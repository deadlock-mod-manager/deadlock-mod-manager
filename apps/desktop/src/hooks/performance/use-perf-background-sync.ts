import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useFeatureEnabled } from "@/hooks/use-feature-enabled";
import logger from "@/lib/logger";
import { syncPerfConfig } from "@/lib/performance/api";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { usePersistedStore } from "@/lib/store";
import { refreshPerfCatalogInBackground } from "./use-perf-queries";

const MIN_SYNC_INTERVAL_MS = 10_000;

export const usePerfBackgroundSync = () => {
  const queryClient = useQueryClient();
  const gamePath = usePersistedStore((state) => state.gamePath);
  const enabled = useFeatureEnabled("performance");

  useEffect(() => {
    if (!enabled || !gamePath) return;
    let lastSync = 0;
    const sync = async () => {
      if (Date.now() - lastSync < MIN_SYNC_INTERVAL_MS) return;
      lastSync = Date.now();
      try {
        if (await syncPerfConfig()) {
          logger.info("Re-applied the performance config to gameinfo.gi");
        }
      } catch (error) {
        logger.withError(error).warn("Performance config sync failed");
      }
    };

    const onFocus = () =>
      refreshPerfCatalogInBackground(queryClient)
        .then(sync)
        .then(() =>
          queryClient.invalidateQueries({ queryKey: perfQueryKeys.status() }),
        );

    onFocus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, gamePath, queryClient]);
};
