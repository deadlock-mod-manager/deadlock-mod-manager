import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { downloadManager } from "@/lib/download/manager";
import { getErrorMessage } from "@/lib/errors";
import { invokeGuarded } from "@/lib/game-guard";
import logger from "@/lib/logger";
import { clearProfileMods } from "@/lib/mods/recovery";
import { usePersistedStore } from "@/lib/store";
import { PROFILE_VPKS_QUERY_KEY } from "./use-vpk-scan";

export const useModRecovery = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const libraryBusy = useIsMutating({ mutationKey: ["library-bulk"] }) > 0;
  const clear = useMutation({
    mutationKey: ["library-bulk"],
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async () => {
      const state = usePersistedStore.getState();
      const profile = state.getActiveProfile();
      if (!profile)
        throw new RuntimeError(t("settings.recoveryProfileMissing"));
      const mods = [
        ...new Map(
          [...profile.mods, ...state.localMods].map((mod) => [
            mod.remoteId,
            mod,
          ]),
        ).values(),
      ];
      if (
        !(await confirm({
          title: t("settings.confirmClearAllMods"),
          body: t("settings.confirmClearAllModsBody", {
            count: mods.length,
            profile: profile.name,
          }),
          actionButton: t("settings.confirmClearAllModsAction"),
          cancelButton: t("common.cancel"),
        }))
      )
        return null;
      if (usePersistedStore.getState().activeProfileId !== profile.id)
        throw new RuntimeError(t("settings.recoveryProfileChanged"));
      return clearProfileMods({
        profile,
        mods,
        discardDownload: (remoteId) =>
          downloadManager.discardDownload(remoteId),
        purgeMod: (args) => invokeGuarded<void>("purge_mod", args),
        removeMod: (remoteId, profileId) =>
          usePersistedStore.getState().removeMod(remoteId, profileId),
        bumpProfileSyncRevision: (profileId) =>
          usePersistedStore.getState().bumpProfileSyncRevision(profileId),
      });
    },
    onSuccess: (report) => {
      if (!report) return;
      if (report.failures.length > 0) {
        logger.withMetadata({ report }).warn("Some mods could not be cleared");
        toast.error(
          t("settings.clearModsPartial", {
            removed: report.removed,
            failed: report.failures.length,
          }),
        );
      } else toast.success(t("settings.allModsCleared"));
    },
    onError: (error) => {
      logger.withError(error).error("Failed to clear mods");
      toast.error(t("settings.failedToClearMods"), {
        description: getErrorMessage(error),
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: PROFILE_VPKS_QUERY_KEY }),
  });
  const reset = useMutation({
    mutationKey: ["library-bulk"],
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async () => {
      const state = usePersistedStore.getState();
      const profileId = state.activeProfileId;
      if (
        !(await confirm({
          title: t("settings.confirmClearModsState"),
          body: t("settings.confirmClearModsStateBody"),
          actionButton: t("settings.confirmClearModsStateAction"),
          cancelButton: t("common.cancel"),
        }))
      )
        return false;
      if (usePersistedStore.getState().activeProfileId !== profileId)
        throw new RuntimeError(t("settings.recoveryProfileChanged"));
      if (
        usePersistedStore
          .getState()
          .localMods.some((mod) => downloadManager.isQueued(mod.remoteId))
      )
        throw new RuntimeError(t("settings.recoveryDownloadsActive"));
      usePersistedStore.getState().clearMods();
      return true;
    },
    onSuccess: (completed) => {
      if (completed) toast.success(t("settings.modsStateCleared"));
    },
    onError: (error) => {
      logger.withError(error).error("Failed to reset mods state");
      toast.error(t("settings.failedToResetModsState"), {
        description: getErrorMessage(error),
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: PROFILE_VPKS_QUERY_KEY }),
  });
  return { clear, reset, isPending: libraryBusy };
};
