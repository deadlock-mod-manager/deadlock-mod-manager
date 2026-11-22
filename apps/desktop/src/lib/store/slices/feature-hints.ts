import type { StateCreator } from "zustand";
import {
  DEFAULT_FEATURE_HINTS_PROGRESS,
  type FeatureHintCounter,
  type FeatureHintId,
  type FeatureHintsProgress,
  HINT_MAX_IGNORES,
} from "@/lib/feature-hints";
import type { State } from "..";

export type FeatureHintsState = {
  featureHints: FeatureHintsProgress;
  setFeatureHintsEnabled: (enabled: boolean) => void;
  startFeatureHints: () => void;
  markFeatureHintSeen: (id: FeatureHintId) => void;
  markFeatureUsed: (id: FeatureHintId) => void;
  retireFeatureHint: (id: FeatureHintId) => void;
  ignoreFeatureHint: (id: FeatureHintId) => void;
  countFeatureHintEvent: (counter: FeatureHintCounter) => void;
  resetFeatureHints: () => void;
};

export const featureHintsDeepMergeKeys = [
  "featureHints",
] as const satisfies readonly (keyof FeatureHintsState)[];

export const createFeatureHintsSlice: StateCreator<
  State,
  [],
  [],
  FeatureHintsState
> = (set) => {
  const update = (
    recipe: (progress: FeatureHintsProgress) => Partial<FeatureHintsProgress>,
  ) =>
    set((state) => ({
      featureHints: { ...state.featureHints, ...recipe(state.featureHints) },
    }));

  return {
    featureHints: DEFAULT_FEATURE_HINTS_PROGRESS,

    setFeatureHintsEnabled: (enabled) => update(() => ({ enabled })),

    startFeatureHints: () =>
      set((state) =>
        state.featureHints.startedAt === null
          ? {
              featureHints: { ...state.featureHints, startedAt: Date.now() },
            }
          : state,
      ),

    markFeatureHintSeen: (id) =>
      set((state) =>
        state.featureHints.firstSeenAt[id] === undefined
          ? {
              featureHints: {
                ...state.featureHints,
                firstSeenAt: {
                  ...state.featureHints.firstSeenAt,
                  [id]: Date.now(),
                },
              },
            }
          : state,
      ),

    markFeatureUsed: (id) =>
      set((state) =>
        state.featureHints.used[id]
          ? state
          : {
              featureHints: {
                ...state.featureHints,
                used: { ...state.featureHints.used, [id]: true },
              },
            },
      ),

    retireFeatureHint: (id) =>
      update(({ retired }) => ({ retired: { ...retired, [id]: true } })),

    ignoreFeatureHint: (id) =>
      update(({ ignoredCount, retired }) => {
        const count = (ignoredCount[id] ?? 0) + 1;
        return {
          ignoredCount: { ...ignoredCount, [id]: count },
          retired:
            count >= HINT_MAX_IGNORES ? { ...retired, [id]: true } : retired,
        };
      }),

    countFeatureHintEvent: (counter) =>
      update(({ counters }) => ({
        counters: { ...counters, [counter]: (counters[counter] ?? 0) + 1 },
      })),

    // Brings every hint back without waiting out the first-run quiet period
    // again.
    resetFeatureHints: () =>
      update(() => ({
        enabled: true,
        used: {},
        retired: {},
        ignoredCount: {},
      })),
  };
};
