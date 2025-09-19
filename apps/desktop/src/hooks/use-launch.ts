import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getAdditionalArgs } from "@/lib/utils";
import type { ErrorKind } from "@/types/tauri";

export const useLaunch = () => {
  const { settings } = usePersistedStore();
  const launchVanillaNoArgs =
    settings?.["launch-vanilla-no-args"]?.enabled ?? false;

  /**
   * @param vanilla - Whether to launch the game in vanilla mode (no mods)
   */
  const launch = async (vanilla = false) => {
    try {
      await invoke("start_game", {
        vanilla,
        additionalArgs:
          vanilla && launchVanillaNoArgs
            ? ""
            : getAdditionalArgs(Object.values(settings)),
      });
    } catch (error) {
      logger.error(error);
      toast.error((error as ErrorKind).message);
    }
  };

  return { launch };
};
