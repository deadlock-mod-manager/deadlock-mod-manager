import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type CrosshairState, createCrosshairSlice } from "./slices/crosshair";
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
  CrosshairState;

export const usePersistedStore = create<State>()(
  persist(
    (...a) => ({
      ...createModsSlice(...a),
      ...createProfilesSlice(...a),
      ...createGameSlice(...a),
      ...createSettingsSlice(...a),
      ...createUISlice(...a),
      ...createScrollSlice(...a),
      ...createCrosshairSlice(...a),
    }),
    {
      name: "local-config",
      version: 8,
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

        // Migration from version 3 to 4: Add mods array to each profile
        if (version <= 3) {
          console.log(
            "Migrating from version 3 to 4: Adding mods array to profiles",
          );
          const profiles = state.profiles as Record<string, unknown>;
          const activeProfileId = state.activeProfileId as string;
          const localMods = state.localMods as unknown[];

          if (profiles && typeof profiles === "object") {
            for (const [profileId, profile] of Object.entries(profiles)) {
              const profileObj = profile as Record<string, unknown>;

              // Active profile gets the current localMods
              if (profileId === activeProfileId) {
                profileObj.mods = Array.isArray(localMods)
                  ? [...localMods]
                  : [];
              } else {
                // Non-active profiles start with empty mods array
                profileObj.mods = [];
              }
            }
          }
        }

        // Migration from version 4 to 5: Add crosshair history
        if (version <= 4) {
          console.log(
            "Migrating from version 4 to 5: Adding crosshair history",
          );
          state.activeCrosshairHistory = [];
        }

        // Migration from version 5 to 6: Add activeCrosshair field
        if (version <= 5) {
          console.log(
            "Migrating from version 5 to 6: Adding activeCrosshair field",
          );
          const history = state.activeCrosshairHistory as unknown[];
          state.activeCrosshair =
            Array.isArray(history) && history.length > 0 ? history[0] : null;
        }

        // Migration from version 6 to 7: Add crosshairFilters field
        if (version <= 6) {
          console.log(
            "Migrating from version 6 to 7: Adding crosshairFilters field",
          );
          state.crosshairFilters = {
            selectedHeroes: [],
            selectedTags: [],
            currentSort: "last updated",
            filterMode: "include",
            searchQuery: "",
          };
        }

        // Migration from version 7 to 8: Add linuxGpuOptimization field (on by default)
        if (version <= 7) {
          console.log(
            "Migrating from version 7 to 8: Adding linuxGpuOptimization field",
          );
          state.linuxGpuOptimization = true;
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
          ...rest
        } = state;
        return rest;
      },
    },
  ),
);
