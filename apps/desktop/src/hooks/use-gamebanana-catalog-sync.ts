import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import {
  clearGameBananaCatalog,
  inspectGameBananaCatalog,
  synchronizeGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import { COLLECTIONS_QUERY_KEY } from "@/lib/collections/queries";
import logger from "@/lib/logger";
import {
  REFETCH_INTERVAL_CATALOG_SYNC,
  REFETCH_JITTER_CATALOG_SYNC,
} from "@/lib/query-constants";

export const CATALOG_SYNC_KEY = ["gamebanana-catalog-sync"];
const CATALOG_WIPE_KEY = ["gamebanana-catalog-wipe"];

const dropCachedCatalog = async (queryClient: QueryClient) => {
  await queryClient.cancelQueries({ queryKey: ["mod"] });
  queryClient.removeQueries({ queryKey: ["mod"] });
  queryClient.removeQueries({ queryKey: ["mod-downloads"] });
  await queryClient.resetQueries({ queryKey: ["mods"] });
};

export const useCatalogSyncMutation = (forceRefresh = false) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: CATALOG_SYNC_KEY,
    mutationFn: async (clear: boolean) => {
      if (clear) {
        await clearGameBananaCatalog();
        await dropCachedCatalog(queryClient);
      }
      return synchronizeGameBananaCatalog(forceRefresh);
    },
    meta: { skipGlobalErrorHandler: true },
    onSettled: (status) => {
      void queryClient.invalidateQueries({
        queryKey: ["gamebanana-catalog-status"],
      });
      if (status?.outcome === "throttled") return;
      void queryClient.invalidateQueries({ queryKey: ["mods"] });
      void queryClient.invalidateQueries({ queryKey: ["mod"] });
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY });
    },
    onError: (error) => {
      logger.withError(error).warn("GameBanana catalog refresh failed");
    },
  });
};

export const useCatalogSyncState = () => {
  const states = useMutationState({
    filters: { mutationKey: CATALOG_SYNC_KEY },
    select: (mutation) => mutation.state.status,
  });
  const status = states.at(-1);
  const syncing = status === "pending";
  const catalog = useQuery({
    queryKey: ["gamebanana-catalog-status"],
    queryFn: inspectGameBananaCatalog,
    refetchInterval: syncing ? 2000 : false,
  });
  return { status, syncing, catalog };
};

export const useGameBananaCatalogSync = (): void => {
  const queryClient = useQueryClient();
  const synchronizeCatalog = useCatalogSyncMutation();
  useEffect(() => {
    synchronizeCatalog.mutate(false);
    // Per-session jitter keeps clients that launched together (e.g. after an
    // app update) from hitting GameBanana in lockstep.
    const period =
      REFETCH_INTERVAL_CATALOG_SYNC +
      (Math.random() * 2 - 1) * REFETCH_JITTER_CATALOG_SYNC;
    const timer = window.setInterval(() => {
      // A new sync cancels the running one, which would restart a long full crawl.
      if (queryClient.isMutating({ mutationKey: CATALOG_SYNC_KEY }) > 0) return;
      synchronizeCatalog.mutate(false);
    }, period);
    return () => window.clearInterval(timer);
  }, [queryClient, synchronizeCatalog.mutate]);
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
