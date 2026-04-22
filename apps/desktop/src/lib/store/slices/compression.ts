import type { StateCreator } from "zustand";
import type { State } from "..";

export type CompressionProgress = {
  status: "idle" | "merging" | "extracting" | "paused";
  current: number;
  total: number;
  currentModName: string | null;
};

export type CompressionSliceState = {
  compressionEnabled: boolean;
  compressionProgress: CompressionProgress;
  setCompressionEnabled: (enabled: boolean) => void;
  setCompressionProgress: (patch: Partial<CompressionProgress>) => void;
};

export const createCompressionSlice: StateCreator<
  State,
  [],
  [],
  CompressionSliceState
> = (set) => ({
  compressionEnabled: false,
  compressionProgress: {
    status: "idle",
    current: 0,
    total: 0,
    currentModName: null,
  },
  setCompressionEnabled: (enabled) => set({ compressionEnabled: enabled }),
  setCompressionProgress: (patch) =>
    set((s) => ({
      compressionProgress: { ...s.compressionProgress, ...patch },
    })),
});
