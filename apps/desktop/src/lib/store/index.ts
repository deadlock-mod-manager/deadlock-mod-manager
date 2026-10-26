import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import logger from "@/lib/logger";
import { buildPersistMerge } from "./merge";
import { LATEST_VERSION, safeMigrate } from "./migrate";
import {
  type BisectState,
  bisectDeepMergeKeys,
  createBisectSlice,
} from "./slices/bisect";
import {
  type CloudBackupsState,
  cloudBackupsDeepMergeKeys,
  createCloudBackupsSlice,
} from "./slices/cloud-backups";
import {
  type CrosshairState,
  createCrosshairSlice,
  crosshairDeepMergeKeys,
} from "./slices/crosshair";
import {
  createFeatureHintsSlice,
  featureHintsDeepMergeKeys,
  type FeatureHintsState,
} from "./slices/feature-hints";
import {
  createFavoritesSlice,
  favoritesDeepMergeKeys,
  type FavoritesState,
} from "./slices/favorites";
import {
  createGameSlice,
  gameDeepMergeKeys,
  type GameState,
} from "./slices/game";
import {
  createLaunchHealthSlice,
  type LaunchHealthState,
  launchHealthDeepMergeKeys,
} from "./slices/launch-health";
import {
  createModsSlice,
  modsDeepMergeKeys,
  type ModsState,
} from "./slices/mods";
import { createModGroupsSlice, type ModGroupsState } from "./slices/mod-groups";
import {
  createNetworkSlice,
  networkDeepMergeKeys,
  type NetworkState,
} from "./slices/network";
import {
  createPerformanceSlice,
  performanceDeepMergeKeys,
  type PerformanceState,
} from "./slices/performance";
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
import {
  createStatsSlice,
  statsDeepMergeKeys,
  type StatsState,
} from "./slices/stats";
import { createUISlice, uiDeepMergeKeys, type UIState } from "./slices/ui";
import storage from "./storage";

export type State = ModsState &
  ModGroupsState &
  ProfilesState &
  ServerProfilesState &
  GameState &
  SettingsState &
  NetworkState &
  UIState &
  ScrollState &
  CrosshairState &
  FavoritesState &
  FeatureHintsState &
  StatsState &
  PerformanceState &
  LaunchHealthState &
  BisectState &
  CloudBackupsState;

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
  ...favoritesDeepMergeKeys,
  ...featureHintsDeepMergeKeys,
  ...statsDeepMergeKeys,
  ...performanceDeepMergeKeys,
  ...launchHealthDeepMergeKeys,
  ...bisectDeepMergeKeys,
  ...cloudBackupsDeepMergeKeys,
]);

export const usePersistedStore = create<State>()(
  persist(
    (...a) => ({
      ...createModsSlice(...a),
      ...createModGroupsSlice(...a),
      ...createProfilesSlice(...a),
      ...createServerProfilesSlice(...a),
      ...createGameSlice(...a),
      ...createSettingsSlice(...a),
      ...createNetworkSlice(...a),
      ...createUISlice(...a),
      ...createScrollSlice(...a),
      ...createCrosshairSlice(...a),
      ...createFavoritesSlice(...a),
      ...createFeatureHintsSlice(...a),
      ...createStatsSlice(...a),
      ...createPerformanceSlice(...a),
      ...createLaunchHealthSlice(...a),
      ...createBisectSlice(...a),
      ...createCloudBackupsSlice(...a),
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
          batchUpdateProgress: _batchUpdateProgress,
          isSwitching: _isSwitching,
          profileSyncRevisions: _profileSyncRevisions,
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
