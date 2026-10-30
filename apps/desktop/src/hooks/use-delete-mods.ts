import { toast } from "@deadlock-mods/ui/components/sonner";
import { TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { downloadManager } from "@/lib/download/manager";
import { invokeGuarded } from "@/lib/game-guard";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import { isTauriError } from "@/types/tauri";
import { PROFILE_VPKS_QUERY_KEY } from "./use-vpk-scan";

export const useDeleteMods = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mods = usePersistedStore((state) => state.localMods);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const removeMod = usePersistedStore((state) => state.removeMod);

  const mutation = useMutation({
    mutationKey: ["library-bulk"],
    mutationFn: async (selectedIds: ReadonlySet<string>) => {
      const profileId = usePersistedStore.getState().activeProfileId;
      const targets = mods.filter((mod) => selectedIds.has(mod.remoteId));
      if (targets.length === 0) return 0;
      const shouldDelete = await confirm({
        title: t("myMods.selection.deleteTitle", { count: targets.length }),
        body: t("myMods.selection.deleteBody", { count: targets.length }),
        tone: "destructive",
        icon: TrashIcon,
        actionButton: t("mods.deleteConfirmAction"),
        cancelButton: t("mods.deleteConfirmCancel"),
      });
      if (
        !shouldDelete ||
        usePersistedStore.getState().activeProfileId !== profileId
      )
        return 0;

      const profileFolder = getActiveProfile()?.folderName ?? null;
      let deleted = 0;
      try {
        for (const mod of targets) {
          if (usePersistedStore.getState().activeProfileId !== profileId) break;
          await downloadManager.discardDownload(mod.remoteId);
          await invokeGuarded("purge_mod", {
            modId: mod.remoteId,
            vpks:
              mod.status === ModStatus.Installed
                ? (mod.installedVpks ?? [])
                : [],
            profileFolder,
          });
          removeMod(mod.remoteId);
          deleted++;
        }
      } finally {
        if (deleted > 0)
          queryClient.invalidateQueries({ queryKey: PROFILE_VPKS_QUERY_KEY });
      }
      return deleted;
    },
    onSuccess: (deleted) => {
      if (deleted > 0)
        toast.success(t("myMods.selection.deleted", { count: deleted }));
    },
    onError: (error) => {
      logger.withMetadata({ error }).error("Failed to delete selected mods");
      toast.error(t("mods.deleteError"), {
        description:
          isTauriError(error) && error.kind === "vpkInUse"
            ? t("mods.deleteErrorVpkInUse")
            : undefined,
      });
    },
  });

  return {
    deleteMods: mutation.mutate,
    isPending: mutation.isPending,
  };
};
