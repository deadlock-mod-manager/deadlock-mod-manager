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
          try {
            await invoke("purge_mod", {
              modId: mod.remoteId,
              vpks: mod.installedVpks ?? [],
              profileFolder,
            });
          } catch (purgeError) {
            logger
              .withMetadata({ modId: mod.remoteId })
              .withError(
                purgeError instanceof Error
                  ? purgeError
                  : new Error(String(purgeError)),
              )
              .warn("purge_mod failed for installed mod, removing from store anyway");
          }
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
        try {
          await invoke("purge_mod", {
            modId: mod.remoteId,
            vpks: [],
            profileFolder,
          });
        } catch (purgeError) {
          // Log but don't rethrow — mod is not installed so there are no game
          // files to worry about. We still want to remove it from the store though.
          logger
            .withMetadata({ modId: mod.remoteId })
            .withError(
              purgeError instanceof Error
                ? purgeError
                : new Error(String(purgeError)),
            )
            .warn("purge_mod failed for non-installed mod, removing from store anyway");
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
