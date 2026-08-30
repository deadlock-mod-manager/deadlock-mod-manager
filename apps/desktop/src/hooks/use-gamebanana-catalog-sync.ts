import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { synchronizeGameBananaCatalog } from "@/lib/gamebanana-catalog";
import logger from "@/lib/logger";

export const useGameBananaCatalogSync = (): void => {
  const queryClient = useQueryClient();
  const synchronizeCatalog = useMutation({
    mutationFn: synchronizeGameBananaCatalog,
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mods"] });
    },
    onError: (error) => {
      logger.withError(error).warn("GameBanana catalog refresh failed");
    },
  });

  useEffect(() => {
    synchronizeCatalog.mutate();
  }, [synchronizeCatalog.mutate]);
};
