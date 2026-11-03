import { toast } from "@deadlock-mods/ui/components/sonner";
import { TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { downloadManager } from "@/lib/download/manager";
import { invokeGuarded } from "@/lib/game-guard";
import logger from "@/lib/logger";
import { type BulkActionRecap, runBulkModAction } from "@/lib/mods/bulk-action";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import { PROFILE_VPKS_QUERY_KEY } from "./use-vpk-scan";

export const useDeleteMods = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mods = usePersistedStore((state) => state.localMods);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const removeMod = usePersistedStore((state) => state.removeMod);
  const [recap, setRecap] = useState<BulkActionRecap | null>(null);

  const mutation = useMutation({
    mutationKey: ["library-bulk"],
    onMutate: () => setRecap(null),
    mutationFn: async (
      selectedIds: ReadonlySet<string>,
    ): Promise<BulkActionRecap | null> => {
      const profileId = usePersistedStore.getState().activeProfileId;
      const targets = mods.filter((mod) => selectedIds.has(mod.remoteId));
      if (targets.length === 0) return null;
      const shouldDelete = await confirm({
        title: t("myMods.selection.deleteTitle", { count: targets.length }),
        body: t("myMods.selection.deleteBody", { count: targets.length }),
        tone: "destructive",
        icon: TrashIcon,
        actionButton: t("mods.deleteConfirmAction"),
        cancelButton: t("mods.deleteConfirmCancel"),
      });
      if (!shouldDelete) return null;

      const profileFolder = getActiveProfile()?.folderName ?? null;
      const result = await runBulkModAction({
        action: "delete",
        targets,
        isCurrent: () =>
          usePersistedStore.getState().activeProfileId === profileId,
        apply: async (mod) => {
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
        },
        hintFor: (error) =>
          error.kind === "vpkInUse" ? t("mods.deleteErrorVpkInUse") : undefined,
      });
      if (result.completed.length > 0)
        queryClient.invalidateQueries({ queryKey: PROFILE_VPKS_QUERY_KEY });
      return result;
    },
    onSuccess: (result) => {
      if (!result) return;
      if (result.stoppedBy) {
        logger
          .withMetadata({
            stoppedBy: result.stoppedBy,
            failed: result.failed?.mod.remoteId,
            error: result.failed?.message,
            completed: result.completed.length,
            notAttempted: result.notAttempted.length,
          })
          .warn("Bulk delete stopped early");
        setRecap(result);
        return;
      }
      toast.success(
        t("myMods.selection.deleted", { count: result.completed.length }),
      );
    },
    onError: (error) => {
      logger.withMetadata({ error }).error("Failed to delete selected mods");
      toast.error(t("mods.deleteError"));
    },
  });

  return {
    deleteMods: mutation.mutate,
    isPending: mutation.isPending,
    recap,
    closeRecap: () => setRecap(null),
  };
};
