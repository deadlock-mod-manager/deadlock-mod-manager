import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import logger from "@/lib/logger";
import { isInstalledModWithVpks } from "@/lib/mods/installed-helpers";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

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
    mutationFn: async () => {
      const enabledMods = mods.filter(isInstalledModWithVpks);
      const shouldDisable = await confirm({
        title: t("myMods.disableAllConfirmTitle"),
        body: t("myMods.disableAllConfirmBody", {
          count: enabledMods.length,
        }),
        actionButton: t("myMods.disableAllConfirmAction"),
        cancelButton: t("myMods.disableAllConfirmCancel"),
        tone: "destructive",
      });

      if (!shouldDisable) return;

      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      for (const mod of enabledMods) {
        await invoke("uninstall_mod", {
          modId: mod.remoteId,
          vpks: mod.installedVpks ?? [],
          profileFolder,
        });
        setModStatus(mod.remoteId, ModStatus.Downloaded);
        setModEnabledInCurrentProfile(mod.remoteId, false);
      }
    },
    onSuccess: () => {
      toast.success(t("myMods.disableAllSuccess"));
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
