import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { usePersistedStore } from "@/lib/store";
import { type InstallableMod, type LocalMod, ModStatus } from "@/types/mods";
import type { ErrorKind } from "@/types/tauri";

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
          },
          profileFolder,
        })) as InstallableMod;

        options.onComplete(mod, result);

        return result;
      } catch (error: unknown) {
        if (error instanceof Error) {
          options.onError(mod, {
            kind: "unknown",
            message: error.message,
          });
        } else if (
          typeof error === "object" &&
          error !== null &&
          "kind" in error
        ) {
          options.onError(mod, error as ErrorKind);
        }
        return null;
      }
    },
    [getActiveProfile],
  );

  return { install };
};

export default useInstall;
