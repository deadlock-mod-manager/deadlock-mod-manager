import { beforeEach, describe, expect, it, mock } from "bun:test";
import { create } from "zustand";
import type { UIState } from "./ui";

mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));

const { createUISlice } = await import("./ui");

const createTestStore = () =>
  create<UIState>()((set, get, store) =>
    createUISlice(
      set as Parameters<typeof createUISlice>[0],
      get as Parameters<typeof createUISlice>[1],
      store as Parameters<typeof createUISlice>[2],
    ),
  );

let store: ReturnType<typeof createTestStore>;

beforeEach(() => {
  store = createTestStore();
});

describe("store filters", () => {
  it("keeps Mods store filters off the Maps page", () => {
    const defaults = store.getState().mapsFilters;

    store
      .getState()
      .updateModsFilters({ selectedHeroes: ["Paige"], searchQuery: "skin" });

    expect(store.getState().modsFilters.selectedHeroes).toEqual(["Paige"]);
    expect(store.getState().mapsFilters).toEqual(defaults);
  });

  it("keeps Maps filters off the Mods store", () => {
    const defaults = store.getState().modsFilters;

    store.getState().updateMapsFilters({ selectedCategories: ["Arena"] });

    expect(store.getState().mapsFilters.selectedCategories).toEqual(["Arena"]);
    expect(store.getState().modsFilters).toEqual(defaults);
  });

  it("resets Maps filters without touching the Mods store", () => {
    store.getState().updateModsFilters({ selectedHeroes: ["Paige"] });
    store.getState().updateMapsFilters({ selectedHeroes: ["Haze"] });

    store.getState().resetMapsFilters();

    expect(store.getState().mapsFilters.selectedHeroes).toEqual([]);
    expect(store.getState().modsFilters.selectedHeroes).toEqual(["Paige"]);
  });
});
