import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

/** Steps reported by `useLaunch` and the backend `launch-progress` event. */
export type LaunchStep =
  | "randomizingSkins"
  | "disablingMods"
  | "verifyingMods"
  | "checkingCompatibility"
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
  /** Set by `cancel` and read by `useLaunch` before it hands off to Steam. */
  cancelled: boolean;
  begin: () => void;
  start: (steps: LaunchStep[], modCount: number) => void;
  advance: (step: LaunchStep | null) => void;
  hide: () => void;
  cancel: () => void;
  clear: () => void;
};

export const useLaunchProgress = create<LaunchProgressState>()((set) => ({
  progress: null,
  cancelled: false,
  begin: () => set({ cancelled: false }),
  start: (steps, modCount) =>
    set({
      progress: { steps, current: steps[0] ?? null, modCount, hidden: false },
    }),
  advance: (step) =>
    set(({ progress }) => {
      if (!progress) return {};
      let steps = progress.steps;
      if (step === "mergingModData" && !steps.includes(step)) {
        const check = steps.indexOf("checkingCompatibility");
        if (check === -1) return {};
        steps = [...steps];
        steps.splice(check + 1, 0, step);
      }
      return step === null || steps.includes(step)
        ? { progress: { ...progress, steps, current: step } }
        : {};
    }),
  hide: () =>
    set(({ progress }) =>
      progress ? { progress: { ...progress, hidden: true } } : {},
    ),
  cancel: () => {
    set({ progress: null, cancelled: true });
    invoke("cancel_launch").catch(() => {});
  },
  clear: () => set({ progress: null }),
}));
