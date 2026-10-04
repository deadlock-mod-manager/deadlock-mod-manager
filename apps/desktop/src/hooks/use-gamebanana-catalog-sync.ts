import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import {
  clearGameBananaCatalog,
  synchronizeGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import logger from "@/lib/logger";

export const CATALOG_SYNC_KEY = ["gamebanana-catalog-sync"];
const CATALOG_WIPE_KEY = ["gamebanana-catalog-wipe"];

const dropCachedCatalog = async (queryClient: QueryClient) => {
  await queryClient.cancelQueries({ queryKey: ["mod"] });
  queryClient.removeQueries({ queryKey: ["mod"] });
  queryClient.removeQueries({ queryKey: ["mod-downloads"] });
  await queryClient.resetQueries({ queryKey: ["mods"] });
};

export const useCatalogSyncMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: CATALOG_SYNC_KEY,
    mutationFn: async (clear: boolean) => {
      if (clear) {
        await clearGameBananaCatalog();
        await dropCachedCatalog(queryClient);
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

const useWipeCatalogMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: CATALOG_WIPE_KEY,
    mutationFn: async () => {
      await clearGameBananaCatalog();
      await dropCachedCatalog(queryClient);
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () => {
      toast.success(t("debug.catalogWiped"));
    },
    onError: (error) => {
      logger.withError(error).warn("GameBanana catalog wipe failed");
      toast.error(t("debug.wipeCatalogFailed"));
    },
  });
};

export const useWipeLocalCatalog = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const wipe = useWipeCatalogMutation();

  const requestWipe = async () => {
    if (
      !(await confirm({
        title: t("debug.confirmWipeCatalog"),
        actionButton: t("debug.confirmWipeCatalogAction"),
        cancelButton: t("common.cancel"),
        tone: "destructive",
      }))
    ) {
      return;
    }
    wipe.mutate();
  };

  return {
    requestWipe,
    pending: wipe.isPending,
  };
};
