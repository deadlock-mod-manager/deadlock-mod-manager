import type { StateCreator } from "zustand";
import type { SessionFingerprint } from "@/types/generated/SessionFingerprint";
import type { State } from "..";

const MAX_ACKNOWLEDGED_SESSIONS = 50;

export type LaunchHealthState = {
  crashCheckEnabled: boolean;
  lastNormalFingerprint: SessionFingerprint | null;
  acknowledgedSessionIds: string[];
  setCrashCheckEnabled: (enabled: boolean) => void;
  setLastNormalFingerprint: (fingerprint: SessionFingerprint) => void;
  markSessionAcknowledged: (sessionId: string) => void;
};

export const launchHealthDeepMergeKeys =
  [] as const satisfies readonly (keyof LaunchHealthState)[];

export const createLaunchHealthSlice: StateCreator<
  State,
  [],
  [],
  LaunchHealthState
> = (set) => ({
  crashCheckEnabled: true,
  lastNormalFingerprint: null,
  acknowledgedSessionIds: [],
  setCrashCheckEnabled: (enabled) => set({ crashCheckEnabled: enabled }),
  setLastNormalFingerprint: (fingerprint) =>
    set({ lastNormalFingerprint: fingerprint }),
  markSessionAcknowledged: (sessionId) =>
    set((state) =>
      state.acknowledgedSessionIds.includes(sessionId)
        ? {}
        : {
            acknowledgedSessionIds: [
              ...state.acknowledgedSessionIds,
              sessionId,
            ].slice(-MAX_ACKNOWLEDGED_SESSIONS),
          },
    ),
});
