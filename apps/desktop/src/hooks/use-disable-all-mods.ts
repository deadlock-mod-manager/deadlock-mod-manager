import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import logger from "@/lib/logger";
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
    mutationFn: async (selectedIds?: ReadonlySet<string>) => {
      const profileId = usePersistedStore.getState().activeProfileId;
      const enabledMods = mods.filter(
        (mod) =>
          isInstalledModWithVpks(mod) &&
          (!selectedIds || selectedIds.has(mod.remoteId)),
      );
      if (enabledMods.length === 0) return false;
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

      if (
        !shouldDisable ||
        usePersistedStore.getState().activeProfileId !== profileId
      )
        return false;

      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      for (const mod of enabledMods) {
        if (usePersistedStore.getState().activeProfileId !== profileId)
          return false;
        await invokeGuarded("uninstall_mod", {
          modId: mod.remoteId,
          vpks: mod.installedVpks ?? [],
          profileFolder,
        });
        setModStatus(mod.remoteId, ModStatus.Downloaded);
        setModEnabledInCurrentProfile(mod.remoteId, false);
      }
      return enabledMods.length;
    },
    onSuccess: (disabled, selectedIds) => {
      if (!disabled) return;
      toast.success(
        t(
          selectedIds
            ? "myMods.selection.disabled"
            : "myMods.disableAllSuccess",
          { count: disabled },
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
