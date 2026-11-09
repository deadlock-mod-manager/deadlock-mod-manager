import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import logger from "@/lib/logger";
import { type BulkActionRecap, runBulkModAction } from "@/lib/mods/bulk-action";
import { setBulkActionRecap } from "@/lib/mods/bulk-action-recaps";
import { isInstalledModWithVpks } from "@/lib/mods/installed-helpers";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import { invokeGuarded } from "@/lib/game-guard";

export const useDisableAllMods = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const mods = usePersistedStore((state) => state.localMods);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const setModEnabledInCurrentProfile = usePersistedStore(
    (state) => state.setModEnabledInCurrentProfile,
  );

  const mutation = useMutation({
    mutationKey: ["library-bulk"],
    onMutate: () => setBulkActionRecap("disable", null),
    mutationFn: async (
      selectedIds?: ReadonlySet<string>,
    ): Promise<BulkActionRecap | null> => {
      const profileId = usePersistedStore.getState().activeProfileId;
      const enabledMods = mods.filter(
        (mod) =>
          isInstalledModWithVpks(mod) &&
          (!selectedIds || selectedIds.has(mod.remoteId)),
      );
      if (enabledMods.length === 0) return null;
      const shouldDisable = await confirm({
        title: t(
          selectedIds
            ? "myMods.selection.disableTitle"
            : "myMods.disableAllConfirmTitle",
          { count: enabledMods.length },
        ),
        body: t(
          selectedIds
            ? "myMods.selection.disableBody"
            : "myMods.disableAllConfirmBody",
          {
            count: enabledMods.length,
          },
        ),
        actionButton: t(
          selectedIds
            ? "myMods.selection.disable"
            : "myMods.disableAllConfirmAction",
        ),
        cancelButton: t("myMods.disableAllConfirmCancel"),
        tone: "destructive",
      });

      if (!shouldDisable) return null;

      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      return runBulkModAction({
        action: "disable",
        targets: enabledMods,
        isCurrent: () =>
          usePersistedStore.getState().activeProfileId === profileId,
        apply: async (mod) => {
          await invokeGuarded("uninstall_mod", {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
            profileFolder,
          });
          setModStatus(mod.remoteId, ModStatus.Downloaded);
          setModEnabledInCurrentProfile(mod.remoteId, false);
        },
      });
    },
    onSuccess: (result, selectedIds) => {
      if (!result) return;
      if (result.stoppedBy) {
        logger
          .withMetadata({
            stoppedBy: result.stoppedBy,
            failed: result.failed?.mod.remoteId,
            completed: result.completed.length,
            notAttempted: result.notAttempted.length,
          })
          .warn("Bulk disable stopped early");
        setBulkActionRecap("disable", result);
        return;
      }
      toast.success(
        t(
          selectedIds
            ? "myMods.selection.disabled"
            : "myMods.disableAllSuccess",
          { count: result.completed.length },
        ),
      );
    },
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("mods.disableError"));
    },
  });

  return {
    disableAll: mutation.mutate,
    isPending: mutation.isPending,
  };
};
