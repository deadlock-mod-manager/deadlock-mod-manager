import type { StateCreator } from "zustand";
import type { SessionFingerprint } from "@/types/generated/SessionFingerprint";
import type { State } from "..";

/** Enough to never show the same session twice across restarts. */
const MAX_ACKNOWLEDGED_SESSIONS = 50;

export type LaunchHealthState = {
  /** Ask "Did Deadlock just crash?" after an early, abnormal exit. */
  crashCheckEnabled: boolean;
  /** The setup of the last session that ended normally: the diff baseline. */
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
