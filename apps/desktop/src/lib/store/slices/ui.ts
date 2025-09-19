import type { StateCreator } from "zustand";
import { SortType } from "@/lib/constants";
import type { State } from "..";

export type FilterMode = "include" | "exclude";

export type ModsFilters = {
  hideOutdated: boolean;
  selectedCategories: string[];
  selectedHeroes: string[];
  showAudioOnly: boolean;
  showNSFW: boolean;
  currentSort: SortType;
  filterMode: FilterMode;
};

export type UIState = {
  showWhatsNew: boolean;
  lastSeenVersion: string | null;
  audioVolume: number; // Volume as percentage (0-100)
  modsFilters: ModsFilters;

  forceShowWhatsNew: () => void;
  markVersionAsSeen: (version: string) => void;
  setShowWhatsNew: (show: boolean) => void;
  setAudioVolume: (volume: number) => void;
  updateModsFilters: (filters: Partial<ModsFilters>) => void;
  resetModsFilters: () => void;
};

const DEFAULT_MODS_FILTERS: ModsFilters = {
  hideOutdated: true,
  selectedCategories: [],
  selectedHeroes: [],
  showAudioOnly: false,
  showNSFW: false,
  currentSort: SortType.LAST_UPDATED,
  filterMode: "include",
};

export const createUISlice: StateCreator<State, [], [], UIState> = (set) => ({
  showWhatsNew: false,
  lastSeenVersion: null,
  audioVolume: 50, // Default to 50%
  modsFilters: DEFAULT_MODS_FILTERS,

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
});
