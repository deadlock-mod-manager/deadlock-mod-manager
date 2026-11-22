import type { StateCreator } from "zustand";
import type { BisectAlgoState } from "@/lib/bisect/search";
import type { ProfileId } from "@/types/profiles";
import type { State } from "..";

/**
 * `applying` and `restoring` outlive their mutation when it fails or the app
 * closes mid-way; the banner then offers to finish them.
 */
type BisectStage =
  | "applying"
  | "ready"
  | "playing"
  | "judging"
  | "result"
  | "restoring";

/** Where an answer was given, so it can be taken back. */
type BisectCheckpoint = {
  algo: BisectAlgoState;
  config: string[];
  round: number;
};

/**
 * Bump when the session shape or the search changes. An older session can't
 * run rounds anymore, only restore, so keep `profileId`, `candidates`,
 * `originalEnabled`, `loadOrder` and `disableOnFinish` readable in every
 * version.
 */
export const BISECT_SESSION_VERSION = 1;

export type BisectSession = {
  version: number;
  profileId: ProfileId;
  startedAt: string;
  /** Every mod enabled when the session started; restored at the end. */
  originalEnabled: string[];
  /** Enabled mods as they were loaded at the start, first to last. */
  loadOrder: string[];
  /** The mods being tested. Anything else is left as it was. */
  candidates: string[];
  algo: BisectAlgoState;
  /** Candidates turned on for the current round. */
  config: string[];
  round: number;
  stage: BisectStage;
  /** Set when launch health saw this round's game crash. */
  crashDetected: boolean;
  culprits: string[] | null;
  /** Culprits the user chose to leave off when restoring. */
  disableOnFinish: string[];
  history: BisectCheckpoint[];
};

export type BisectState = {
  bisectSession: BisectSession | null;
  bisectExplainerSeen: boolean;
  setBisectSession: (session: BisectSession | null) => void;
  updateBisectSession: (patch: Partial<BisectSession>) => void;
  /** Only a round that is being played or waiting for an answer can crash. */
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
