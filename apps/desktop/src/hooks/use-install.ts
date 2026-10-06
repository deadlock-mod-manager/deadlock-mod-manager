import { useCallback } from "react";
import { trackInstallOptions } from "@/lib/analytics";
import type { InstallAnalyticsOptions } from "@/lib/analytics/install";
import { getErrorMessage } from "@/lib/errors";
import { isTauriError } from "@/types/tauri";
import { usePersistedStore } from "@/lib/store";
import { type InstallableMod, type LocalMod, ModStatus } from "@/types/mods";
import { invokeGuarded } from "@/lib/game-guard";

export type InstallOptions = InstallAnalyticsOptions;

export type InstallFunction = (
  mod: LocalMod,
  options: InstallOptions,
) => Promise<InstallableMod | null>;

const useInstall = () => {
  const { getActiveProfile } = usePersistedStore();

  const install: InstallFunction = useCallback(
    async (mod, originalOptions) => {
      const options = trackInstallOptions(mod, originalOptions);
      try {
        options.onStart(mod);

        if (mod.status === ModStatus.Installed) {
          throw new Error("Mod is already installed!");
        }

        const activeProfile = getActiveProfile();
        const profileFolder = activeProfile?.folderName ?? null;

        const result = await invokeGuarded<InstallableMod>("install_mod", {
          deadlockMod: {
            id: mod.remoteId,
            name: mod.name,
            is_map: mod.isMap,
          },
          profileFolder,
        });

        options.onComplete(mod, result);

        return result;
      } catch (error) {
        options.onError(
          mod,
          isTauriError(error)
            ? error
            : { kind: "unknown", message: getErrorMessage(error) },
        );
        return null;
      }
    },
    [getActiveProfile],
  );

  return { install };
};

export default useInstall;
