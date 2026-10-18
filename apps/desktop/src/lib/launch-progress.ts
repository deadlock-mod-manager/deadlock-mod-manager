import { create } from "zustand";

/** Steps reported by `useLaunch` and the backend `launch-progress` event. */
export type LaunchStep =
  | "randomizingSkins"
  | "disablingMods"
  | "verifyingMods"
  | "mergingModData"
  | "writingSearchPaths"
  | "applyingPerformance"
  | "openingSteam"
  | "waitingForGame";

type LaunchProgress = {
  steps: LaunchStep[];
  /** Null once every step has finished. */
  current: LaunchStep | null;
  modCount: number;
  hidden: boolean;
};

type LaunchProgressState = {
  progress: LaunchProgress | null;
  start: (steps: LaunchStep[], modCount: number) => void;
  advance: (step: LaunchStep | null) => void;
  hide: () => void;
  clear: () => void;
};

export const useLaunchProgress = create<LaunchProgressState>()((set) => ({
  progress: null,
  start: (steps, modCount) =>
    set({
      progress: { steps, current: steps[0] ?? null, modCount, hidden: false },
    }),
  advance: (step) =>
    set(({ progress }) =>
      progress && (step === null || progress.steps.includes(step))
        ? { progress: { ...progress, current: step } }
        : {},
    ),
  hide: () =>
    set(({ progress }) =>
      progress ? { progress: { ...progress, hidden: true } } : {},
    ),
  clear: () => set({ progress: null }),
}));
