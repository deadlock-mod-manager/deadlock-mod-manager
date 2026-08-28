import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { getErrorMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { type InstallableMod, type LocalMod, ModStatus } from "@/types/mods";
import { type ErrorKind, isTauriError } from "@/types/tauri";

const logger = createLogger("use-install");

export type InstallOptions = {
  onStart: (mod: LocalMod) => void;
  onComplete: (mod: LocalMod, result: InstallableMod) => void;
  onError: (mod: LocalMod, error: ErrorKind) => void;
};

export type InstallFunction = (
  mod: LocalMod,
  options: InstallOptions,
) => Promise<InstallableMod | null>;

const useInstall = () => {
  const { getActiveProfile } = usePersistedStore();

  const install: InstallFunction = useCallback(
    async (mod, options) => {
      try {
        options.onStart(mod);

        if (mod.status === ModStatus.Installed) {
          throw new Error("Mod is already installed!");
        }

        const activeProfile = getActiveProfile();
        const profileFolder = activeProfile?.folderName ?? null;

        const result = (await invoke("install_mod", {
          deadlockMod: {
            id: mod.remoteId,
            name: mod.name,
            is_map: mod.isMap,
          },
          profileFolder,
        })) as InstallableMod;

        options.onComplete(mod, result);

        return result;
      } catch (error: unknown) {
        logger
          .withMetadata({ error, modId: mod.remoteId })
          .error("Failed to install mod");
        const installError: ErrorKind = isTauriError(error)
          ? error
          : { kind: "unknown", message: getErrorMessage(error) };
        options.onError(mod, installError);
        return null;
      }
    },
    [getActiveProfile],
  );

  return { install };
};

export default useInstall;
