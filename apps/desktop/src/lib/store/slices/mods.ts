import type { ModDto } from '@deadlock-mods/utils';
import type { StateCreator } from 'zustand';
import { SortType } from '@/lib/constants';
import logger from '@/lib/logger';
import { ModStatusStateMachine } from '@/lib/state-machines/mod-status';
import {
  type LocalMod,
  type ModFileTree,
  ModStatus,
  type Progress,
} from '@/types/mods';
import type { State } from '..';

export type ModProgress = {
  percentage: number;
  speed?: number;
};

export type ModsState = {
  localMods: LocalMod[];
  modProgress: Record<string, ModProgress>;
  defaultSort: SortType;
  setDefaultSort: (sortType: SortType) => void;
  addLocalMod: (mod: ModDto, additional?: Partial<LocalMod>) => void;
  removeMod: (remoteId: string) => void;
  setMods: (mods: LocalMod[]) => void;
  setModStatus: (remoteId: string, status: ModStatus) => void;
  setModPath: (remoteId: string, path: string) => void;
  setModProgress: (remoteId: string, progress: Progress) => void;
  clearMods: () => void;
  setInstalledVpks: (
    remoteId: string,
    vpks: string[],
    fileTree?: ModFileTree
  ) => void;
  getModProgress: (remoteId: string) => ModProgress | undefined;
};

export const createModsSlice: StateCreator<State, [], [], ModsState> = (
  set,
  get
) => ({
  localMods: [],
  modProgress: {},

  defaultSort: SortType.LAST_UPDATED,
  setDefaultSort: (sortType: SortType) => set({ defaultSort: sortType }),
  addLocalMod: (mod, additional) =>
    set((state) => {
      if (state.localMods.some((m) => m.id === mod.id)) {
        return state;
      }
      return {
        localMods: [
          ...state.localMods,
          { ...mod, status: ModStatus.Downloading, ...additional },
        ],
      };
    }),

  setModStatus: (remoteId, status) => {
    const mod = get().localMods.find((m) => m.remoteId === remoteId);
    if (!mod) {
      logger.error('Mod not found', { remoteId });
      return;
    }
    const validateStatus = ModStatusStateMachine.validateTransition(
      mod.status,
      status
    );

    if (validateStatus.isErr()) {
      logger.error('Invalid status transition', {
        remoteId,
        status,
        error: validateStatus.error,
      });
      return;
    }

    return set((state) => ({
      localMods: state.localMods.map((mod) => ({
        ...mod,
        status: mod.remoteId === remoteId ? status : mod.status,
        downloadedAt:
          status === ModStatus.Downloaded && mod.status !== ModStatus.Installed
            ? new Date()
            : undefined,
      })),
    }));
  },

  setModPath: (remoteId, path) =>
    set((state) => ({
      localMods: state.localMods.map((mod) => ({
        ...mod,
        path: mod.remoteId === remoteId ? path : mod.path,
      })),
    })),

  removeMod: (remoteId) =>
    set((state) => {
      const newProgress = { ...state.modProgress };
      delete newProgress[remoteId];
      return {
        localMods: state.localMods.filter((mod) => mod.remoteId !== remoteId),
        modProgress: newProgress,
      };
    }),

  setMods: (mods) => set({ localMods: mods }),

  clearMods: () => set({ localMods: [], modProgress: {} }),

  setModProgress: (remoteId, progress, index = 0) =>
    set((state) => ({
      modProgress: {
        ...state.modProgress,
        [`${remoteId}-${index}`]: {
          percentage:
            ((progress?.progressTotal ?? 0) / (progress?.total ?? 1)) * 100,
          speed: progress?.transferSpeed,
        },
      },
    })),

  getModProgress: (remoteId, index = 0) =>
    get().modProgress[`${remoteId}-${index}`],

  setInstalledVpks: (
    remoteId: string,
    vpks: string[],
    fileTree?: ModFileTree
  ) =>
    set((state) => ({
      localMods: state.localMods.map((mod) => ({
        ...mod,
        // Don't automatically change status - let other functions manage status
        installedVpks: mod.remoteId === remoteId ? vpks : mod.installedVpks,
        installedFileTree:
          mod.remoteId === remoteId ? fileTree : mod.installedFileTree,
      })),
    })),
});
