import type { ModsFilters, UIState } from "../slices/ui";

export const selectStoreFilters = (
  state: Pick<UIState, "modsFilters" | "mapsFilters">,
  maps: boolean,
): ModsFilters => (maps ? state.mapsFilters : state.modsFilters);
