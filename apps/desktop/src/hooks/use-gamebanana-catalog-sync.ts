import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  clearGameBananaCatalog,
  synchronizeGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import logger from "@/lib/logger";

export const CATALOG_SYNC_KEY = ["gamebanana-catalog-sync"];

export const useCatalogSyncMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: CATALOG_SYNC_KEY,
    mutationFn: async (clear: boolean) => {
      if (clear) {
        await clearGameBananaCatalog();
        await queryClient.cancelQueries({ queryKey: ["mod"] });
        queryClient.removeQueries({ queryKey: ["mod"] });
        queryClient.removeQueries({ queryKey: ["mod-downloads"] });
        await queryClient.resetQueries({ queryKey: ["mods"] });
      }
      return synchronizeGameBananaCatalog();
    },
    meta: { skipGlobalErrorHandler: true },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["mods"] });
      void queryClient.invalidateQueries({ queryKey: ["mod"] });
    },
    onError: (error) => {
      logger.withError(error).warn("GameBanana catalog refresh failed");
    },
  });
};

export const useGameBananaCatalogSync = (): void => {
  const synchronizeCatalog = useCatalogSyncMutation();
  useEffect(() => {
    synchronizeCatalog.mutate(false);
  }, [synchronizeCatalog.mutate]);
};
