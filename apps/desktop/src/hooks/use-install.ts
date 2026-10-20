import { useCallback } from "react";
import { trackInstallOptions } from "@/lib/analytics";
import type { InstallAnalyticsOptions } from "@/lib/analytics/install";
import { getErrorMessage } from "@/lib/errors";
import { syncInstalledVpksFromManifest } from "@/lib/mods/sync-installed-vpks";
import { isTauriError } from "@/types/tauri";
import { usePersistedStore } from "@/lib/store";
import { type InstallableMod, type LocalMod, ModStatus } from "@/types/mods";
import { useModelConflictInstall } from "@/hooks/use-model-conflict-install";

export type InstallOptions = InstallAnalyticsOptions;

export type InstallFunction = (
  mod: LocalMod,
  options: InstallOptions,
) => Promise<InstallableMod | null>;

const useInstall = () => {
  const { mutateAsync: installWithConflictResolution } =
    useModelConflictInstall();
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);

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

        const result = await installWithConflictResolution({
          mod,
          profileFolder,
        });
        if (!result) {
          options.onCancel?.(mod, "modelConflict");
          return null;
        }
        await syncInstalledVpksFromManifest(profileFolder);

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
    [getActiveProfile, installWithConflictResolution],
  );

  return { install };
};

export default useInstall;
