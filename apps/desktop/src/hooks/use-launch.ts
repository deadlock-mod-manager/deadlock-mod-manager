import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getAdditionalArgs } from "@/lib/utils";
import type { ErrorKind } from "@/types/tauri";

export const useLaunch = () => {
  const { settings, getActiveProfile } = usePersistedStore();
  const launchVanillaNoArgs =
    settings?.["launch-vanilla-no-args"]?.enabled ?? false;

  /**
   * @param vanilla - Whether to launch the game in vanilla mode (no mods)
   */
  const launch = async (vanilla = false) => {
    try {
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
    } catch (error) {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error((error as ErrorKind).message);
    }
  };

  return { launch };
};
