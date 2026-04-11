import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getAdditionalArgs } from "@/lib/utils";
import { ModStatus } from "@/types/mods";
import type { ErrorKind } from "@/types/tauri";

export const useLaunch = () => {
  const { t } = useTranslation();
  const {
    settings,
    getActiveProfile,
    localMods,
    isModEnabledInCurrentProfile,
    setModStatus,
    setModEnabledInCurrentProfile,
  } = usePersistedStore();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const launchVanillaNoArgs =
    settings?.["launch-vanilla-no-args"]?.enabled ?? false;

  const checkMapCommandInAutoexec = async () => {
    try {
      const mapName = await invoke<string | null>(
        "get_map_command_from_autoexec",
      );
      if (!mapName) return;

      const shouldRemove = await confirm({
        title: t("warnings.mapCommandInAutoexec.title"),
        body: t("warnings.mapCommandInAutoexec.body", { mapName }),
        actionButton: t("warnings.mapCommandInAutoexec.removeAndLaunch"),
        cancelButton: t("warnings.mapCommandInAutoexec.launchAnyway"),
      });

      if (shouldRemove) {
        await invoke("remove_map_command_from_autoexec");
      }
    } catch {
      // Autoexec check is best-effort; don't block game launch
    }
  };

  const disableInstalledMapMods = async () => {
    const installedMapMods = localMods.filter(
      (mod) =>
        mod.isMap &&
        mod.status === ModStatus.Installed &&
        isModEnabledInCurrentProfile(mod.remoteId),
    );

    if (installedMapMods.length === 0) return;

    const modNames = installedMapMods.map((mod) => mod.name).join(", ");

    const shouldDisable = await confirm({
      title: t("warnings.mapModsInstalled.title"),
      body: t("warnings.mapModsInstalled.body", { modNames }),
      actionButton: t("warnings.mapModsInstalled.disableAndLaunch"),
      cancelButton: t("warnings.mapModsInstalled.launchAnyway"),
    });

    if (shouldDisable) {
      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      for (const mapMod of installedMapMods) {
        await invoke("uninstall_mod", {
          modId: mapMod.remoteId,
          vpks: mapMod.installedVpks ?? [],
          profileFolder,
        });
        setModStatus(mapMod.remoteId, ModStatus.Downloaded);
        setModEnabledInCurrentProfile(mapMod.remoteId, false);
      }
    }
  };

  const launch = async (vanilla = false) => {
    try {
      await checkMapCommandInAutoexec();
      await disableInstalledMapMods();

      const activeProfile = getActiveProfile();
      const profileFolder = vanilla
        ? null
        : (activeProfile?.folderName ?? null);

      await invoke("start_game", {
        vanilla,
        additionalArgs:
          vanilla && launchVanillaNoArgs
            ? ""
            : await getAdditionalArgs(Object.values(settings)),
        profileFolder,
      });

      await queryClient.invalidateQueries({
        queryKey: ["is-game-running"],
      });
    } catch (error) {
      console.error(error);
      logger.errorOnly(error);
      toast.error((error as ErrorKind).message);
    }
  };

  return { launch };
};
