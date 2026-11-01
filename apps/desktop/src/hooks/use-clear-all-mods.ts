import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useAlert, useConfirm } from "@/components/providers/alert-dialog";
import { downloadManager } from "@/lib/download/manager";
import { invokeGuarded } from "@/lib/game-guard";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { ClearModsLeftover } from "@/types/generated/ClearModsLeftover";
import type { ClearModsReport } from "@/types/generated/ClearModsReport";
import { isTauriError } from "@/types/tauri";
import { PROFILE_VPKS_QUERY_KEY } from "./use-vpk-scan";

const describeLeftover = (
  t: TFunction,
  { path, kind, reason }: ClearModsLeftover,
): string => {
  if (kind === "stillExtracting")
    return `${path}: ${t("settings.clearAllModsStillExtracting")}`;
  return reason ? `${path}: ${reason}` : path;
};

/**
 * Settings → Tools → Clear All Mods. The backend stops the profile's downloads
 * and empties its addons folders and manifest; the library follows once that
 * has happened.
 */
export const useClearAllMods = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const alert = useAlert();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: ["library-bulk"],
    mutationFn: async (): Promise<ClearModsReport | null> => {
      const confirmed = await confirm({
        title: t("settings.confirmClearAllMods"),
        body: t("settings.confirmClearAllModsBody"),
        tone: "destructive",
        actionButton: t("settings.confirmClearAllModsAction"),
        cancelButton: t("common.cancel"),
      });
      if (!confirmed) return null;

      const state = usePersistedStore.getState();
      const profileId = state.activeProfileId;
      const profile = state.profiles[profileId];
      const modIds = (profile?.mods ?? state.localMods).map(
        (mod) => mod.remoteId,
      );
      // Their downloaded files stay; that profile still needs them.
      const preserveIds = Object.values(state.profiles)
        .filter((other) => other.id !== profileId)
        .flatMap((other) => other.mods.map((mod) => mod.remoteId));

      // A reconciliation already running must not restore what this removes.
      state.bumpProfileSyncRevision(profileId);
      // The backend cancels them too; this keeps their callbacks quiet.
      for (const modId of modIds) await downloadManager.discardDownload(modId);

      const report = await invokeGuarded<ClearModsReport>("clear_mods", {
        profileFolder: profile?.folderName ?? null,
        modIds,
        preserveIds,
      });

      // A mod added while the clear ran is new work and stays.
      const cleared = new Set(modIds);
      const current = usePersistedStore.getState();
      const added = (current.profiles[profileId]?.mods ?? [])
        .map((mod) => mod.remoteId)
        .filter((remoteId) => !cleared.has(remoteId));
      current.nukeModsState(added, profileId);
      queryClient.invalidateQueries({ queryKey: PROFILE_VPKS_QUERY_KEY });
      return report;
    },
    onSuccess: async (report) => {
      if (!report) return;
      if (report.leftovers.length === 0) {
        toast.success(t("settings.allModsCleared"));
        return;
      }
      logger
        .withMetadata({ leftovers: report.leftovers })
        .warn("Clear All Mods left files behind");
      await alert({
        title: t("settings.clearAllModsLeftovers"),
        body: [
          t("settings.clearAllModsLeftoversBody"),
          "",
          ...report.leftovers.map((leftover) => describeLeftover(t, leftover)),
        ].join("\n"),
      });
    },
    onError: (error) => {
      logger.withMetadata({ error }).error("Failed to clear all mods");
      toast.error(t("settings.failedToClearMods"), {
        description: isTauriError(error)
          ? error.kind === "modOperationBusy"
            ? t("settings.clearAllModsBusy")
            : error.message
          : undefined,
      });
    },
  });

  return {
    clearAllMods: () => mutation.mutate(),
    isPending: mutation.isPending,
  };
};
