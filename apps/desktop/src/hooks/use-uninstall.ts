import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";
import { isTauriError } from "@/types/tauri";
import { PROFILE_VPKS_QUERY_KEY } from "./use-vpk-scan";

const useUninstall = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const removeMod = usePersistedStore((state) => state.removeMod);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const setModEnabledInCurrentProfile = usePersistedStore(
    (state) => state.setModEnabledInCurrentProfile,
  );
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  // Don't call useVpkScan here: this hook mounts in every mod card, and each
  // subscription would scan the addons folder on mount.
  const queryClient = useQueryClient();

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
        queryClient.invalidateQueries({ queryKey: PROFILE_VPKS_QUERY_KEY });
      }

      toast.success(
        remove ? t("mods.deleteSuccess") : t("mods.disableSuccess"),
      );
    } catch (error) {
      // Tauri rejects with a plain {kind, message} object, which `errorOnly`
      // renders as an empty line.
      logger
        .withMetadata({ modId: mod.remoteId, remove, error })
        .error("Failed to uninstall mod");

      if (isTauriError(error) && error.kind === "vpkInUse") {
        toast.error(remove ? t("mods.deleteError") : t("mods.disableError"), {
          description: t("mods.deleteErrorVpkInUse"),
        });
        return;
      }

      toast.error(remove ? t("mods.deleteError") : t("mods.disableError"));
    }
  };

  return { uninstall };
};

export default useUninstall;
