import type { StateCreator } from "zustand";
import type { BisectAlgoState } from "@/lib/bisect/search";
import type { ProfileId } from "@/types/profiles";
import type { State } from "..";

type BisectStage =
  | "applying"
  | "ready"
  | "playing"
  | "judging"
  | "result"
  | "restoring";

type BisectCheckpoint = {
  algo: BisectAlgoState;
  config: string[];
  round: number;
};

export const BISECT_SESSION_VERSION = 1;

export type BisectSession = {
  version: number;
  profileId: ProfileId;
  startedAt: string;
  originalEnabled: string[];
  loadOrder: string[];
  candidates: string[];
  algo: BisectAlgoState;
  config: string[];
  round: number;
  stage: BisectStage;
  crashDetected: boolean;
  culprits: string[] | null;
  disableOnFinish: string[];
  history: BisectCheckpoint[];
};

export type BisectState = {
  bisectSession: BisectSession | null;
  bisectExplainerSeen: boolean;
  setBisectSession: (session: BisectSession | null) => void;
  updateBisectSession: (patch: Partial<BisectSession>) => void;
  noteBisectCrash: () => void;
  markBisectExplainerSeen: () => void;
};

export const bisectDeepMergeKeys =
  [] as const satisfies readonly (keyof BisectState)[];

export const createBisectSlice: StateCreator<State, [], [], BisectState> = (
  set,
) => ({
  bisectSession: null,
  bisectExplainerSeen: false,
  setBisectSession: (session) => set({ bisectSession: session }),
  updateBisectSession: (patch) =>
    set((state) =>
      state.bisectSession
        ? { bisectSession: { ...state.bisectSession, ...patch } }
        : {},
    ),
  noteBisectCrash: () =>
    set((state) =>
      state.bisectSession?.stage === "playing" ||
      state.bisectSession?.stage === "judging"
        ? { bisectSession: { ...state.bisectSession, crashDetected: true } }
        : {},
    ),
  markBisectExplainerSeen: () => set({ bisectExplainerSeen: true }),
});

export const isCurrentBisectSession = (session: BisectSession) =>
  session.version === BISECT_SESSION_VERSION;
