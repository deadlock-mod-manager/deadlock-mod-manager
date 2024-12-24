import { getStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORE_NAME } from '../constants';
import { createGameSlice, type GameState } from './slices/game';
import { createModsSlice, type ModsState } from './slices/mods';
import { createSettingsSlice, type SettingsState } from './slices/settings';

export type State = ModsState & GameState & SettingsState;

const tauriStore = () => {
  return {
    getItem: async (key: string) => (await (await getStore(STORE_NAME))?.get<string>(key)) ?? null,
    setItem: async (key: string, value: string) => (await getStore(STORE_NAME))?.set(key, value),
    removeItem: async (key: string) => (await getStore(STORE_NAME))?.delete(key)
  };
};

export const usePersistedStore = create<State>()(
  persist(
    (...a) => ({
      ...createModsSlice(...a),
      ...createGameSlice(...a),
      ...createSettingsSlice(...a)
    }),
    {
      name: 'local-config',
      version: 1,
      storage: createJSONStorage(() => tauriStore()),
      skipHydration: true
    }
  )
);
