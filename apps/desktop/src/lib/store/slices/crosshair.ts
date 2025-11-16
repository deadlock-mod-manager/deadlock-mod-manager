import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import type { StateCreator } from "zustand";
import type { State } from "..";

const MAX_HISTORY_SIZE = 5;

export type CrosshairState = {
  activeCrosshair: CrosshairConfig | null;
  activeCrosshairHistory: CrosshairConfig[];
  setActiveCrosshair: (config: CrosshairConfig) => void;
  clearActiveCrosshair: () => void;
  getActiveCrosshair: () => CrosshairConfig | null;
};

export const createCrosshairSlice: StateCreator<
  State,
  [],
  [],
  CrosshairState
> = (set, get) => ({
  activeCrosshair: null,
  activeCrosshairHistory: [],
  setActiveCrosshair: (config: CrosshairConfig) =>
    set((state) => {
      const history = state.activeCrosshairHistory;
      const configString = JSON.stringify(config);

      const filteredHistory = history.filter(
        (item) => JSON.stringify(item) !== configString,
      );

      const newHistory = [config, ...filteredHistory].slice(
        0,
        MAX_HISTORY_SIZE,
      );
      return {
        activeCrosshair: config,
        activeCrosshairHistory: newHistory,
      };
    }),
  clearActiveCrosshair: () =>
    set(() => ({
      activeCrosshair: null,
    })),
  getActiveCrosshair: () => {
    return get().activeCrosshair;
  },
});
