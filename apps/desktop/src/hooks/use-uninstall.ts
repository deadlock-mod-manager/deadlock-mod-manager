import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";
import { useVpkScan } from "./use-vpk-scan";

const useUninstall = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const removeMod = usePersistedStore((state) => state.removeMod);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const setModEnabledInCurrentProfile = usePersistedStore(
    (state) => state.setModEnabledInCurrentProfile,
  );
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const { refetch: refetchVpkScan } = useVpkScan();

  const uninstall = async (mod: LocalMod, remove: boolean) => {
    try {
      if (remove) {
        const shouldUninstall = !!(await confirm({
          title: t("mods.deleteConfirmTitle"),
          body: t("mods.deleteConfirmBody"),
          tone: "destructive",
          actionButton: t("mods.deleteConfirmAction"),
          cancelButton: t("mods.deleteConfirmCancel"),
        }));
        if (!shouldUninstall) {
          return;
        }
      }

      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      if (mod.status === ModStatus.Installed) {
        logger
          .withMetadata({
            modId: mod.remoteId,
            vpks: mod.installedVpks,
            profileFolder,
          })
          .info("Uninstalling mod");
        if (remove) {
          await invoke("purge_mod", {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
            profileFolder,
          });
        } else {
          await invoke("uninstall_mod", {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
            profileFolder,
          });
          setModStatus(mod.remoteId, ModStatus.Downloaded);
          setModEnabledInCurrentProfile(mod.remoteId, false);
        }
      } else if (remove) {
        logger
          .withMetadata({ modId: mod.remoteId, profileFolder })
          .info("Purging disabled mod");
        await invoke("purge_mod", {
          modId: mod.remoteId,
          vpks: [],
          profileFolder,
        });
      }

      if (remove) {
        removeMod(mod.remoteId);
        refetchVpkScan();
      }

      toast.success(
        remove ? t("mods.deleteSuccess") : t("mods.disableSuccess"),
      );
    } catch (error) {
      logger.errorOnly(error);
      toast.error(remove ? t("mods.deleteError") : t("mods.disableError"));
    }
  };

  return { uninstall };
};

export default useUninstall;
