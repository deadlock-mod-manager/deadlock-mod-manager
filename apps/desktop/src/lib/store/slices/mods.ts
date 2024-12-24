import { createLogger } from '@/lib/logger';
import { LocalMod, ModStatus, Progress } from '@/types/mods';
import { ModDto } from '@deadlock-mods/utils';
import { StateCreator } from 'zustand';
import { State } from '..';

const logger = createLogger('mods-state');

export interface ModsState {
  mods: LocalMod[];
  addMod: (mod: ModDto, additional?: Partial<LocalMod>) => void;
  removeMod: (remoteId: string) => void;
  setMods: (mods: LocalMod[]) => void;
  setModStatus: (remoteId: string, status: ModStatus) => void;
  setModPath: (remoteId: string, path: string) => void;
  setModProgress: (remoteId: string, progress: Progress) => void;
  clearMods: () => void;
}

export const transitionModStatus = (current: ModStatus, next: ModStatus) => {
  logger.debug('Transitioning mod status', { current, next });

  if (current === ModStatus.DOWNLOADING && next === ModStatus.DOWNLOADED) return ModStatus.DOWNLOADED;
  if (current === ModStatus.DOWNLOADED && next === ModStatus.INSTALLING) return ModStatus.INSTALLING;
  if (current === ModStatus.INSTALLING && next === ModStatus.INSTALLED) return ModStatus.INSTALLED;
  if (current === ModStatus.INSTALLED && next === ModStatus.DOWNLOADING) return ModStatus.DOWNLOADING;
  if (current === ModStatus.DOWNLOADING && next === ModStatus.ERROR) return ModStatus.ERROR;
  if (current === ModStatus.INSTALLING && next === ModStatus.ERROR) return ModStatus.ERROR;
  if (next === ModStatus.INSTALLED) return ModStatus.INSTALLED;
  return current;
};

export const createModsSlice: StateCreator<State, [], [], ModsState> = (set) => ({
  mods: [],
  addMod: (mod, additional) =>
    set((state) => {
      if (state.mods.some((m) => m.id === mod.id)) return state;
      return { mods: [...state.mods, { ...mod, status: ModStatus.DOWNLOADING, ...additional }] };
    }),
  setModStatus: (remoteId, status) =>
    set((state) => ({
      mods: state.mods.map((mod) => ({
        ...mod,
        status: mod.remoteId === remoteId ? transitionModStatus(mod.status, status) : mod.status,
        downloadedAt: status === ModStatus.DOWNLOADED ? new Date() : undefined
      }))
    })),
  setModPath: (remoteId, path) =>
    set((state) => ({
      mods: state.mods.map((mod) => ({
        ...mod,
        path: mod.remoteId === remoteId ? path : mod.path
      }))
    })),
  removeMod: (remoteId) => set((state) => ({ mods: state.mods.filter((mod) => mod.remoteId !== remoteId) })),
  setMods: (mods) => set({ mods }),
  clearMods: () => set({ mods: [] }),
  setModProgress: (remoteId, progress) =>
    set((state) => ({
      mods: state.mods.map((mod) => ({
        ...mod,
        progress:
          mod.remoteId === remoteId ? ((progress?.progressTotal ?? 0) / (progress?.total ?? 1)) * 100 : mod.progress,
        speed: mod.remoteId === remoteId ? progress?.transferSpeed : mod.speed
      }))
    }))
});
