import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type AuthState, createAuthSlice } from "./slices/auth";
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
  ScrollState &
  AuthState;

export const usePersistedStore = create<State>()(
  persist(
    (...a) => ({
      ...createModsSlice(...a),
      ...createProfilesSlice(...a),
      ...createGameSlice(...a),
      ...createSettingsSlice(...a),
      ...createUISlice(...a),
      ...createScrollSlice(...a),
      ...createAuthSlice(...a),
    }),
    {
      name: "local-config",
      version: 3,
      storage: createJSONStorage(() => storage),
      skipHydration: true,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;

        // Migration from version 1 to 2: Add profiles system
        if (version === 1) {
          console.log("Migrating from version 1 to 2");
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

          state.profiles = {
            default: {
              id: "default",
              name: "Default Profile",
              description: "The default mod profile",
              createdAt: now,
              lastUsed: now,
              enabledMods,
              isDefault: true,
            },
          };
          state.activeProfileId = "default";
          state.isSwitching = false;
        }

        // Migration from version 2 to 3: Add folderName to profiles
        if (version <= 2) {
          console.log(
            "Migrating from version 2 to 3: Adding folderName to profiles",
          );
          const profiles = state.profiles as Record<string, unknown>;

          if (profiles && typeof profiles === "object") {
            for (const [profileId, profile] of Object.entries(profiles)) {
              const profileObj = profile as Record<string, unknown>;

              // Default profile gets null folderName (uses root addons)
              if (profileId === "default" || profileObj.isDefault === true) {
                profileObj.folderName = null;
              } else {
                // Non-default profiles: generate folder name from profile ID and name
                // Use existing profile ID as-is (it should already be formatted correctly)
                const profileName =
                  typeof profileObj.name === "string"
                    ? profileObj.name
                    : "profile";

                // Sanitize name for folder
                const sanitizedName = profileName
                  .toLowerCase()
                  .replace(/[^a-z0-9-_]/g, "-")
                  .replace(/^-+|-+$/g, "");

                profileObj.folderName = `${profileId}_${sanitizedName}`;
              }
            }
          }
        }

        return state;
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
          // Exclude analysis dialog state (ephemeral)
          analysisResult: _analysisResult,
          analysisDialogOpen: _analysisDialogOpen,
          // Exclude auth state (managed separately via secure storage)
          user: _user,
          session: _session,
          isAuthenticated: _isAuthenticated,
          isLoading: _isLoading,
          setAuth: _setAuth,
          clearAuth: _clearAuth,
          setLoading: _setLoading,
          ...rest
        } = state;
        return rest;
      },
    },
  ),
);
