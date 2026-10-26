import type { ModsFilters, UIState } from "../slices/ui";

/** The Maps page keeps its own filters so Mods store filters don't carry over. */
export const selectStoreFilters = (
  state: Pick<UIState, "modsFilters" | "mapsFilters">,
  maps: boolean,
): ModsFilters => (maps ? state.mapsFilters : state.modsFilters);
