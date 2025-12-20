import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";

const useUninstall = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const {
    removeMod,
    setModStatus,
    setModEnabledInCurrentProfile,
    getActiveProfile,
  } = usePersistedStore();

  const uninstall = async (mod: LocalMod, remove: boolean) => {
    try {
      let shouldUninstall = true;
      const isCustomMod = mod.remoteUrl?.startsWith("local://");

      // Show special warning for custom mods when disabling
      if (!remove && isCustomMod) {
        shouldUninstall = !!(await confirm({
          title: t("mods.customModDisableTitle", {
            defaultValue: "Disable Custom Mod?",
          }),
          body: t("mods.customModDisableBody", {
            defaultValue:
              "This is a custom mod that was manually added to your library. If you disable it, you won't be able to re-enable it automatically since it's not from our database. You would need to manually reinstall the original file or re-add it through the addon analysis feature.",
          }),
          actionButton: t("mods.customModDisableAction", {
            defaultValue: "Disable Anyway",
          }),
          cancelButton: t("mods.deleteConfirmCancel"),
        }));
      }
      // Only show confirmation dialog when removing (deleting) a mod
      else if (remove) {
        shouldUninstall = !!(await confirm({
          title: t("mods.deleteConfirmTitle"),
          body: t("mods.deleteConfirmBody"),
          actionButton: t("mods.deleteConfirmAction"),
          cancelButton: t("mods.deleteConfirmCancel"),
        }));
      }
      // No confirmation dialog for disabling regular mods

      if (!shouldUninstall) {
        return;
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
        }
        setModStatus(mod.remoteId, ModStatus.Downloaded);
        if (!remove) {
          setModEnabledInCurrentProfile(mod.remoteId, false);
        }
      }

      if (remove) {
        await removeMod(mod.remoteId);
      }
      toast.success(
        remove ? t("mods.deleteSuccess") : t("mods.disableSuccess"),
      );
    } catch (error) {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(remove ? t("mods.deleteError") : t("mods.disableError"));
    }
  };

  return { uninstall };
};

export default useUninstall;
