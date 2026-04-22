import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import logger from "@/lib/logger";
import { buildPersistMerge } from "./merge";
import { LATEST_VERSION, safeMigrate } from "./migrate";
import {
  type CrosshairState,
  createCrosshairSlice,
  crosshairDeepMergeKeys,
} from "./slices/crosshair";
import {
  createGameSlice,
  gameDeepMergeKeys,
  type GameState,
} from "./slices/game";
import {
  createModsSlice,
  modsDeepMergeKeys,
  type ModsState,
} from "./slices/mods";
import {
  createNetworkSlice,
  networkDeepMergeKeys,
  type NetworkState,
} from "./slices/network";
import {
  createProfilesSlice,
  profilesDeepMergeKeys,
  type ProfilesState,
} from "./slices/profiles";
import {
  createScrollSlice,
  scrollDeepMergeKeys,
  type ScrollState,
} from "./slices/scroll";
import {
  createServerProfilesSlice,
  serverProfilesDeepMergeKeys,
  type ServerProfilesState,
} from "./slices/server-profiles";
import {
  createSettingsSlice,
  settingsDeepMergeKeys,
  type SettingsState,
} from "./slices/settings";
import { createUISlice, uiDeepMergeKeys, type UIState } from "./slices/ui";
import storage from "./storage";

export type State = ModsState &
  ProfilesState &
  ServerProfilesState &
  GameState &
  SettingsState &
  NetworkState &
  UIState &
  ScrollState &
  CrosshairState;

const allDeepMergeKeys = new Set<string>([
  ...modsDeepMergeKeys,
  ...profilesDeepMergeKeys,
  ...serverProfilesDeepMergeKeys,
  ...gameDeepMergeKeys,
  ...settingsDeepMergeKeys,
  ...networkDeepMergeKeys,
  ...uiDeepMergeKeys,
  ...scrollDeepMergeKeys,
  ...crosshairDeepMergeKeys,
]);

export const usePersistedStore = create<State>()(
  persist(
    (...a) => ({
      ...createModsSlice(...a),
      ...createProfilesSlice(...a),
      ...createServerProfilesSlice(...a),
      ...createGameSlice(...a),
      ...createSettingsSlice(...a),
      ...createNetworkSlice(...a),
      ...createUISlice(...a),
      ...createScrollSlice(...a),
      ...createCrosshairSlice(...a),
    }),
    {
      name: "local-config",
      version: LATEST_VERSION,
      storage: createJSONStorage(() => storage),
      skipHydration: true,
      migrate: safeMigrate,
      merge: buildPersistMerge(allDeepMergeKeys),
      onRehydrateStorage: () => (hydrated, error) => {
        if (error) {
          logger.withError(error).error("Persist rehydrate failed");
          return;
        }
        logger
          .withMetadata({
            hydratedKeys: hydrated ? Object.keys(hydrated).length : 0,
            version: LATEST_VERSION,
          })
          .debug("Persist rehydrate complete");
      },
      partialize: (state) => {
        const {
          modProgress: _modProgress,
          isSwitching: _isSwitching,
          showWhatsNew: _showWhatsNew,
          lastSeenVersion: _lastSeenVersion,
          forceShowWhatsNew: _forceShowWhatsNew,
          markVersionAsSeen: _markVersionAsSeen,
          setShowWhatsNew: _setShowWhatsNew,
          analysisResult: _analysisResult,
          analysisDialogOpen: _analysisDialogOpen,
          heroDetection: _heroDetection,
          ...rest
        } = state;
        return rest;
      },
    },
  ),
);
