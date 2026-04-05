import type { StateCreator } from "zustand";
import type { State } from "..";

export type FileserverPreference = "default" | "auto" | string;

export type NetworkState = {
  fileserverPreference: FileserverPreference;
  fileserverLatencyMs: Record<string, number>;
  setFileserverPreference: (pref: FileserverPreference) => void;
  setFileserverLatencyMs: (latencies: Record<string, number>) => void;
};

export const createNetworkSlice: StateCreator<State, [], [], NetworkState> = (
  set,
) => ({
  fileserverPreference: "default",
  fileserverLatencyMs: {},
  setFileserverPreference: (pref: FileserverPreference) =>
    set(() => ({ fileserverPreference: pref })),
  setFileserverLatencyMs: (latencies: Record<string, number>) =>
    set(() => ({ fileserverLatencyMs: latencies })),
});
