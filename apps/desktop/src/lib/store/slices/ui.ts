import type { StateCreator } from "zustand";
import { SortType, TimePeriod } from "@/lib/constants";
import type { State } from "..";
import {
  applyPluginSettings,
  disablePlugin,
  enablePlugin,
} from "../utils/plugin-slice";

export type FilterMode = "include" | "exclude";

export type MapQuickFilter = "off" | "only" | "exclude";
export type AudioQuickFilter = "off" | "only" | "exclude";
// Which GameBanana section the mods store is browsing. Maps are mods with the
// map flag set; the rest map onto submission types.
export type ContentType = "mod" | "sound" | "map" | "wip";
export type AddedPeriod = "any" | "today" | "week" | "month" | "custom";

export type AddedFilter = {
  period: AddedPeriod;
  // Local calendar dates (YYYY-MM-DD) used when period is "custom".
  from: string;
  to: string;
};

export const DEFAULT_ADDED_FILTER: AddedFilter = {
  period: "any",
  from: "",
  to: "",
};

export type ModsFilters = {
  selectedCategories: string[];
  selectedHeroes: string[];
  contentType: ContentType;
  hideNSFW: boolean;
  hideOutdated: boolean;
  currentSort: SortType;
  timePeriod: TimePeriod;
  addedFilter: AddedFilter;
  filterMode: FilterMode;
  searchQuery: string;
  showFavoritesOnly: boolean;
};

// Client-side toggles for features that are still settling. Stored locally so
// anyone can opt in from Settings without signing in.
export const EXPERIMENTAL_FEATURES = [
  "custom-maps",
  "server-browser",
  "mod-foundry",
  "player-stats",
  "profile-management",
  "profile-sharing",
] as const;

export type ExperimentalFeature = (typeof EXPERIMENTAL_FEATURES)[number];

const DEFAULT_EXPERIMENTAL_FEATURES: Record<ExperimentalFeature, boolean> = {
  "custom-maps": false,
  "server-browser": false,
  "mod-foundry": true,
  "player-stats": true,
  "profile-management": true,
  "profile-sharing": true,
};

export type CrosshairFilters = {
  selectedHeroes: string[];
  selectedTags: string[];
  currentSort: SortType;
  filterMode: FilterMode;
  searchQuery: string;
};

export type UIState = {
  showWhatsNew: boolean;
  lastSeenVersion: string | null;
  audioVolume: number; // Volume as percentage (0-100)
  modsFilters: ModsFilters;
  crosshairFilters: CrosshairFilters;
  hasCompletedOnboarding: boolean;
  showOccultGeometry: boolean;
  animateOccultGeometry: boolean;
  experimentalFeatures: Record<ExperimentalFeature, boolean>;

  // Plugins
  enabledPlugins: Record<string, boolean>;
  pluginSettings: Record<string, unknown>;

  forceShowWhatsNew: () => void;
  markVersionAsSeen: (version: string) => void;
  setShowWhatsNew: (show: boolean) => void;
  setAudioVolume: (volume: number) => void;
  updateModsFilters: (filters: Partial<ModsFilters>) => void;
  resetModsFilters: () => void;
  updateCrosshairFilters: (filters: Partial<CrosshairFilters>) => void;
  resetCrosshairFilters: () => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
  setShowOccultGeometry: (value: boolean) => void;
  setAnimateOccultGeometry: (value: boolean) => void;
  setExperimentalFeature: (
    feature: ExperimentalFeature,
    enabled: boolean,
  ) => void;
  setEnabledPlugin: (id: string, enabled: boolean) => void;
  setPluginSettings: (id: string, value: unknown) => void;
};

const DEFAULT_MODS_FILTERS: ModsFilters = {
  selectedCategories: [],
  selectedHeroes: [],
  contentType: "mod",
  hideNSFW: false,
  hideOutdated: false,
  currentSort: SortType.LAST_UPDATED,
  timePeriod: TimePeriod.ALL_TIME,
  addedFilter: DEFAULT_ADDED_FILTER,
  filterMode: "include",
  searchQuery: "",
  showFavoritesOnly: false,
};

const DEFAULT_CROSSHAIR_FILTERS: CrosshairFilters = {
  selectedHeroes: [],
  selectedTags: [],
  currentSort: SortType.LAST_UPDATED,
  filterMode: "include",
  searchQuery: "",
};

export const uiDeepMergeKeys = [
  "modsFilters",
  "crosshairFilters",
  "experimentalFeatures",
] as const satisfies readonly (keyof UIState)[];

export const createUISlice: StateCreator<State, [], [], UIState> = (set) => ({
  showWhatsNew: false,
  lastSeenVersion: null,
  audioVolume: 50, // Default to 50%
  modsFilters: DEFAULT_MODS_FILTERS,
  crosshairFilters: DEFAULT_CROSSHAIR_FILTERS,
  hasCompletedOnboarding: false,
  showOccultGeometry: true,
  animateOccultGeometry: true,
  experimentalFeatures: DEFAULT_EXPERIMENTAL_FEATURES,
  enabledPlugins: {},
  pluginSettings: {},

  forceShowWhatsNew: () =>
    set(() => ({
      showWhatsNew: true,
    })),

  markVersionAsSeen: (version: string) =>
    set(() => ({
      showWhatsNew: false,
      lastSeenVersion: version,
    })),

  setShowWhatsNew: (show: boolean) =>
    set(() => ({
      showWhatsNew: show,
    })),

  setAudioVolume: (volume: number) =>
    set(() => ({
      audioVolume: Math.max(0, Math.min(100, volume)), // Clamp between 0-100
    })),

  updateModsFilters: (filters: Partial<ModsFilters>) =>
    set((state) => ({
      modsFilters: { ...state.modsFilters, ...filters },
    })),

  resetModsFilters: () =>
    set(() => ({
      modsFilters: DEFAULT_MODS_FILTERS,
    })),

  updateCrosshairFilters: (filters: Partial<CrosshairFilters>) =>
    set((state) => ({
      crosshairFilters: { ...state.crosshairFilters, ...filters },
    })),

  resetCrosshairFilters: () =>
    set(() => ({
      crosshairFilters: DEFAULT_CROSSHAIR_FILTERS,
    })),

  setHasCompletedOnboarding: (completed: boolean) =>
    set(() => ({
      hasCompletedOnboarding: completed,
    })),

  setShowOccultGeometry: (value: boolean) =>
    set(() => ({
      showOccultGeometry: value,
    })),

  setAnimateOccultGeometry: (value: boolean) =>
    set(() => ({
      animateOccultGeometry: value,
    })),

  setExperimentalFeature: (feature: ExperimentalFeature, enabled: boolean) =>
    set((state) => ({
      experimentalFeatures: {
        ...state.experimentalFeatures,
        [feature]: enabled,
      },
    })),

  setEnabledPlugin: (id: string, enabled: boolean) =>
    set((state) =>
      enabled ? enablePlugin(state, id) : disablePlugin(state, id),
    ),

  setPluginSettings: (id: string, value: unknown) =>
    set((state) => applyPluginSettings(state, id, value)),
});
