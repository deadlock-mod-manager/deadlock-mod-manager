import type { StateCreator } from "zustand";
import { EXPERIMENTAL_FEATURES, SortType } from "@/lib/constants";
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
// map flag set; collections are GameBanana collections; the rest map onto
// submission types.
export type ContentType = "mod" | "sound" | "map" | "wip" | "collection";
export type DatePeriod = "any" | "24h" | "7d" | "14d" | "28d" | "1y" | "custom";

// The "Updated" and "Added" filters: a rolling window or a custom range.
export type DateFilter = {
  period: DatePeriod;
  // Local calendar dates (YYYY-MM-DD) used when period is "custom".
  from: string;
  to: string;
};

export const DEFAULT_DATE_FILTER: DateFilter = {
  period: "any",
  from: "",
  to: "",
};

export type ModsFilters = {
  selectedCategories: string[];
  selectedHeroes: string[];
  contentType: ContentType;
  hideNSFW: boolean;
  nsfwOnly: boolean;
  hideOutdated: boolean;
  currentSort: SortType;
  updatedFilter: DateFilter;
  addedFilter: DateFilter;
  filterMode: FilterMode;
  searchQuery: string;
  showFavoritesOnly: boolean;
};

export type ExperimentalFeature = (typeof EXPERIMENTAL_FEATURES)[number];

const DEFAULT_EXPERIMENTAL_FEATURES = {
  "custom-maps": false,
  "mod-foundry": true,
  "player-stats": true,
  "profile-management": true,
  "profile-sharing": true,
  "conflict-detection": true,
  "performance-configs": true,
  "cloud-backup": true,
  "live-scoreboard": false,
  plugins: false,
} satisfies Record<ExperimentalFeature, boolean>;

export type CrosshairFilters = {
  selectedHeroes: string[];
  selectedTags: string[];
  currentSort: SortType;
  filterMode: FilterMode;
  searchQuery: string;
};

export type UIState = {
  experimentalTourDismissed: boolean;
  dismissExperimentalTour: () => void;
  // Set once the user has answered the match sync opt-in, either in onboarding
  // or in the one-time prompt shown to existing users.
  matchSyncPromptDismissed: boolean;
  dismissMatchSyncPrompt: () => void;
  showWhatsNew: boolean;
  lastSeenVersion: string | null;
  audioVolume: number; // Volume as percentage (0-100)
  modsFilters: ModsFilters;
  mapsFilters: ModsFilters;
  crosshairFilters: CrosshairFilters;
  hasCompletedOnboarding: boolean;
  // Sidebar entries marked "New" that the user has opened at least once.
  seenNavItems: Record<string, true>;
  showOccultGeometry: boolean;
  animateOccultGeometry: boolean;
  experimentalFeatures: Record<ExperimentalFeature, boolean>;
  autoFixMods: boolean;

  // Plugins
  enabledPlugins: Record<string, boolean>;
  pluginSettings: Record<string, unknown>;

  forceShowWhatsNew: () => void;
  markVersionAsSeen: (version: string) => void;
  setShowWhatsNew: (show: boolean) => void;
  setAudioVolume: (volume: number) => void;
  updateModsFilters: (filters: Partial<ModsFilters>) => void;
  resetModsFilters: () => void;
  updateMapsFilters: (filters: Partial<ModsFilters>) => void;
  resetMapsFilters: () => void;
  updateCrosshairFilters: (filters: Partial<CrosshairFilters>) => void;
  resetCrosshairFilters: () => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
  markNavItemSeen: (id: string) => void;
  setShowOccultGeometry: (value: boolean) => void;
  setAnimateOccultGeometry: (value: boolean) => void;
  setExperimentalFeature: (
    feature: ExperimentalFeature,
    enabled: boolean,
  ) => void;
  setAutoFixMods: (enabled: boolean) => void;
  setEnabledPlugin: (id: string, enabled: boolean) => void;
  setPluginSettings: (id: string, value: unknown) => void;
};

const DEFAULT_MODS_FILTERS: ModsFilters = {
  selectedCategories: [],
  selectedHeroes: [],
  contentType: "mod",
  hideNSFW: false,
  nsfwOnly: false,
  hideOutdated: false,
  currentSort: SortType.LAST_UPDATED,
  updatedFilter: DEFAULT_DATE_FILTER,
  addedFilter: DEFAULT_DATE_FILTER,
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
  "mapsFilters",
  "crosshairFilters",
  "experimentalFeatures",
] as const satisfies readonly (keyof UIState)[];

export const createUISlice: StateCreator<State, [], [], UIState> = (set) => ({
  experimentalTourDismissed: false,
  dismissExperimentalTour: () => set({ experimentalTourDismissed: true }),
  matchSyncPromptDismissed: false,
  dismissMatchSyncPrompt: () => set({ matchSyncPromptDismissed: true }),
  showWhatsNew: false,
  lastSeenVersion: null,
  audioVolume: 50, // Default to 50%
  modsFilters: DEFAULT_MODS_FILTERS,
  mapsFilters: DEFAULT_MODS_FILTERS,
  crosshairFilters: DEFAULT_CROSSHAIR_FILTERS,
  hasCompletedOnboarding: false,
  seenNavItems: {},
  showOccultGeometry: true,
  animateOccultGeometry: true,
  experimentalFeatures: DEFAULT_EXPERIMENTAL_FEATURES,
  autoFixMods: true,
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

  updateMapsFilters: (filters: Partial<ModsFilters>) =>
    set((state) => ({
      mapsFilters: { ...state.mapsFilters, ...filters },
    })),

  resetMapsFilters: () =>
    set(() => ({
      mapsFilters: DEFAULT_MODS_FILTERS,
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

  markNavItemSeen: (id: string) =>
    set((state) =>
      state.seenNavItems[id]
        ? state
        : { seenNavItems: { ...state.seenNavItems, [id]: true } },
    ),

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

  setAutoFixMods: (enabled: boolean) =>
    set(() => ({
      autoFixMods: enabled,
    })),

  setEnabledPlugin: (id: string, enabled: boolean) =>
    set((state) =>
      enabled ? enablePlugin(state, id) : disablePlugin(state, id),
    ),

  setPluginSettings: (id: string, value: unknown) =>
    set((state) => applyPluginSettings(state, id, value)),
});
