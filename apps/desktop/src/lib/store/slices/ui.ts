import type { StateCreator } from "zustand";
import { SortType } from "@/lib/constants";
import { getPlugins } from "@/lib/plugins";
import type { State } from "..";

export type FilterMode = "include" | "exclude";

export type ModsFilters = {
  selectedCategories: string[];
  selectedHeroes: string[];
  showAudioOnly: boolean;
  showNSFW: boolean;
  currentSort: SortType;
  filterMode: FilterMode;
  searchQuery: string;
};

export type UIState = {
  showWhatsNew: boolean;
  lastSeenVersion: string | null;
  audioVolume: number; // Volume as percentage (0-100)
  modsFilters: ModsFilters;
  hasCompletedOnboarding: boolean;

  // Plugins
  enabledPlugins: Record<string, boolean>;
  pluginSettings: Record<string, unknown>;

  forceShowWhatsNew: () => void;
  markVersionAsSeen: (version: string) => void;
  setShowWhatsNew: (show: boolean) => void;
  setAudioVolume: (volume: number) => void;
  updateModsFilters: (filters: Partial<ModsFilters>) => void;
  resetModsFilters: () => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
  setEnabledPlugin: (id: string, enabled: boolean) => void;
  setPluginSettings: (id: string, value: unknown) => void;
};

const DEFAULT_MODS_FILTERS: ModsFilters = {
  selectedCategories: [],
  selectedHeroes: [],
  showAudioOnly: false,
  showNSFW: false,
  currentSort: SortType.LAST_UPDATED,
  filterMode: "include",
  searchQuery: "",
};

export const createUISlice: StateCreator<State, [], [], UIState> = (set) => ({
  showWhatsNew: false,
  lastSeenVersion: null,
  audioVolume: 50, // Default to 50%
  modsFilters: DEFAULT_MODS_FILTERS,
  hasCompletedOnboarding: false,
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

  setHasCompletedOnboarding: (completed: boolean) =>
    set(() => ({
      hasCompletedOnboarding: completed,
    })),

  setEnabledPlugin: (id: string, enabled: boolean) =>
    set((state) => {
      if (!enabled) {
        return { enabledPlugins: { ...state.enabledPlugins, [id]: false } };
      }
      const all = getPlugins().map((p) => p.manifest);
      const manifest = all.find((m) => m.id === id);
      const forwardDisable = Array.isArray(manifest?.disabledPlugins)
        ? manifest!.disabledPlugins!
        : [];
      const reverseDisable = all
        .filter(
          (m) =>
            Array.isArray(m.disabledPlugins) && m.disabledPlugins!.includes(id),
        )
        .map((m) => m.id);
      const next = { ...state.enabledPlugins, [id]: true } as Record<
        string,
        boolean
      >;
      for (const target of forwardDisable) next[target] = false;
      for (const target of reverseDisable) next[target] = false;
      return { enabledPlugins: next };
    }),

  setPluginSettings: (id: string, value: unknown) =>
    set((state) => ({
      pluginSettings: { ...state.pluginSettings, [id]: value },
    })),
});
