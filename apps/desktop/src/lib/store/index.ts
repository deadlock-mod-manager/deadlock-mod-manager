import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createGameSlice, type GameState } from './slices/game';
import { createModsSlice, type ModsState } from './slices/mods';
import { createScrollSlice, type ScrollState } from './slices/scroll';
import { createSettingsSlice, type SettingsState } from './slices/settings';
import { createUISlice, type UIState } from './slices/ui';
import storage from './storage';

export type State = ModsState &
  GameState &
  SettingsState &
  UIState &
  ScrollState;

export const usePersistedStore = create<State>()(
  persist(
    (...a) => ({
      ...createModsSlice(...a),
      ...createGameSlice(...a),
      ...createSettingsSlice(...a),
      ...createUISlice(...a),
      ...createScrollSlice(...a),
    }),
    {
      name: 'local-config',
      version: 1,
      storage: createJSONStorage(() => storage),
      skipHydration: true,
      partialize: (state) => {
        // Only include stable state that should be persisted
        // Exclude ephemeral state from persistence
        const {
          modProgress: _modProgress,
          showWhatsNew: _showWhatsNew,
          lastSeenVersion: _lastSeenVersion,
          forceShowWhatsNew: _forceShowWhatsNew,
          markVersionAsSeen: _markVersionAsSeen,
          setShowWhatsNew: _setShowWhatsNew,
          ...rest
        } = state;
        return rest;
      },
    }
  )
);
