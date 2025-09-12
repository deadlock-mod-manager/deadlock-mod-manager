import type { ModDto } from '@deadlock-mods/utils';
import type { StateCreator } from 'zustand';
import { SortType } from '@/lib/constants';
import { createLogger } from '@/lib/logger';
import {
  type LocalMod,
  type ModFileTree,
  ModStatus,
  type Progress,
} from '@/types/mods';
import type { State } from '..';

const logger = createLogger('mods-state');

export type ModProgress = {
  percentage: number;
  speed?: number;
};

export type ModsState = {
  mods: LocalMod[];
  modProgress: Record<string, ModProgress>;
  defaultSort: SortType;
  setDefaultSort: (sortType: SortType) => void;
  addMod: (mod: ModDto, additional?: Partial<LocalMod>) => void;
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

export const transitionModStatus = (current: ModStatus, next: ModStatus) => {
  logger.debug('Transitioning mod status', { current, next });

  if (current === ModStatus.Downloading && next === ModStatus.Downloaded) {
    return ModStatus.Downloaded;
  }
  if (current === ModStatus.Downloaded && next === ModStatus.Installing) {
    return ModStatus.Installing;
  }
  if (current === ModStatus.Installing && next === ModStatus.Installed) {
    return ModStatus.Installed;
  }
  if (current === ModStatus.Installed && next === ModStatus.Downloading) {
    return ModStatus.Downloading;
  }
  if (current === ModStatus.Downloading && next === ModStatus.Error) {
    return ModStatus.Error;
  }
  if (current === ModStatus.Installing && next === ModStatus.Error) {
    return ModStatus.Error;
  }
  if (current === ModStatus.Installed && next === ModStatus.Downloaded) {
    return ModStatus.Downloaded;
  }
  if (next === ModStatus.Installed) {
    return ModStatus.Installed;
  }
  if (current === ModStatus.Error && next === ModStatus.Downloaded) {
    return ModStatus.Downloaded;
  }
  return current;
};

export const createModsSlice: StateCreator<State, [], [], ModsState> = (
  set,
  get
) => ({
  mods: [],
  modProgress: {},

  defaultSort: SortType.LAST_UPDATED,
  setDefaultSort: (sortType: SortType) => set({ defaultSort: sortType }),

  addMod: (mod, additional) =>
    set((state) => {
      if (state.mods.some((m) => m.id === mod.id)) {
        return state;
      }
      return {
        mods: [
          ...state.mods,
          { ...mod, status: ModStatus.Downloading, ...additional },
        ],
      };
    }),

  setModStatus: (remoteId, status) =>
    set((state) => ({
      mods: state.mods.map((mod) => ({
        ...mod,
        status:
          mod.remoteId === remoteId
            ? transitionModStatus(mod.status, status)
            : mod.status,
        downloadedAt:
          status === ModStatus.Downloaded && mod.status !== ModStatus.Installed
            ? new Date()
            : undefined,
      })),
    })),

  setModPath: (remoteId, path) =>
    set((state) => ({
      mods: state.mods.map((mod) => ({
        ...mod,
        path: mod.remoteId === remoteId ? path : mod.path,
      })),
    })),

  removeMod: (remoteId) =>
    set((state) => {
      const newProgress = { ...state.modProgress };
      delete newProgress[remoteId];
      return {
        mods: state.mods.filter((mod) => mod.remoteId !== remoteId),
        modProgress: newProgress,
      };
    }),

  setMods: (mods) => set({ mods }),

  clearMods: () => set({ mods: [], modProgress: {} }),

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
      mods: state.mods.map((mod) => ({
        ...mod,
        status: mod.remoteId === remoteId ? ModStatus.Installed : mod.status,
        installedVpks: mod.remoteId === remoteId ? vpks : mod.installedVpks,
        installedFileTree:
          mod.remoteId === remoteId ? fileTree : mod.installedFileTree,
      })),
    })),
});
