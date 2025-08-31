import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createGameSlice, type GameState } from './slices/game';
import { createModsSlice, type ModsState } from './slices/mods';
import { createSettingsSlice, type SettingsState } from './slices/settings';
import storage from './storage';

export type State = ModsState & GameState & SettingsState;

export const usePersistedStore = create<State>()(
  persist(
    (...a) => ({
      ...createModsSlice(...a),
      ...createGameSlice(...a),
      ...createSettingsSlice(...a),
    }),
    {
      name: 'local-config',
      version: 1,
      storage: createJSONStorage(() => storage),
      skipHydration: true,
      partialize: (state) => {
        // Only include stable state that should be persisted
        // Completely exclude modProgress from persistence to avoid spamming storage
        const { modProgress, ...rest } = state;
        return rest;
      },
    }
  )
);
