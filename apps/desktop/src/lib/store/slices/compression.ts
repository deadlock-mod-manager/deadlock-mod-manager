import type { StateCreator } from "zustand";
import type { State } from "..";

export type CompressionProgress = {
  status: "idle" | "merging" | "extracting" | "paused";
  current: number;
  total: number;
  currentModName: string | null;
  shardCount: number;
  shardFiles: string[];
};

export type CompressionLevel = "low" | "medium" | "high" | "extreme";

export type CompressionSliceState = {
  compressionEnabled: boolean;
  compressionLevel: CompressionLevel;
  compressionProgress: CompressionProgress;
  setCompressionEnabled: (enabled: boolean) => void;
  setCompressionLevel: (level: CompressionLevel) => void;
  setCompressionProgress: (patch: Partial<CompressionProgress>) => void;
};

export const createCompressionSlice: StateCreator<
  State,
  [],
  [],
  CompressionSliceState
> = (set) => ({
  compressionEnabled: false,
  compressionLevel: "low",
  compressionProgress: {
    status: "idle",
    current: 0,
    total: 0,
    currentModName: null,
    shardCount: 0,
    shardFiles: [],
  },
  setCompressionEnabled: (enabled) => set({ compressionEnabled: enabled }),
  setCompressionLevel: (level) => set({ compressionLevel: level }),
  setCompressionProgress: (patch) =>
    set((s) => ({
      compressionProgress: { ...s.compressionProgress, ...patch },
    })),
});
