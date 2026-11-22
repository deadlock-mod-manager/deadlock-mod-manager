import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import i18n from "@/lib/i18n";
import logger from "@/lib/logger";

export type LaunchStep =
  | "randomizingSkins"
  | "randomizingMods"
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
  current: LaunchStep | null;
  modCount: number;
  hidden: boolean;
};

type LaunchProgressState = {
  progress: LaunchProgress | null;
  cancelled: boolean;
  attempt: number;
  cancelsPending: number;
  cancelAccepted: boolean;
  begin: () => void;
  start: (steps: LaunchStep[], modCount: number) => void;
  setModCount: (modCount: number) => void;
  advance: (step: LaunchStep | null) => void;
  hide: () => void;
  cancel: () => Promise<void>;
  clear: () => void;
};

export const useLaunchProgress = create<LaunchProgressState>()((set, get) => ({
  progress: null,
  cancelled: false,
  attempt: 0,
  cancelsPending: 0,
  cancelAccepted: false,
  begin: () =>
    set(({ attempt }) => ({
      cancelled: false,
      cancelAccepted: false,
      cancelsPending: 0,
      attempt: attempt + 1,
    })),
  start: (steps, modCount) =>
    set({
      progress: { steps, current: steps[0] ?? null, modCount, hidden: false },
    }),
  setModCount: (modCount) =>
    set(({ progress }) =>
      progress ? { progress: { ...progress, modCount } } : {},
    ),
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
  cancel: async () => {
    const attempt = get().attempt;
    set(({ cancelsPending }) => ({
      cancelled: true,
      cancelsPending: cancelsPending + 1,
    }));
    const settle = (accepted: boolean) => {
      if (get().attempt !== attempt) return;
      set(({ cancelsPending, cancelAccepted }) => {
        const pending = cancelsPending - 1;
        if (accepted) {
          return {
            progress: null,
            cancelled: true,
            cancelAccepted: true,
            cancelsPending: pending,
          };
        }
        return {
          cancelled: cancelAccepted || pending > 0,
          cancelsPending: pending,
        };
      });
    };
    try {
      await invoke<void>("cancel_launch");
      settle(true);
    } catch (error) {
      settle(false);
      logger
        .withMetadata({ step: get().progress?.current })
        .withError(error)
        .error("Failed to cancel launch");
      toast.error(i18n.t("launch.cancelFailed"));
    }
  },
  clear: () => set({ progress: null }),
}));
