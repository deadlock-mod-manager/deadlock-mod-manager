import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createGameSlice, type GameState } from "./slices/game";
import { createModsSlice, type ModsState } from "./slices/mods";
import { createProfilesSlice, type ProfilesState } from "./slices/profiles";
import { createScrollSlice, type ScrollState } from "./slices/scroll";
import { createSettingsSlice, type SettingsState } from "./slices/settings";
import { createUISlice, type UIState } from "./slices/ui";
import storage from "./storage";

export type State = ModsState &
  ProfilesState &
  GameState &
  SettingsState &
  UIState &
  ScrollState;

export const usePersistedStore = create<State>()(
  persist(
    (...a) => ({
      ...createModsSlice(...a),
      ...createProfilesSlice(...a),
      ...createGameSlice(...a),
      ...createSettingsSlice(...a),
      ...createUISlice(...a),
      ...createScrollSlice(...a),
    }),
    {
      name: "local-config",
      version: 2,
      storage: createJSONStorage(() => storage),
      skipHydration: true,
      migrate: (persistedState: unknown, version: number) => {
        // If migrating from version 1 to 2, preserve existing data and add profiles
        if (version === 1) {
          console.log("Migrating from version 1 to 2");
          const state = persistedState as Record<string, unknown>;
          const now = new Date();

          // Build enabledMods from currently installed mods
          const enabledMods: Record<
            string,
            { remoteId: string; enabled: boolean; lastModified: Date }
          > = {};
          if (Array.isArray(state.localMods)) {
            state.localMods.forEach((mod: unknown) => {
              const modObj = mod as Record<string, unknown>;
              if (
                modObj.status === "installed" &&
                typeof modObj.remoteId === "string"
              ) {
                enabledMods[modObj.remoteId] = {
                  remoteId: modObj.remoteId,
                  enabled: true,
                  lastModified: now,
                };
              }
            });
          }

          return {
            ...(persistedState as Record<string, unknown>),
            profiles: {
              default: {
                id: "default",
                name: "Default Profile",
                description: "The default mod profile",
                createdAt: now,
                lastUsed: now,
                enabledMods,
                isDefault: true,
              },
            },
            activeProfileId: "default",
            isSwitching: false,
          };
        }
        return persistedState;
      },
      partialize: (state) => {
        // Only include stable state that should be persisted
        // Exclude ephemeral state from persistence
        const {
          modProgress: _modProgress,
          isSwitching: _isSwitching,
          showWhatsNew: _showWhatsNew,
          lastSeenVersion: _lastSeenVersion,
          forceShowWhatsNew: _forceShowWhatsNew,
          markVersionAsSeen: _markVersionAsSeen,
          setShowWhatsNew: _setShowWhatsNew,
          ...rest
        } = state;
        return rest;
      },
    },
  ),
);
