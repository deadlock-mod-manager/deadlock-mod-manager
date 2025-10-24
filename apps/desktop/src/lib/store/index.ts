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
        let state = persistedState as Record<string, unknown>;

        // Migration: v1 -> v2 (profile introduction)
        if (version === 1) {
          console.log("Migrating from version 1 to 2");
          const now = new Date();

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

          state = {
            ...state,
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

          version = 2;
        }

        // Migration: ensure installedRemoteUpdatedAt & isUpdateAvailable fields exist (<= v2 -> v3)
        if (version <= 2) {
          const normalizeDateValue = (value: unknown): string | undefined => {
            if (!value) {
              return undefined;
            }

            if (value instanceof Date) {
              const timestamp = value.getTime();
              return Number.isNaN(timestamp) ? undefined : value.toISOString();
            }

            if (typeof value === "string") {
              const parsed = new Date(value);
              const timestamp = parsed.getTime();
              return Number.isNaN(timestamp) ? undefined : parsed.toISOString();
            }

            return undefined;
          };

          const toTimestamp = (value: unknown): number | undefined => {
            if (!value) {
              return undefined;
            }

            if (value instanceof Date) {
              const timestamp = value.getTime();
              return Number.isNaN(timestamp) ? undefined : timestamp;
            }

            if (typeof value === "string") {
              const parsed = new Date(value);
              const timestamp = parsed.getTime();
              return Number.isNaN(timestamp) ? undefined : timestamp;
            }

            return undefined;
          };

          const computeIsUpdateAvailable = (
            remoteUpdatedAt: unknown,
            installedRemoteUpdatedAt: string | undefined,
          ) => {
            const remoteTimestamp = toTimestamp(remoteUpdatedAt);
            const installedTimestamp = toTimestamp(installedRemoteUpdatedAt);

            return (
              remoteTimestamp !== undefined &&
              installedTimestamp !== undefined &&
              remoteTimestamp > installedTimestamp
            );
          };

          const currentLocalMods = state.localMods as unknown;
          if (Array.isArray(currentLocalMods)) {
            const migratedMods = currentLocalMods.map((mod) => {
              if (!mod || typeof mod !== "object") {
                return mod;
              }

              const modRecord = mod as Record<string, unknown>;
              const normalizedInstalled = normalizeDateValue(
                modRecord.installedRemoteUpdatedAt,
              );
              const isUpdateAvailable = computeIsUpdateAvailable(
                modRecord.remoteUpdatedAt,
                normalizedInstalled,
              );

              const currentInstalled =
                modRecord.installedRemoteUpdatedAt as unknown;
              const currentFlag = modRecord.isUpdateAvailable as unknown;

              if (
                currentInstalled === normalizedInstalled &&
                currentFlag === isUpdateAvailable
              ) {
                return mod;
              }

              return {
                ...modRecord,
                installedRemoteUpdatedAt: normalizedInstalled,
                isUpdateAvailable,
              };
            });

            state = {
              ...state,
              localMods: migratedMods,
            };
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
