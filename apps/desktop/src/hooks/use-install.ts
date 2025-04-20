import { InstallableMod, LocalMod, ModStatus } from '@/types/mods';
import { ErrorKind } from '@/types/tauri';
import { invoke } from '@tauri-apps/api/core';

export interface InstallOptions {
  onStart: (mod: LocalMod) => void;
  onComplete: (mod: LocalMod, result: InstallableMod) => void;
  onError: (mod: LocalMod, error: ErrorKind) => void;
}

export type InstallFunction = (mod: LocalMod, options: InstallOptions) => Promise<InstallableMod | null>;

const useInstall = () => {
  const install: InstallFunction = async (mod, options) => {
    try {
      options.onStart(mod);

      if (!mod.path) {
        throw new Error('Mod is not downloaded! Might be corrupted.');
      }

      if (mod.status === ModStatus.INSTALLED) {
        throw new Error('Mod is already installed!');
      }

      const result = (await invoke('install_mod', {
        deadlockMod: {
          id: mod.remoteId,
          name: mod.name,
          path: mod.path
        }
      })) as InstallableMod;

      options.onComplete(mod, result);

      return result;
    } catch (error: unknown) {
      console.error(error);
      if (error instanceof Error) {
        options.onError(mod, {
          kind: 'unknown',
          message: error.message
        });
      } else if (typeof error === 'object' && error !== null && 'kind' in error) {
        options.onError(mod, error as ErrorKind);
      }
      return null;
    }
  };

  return { install };
};

export default useInstall;
