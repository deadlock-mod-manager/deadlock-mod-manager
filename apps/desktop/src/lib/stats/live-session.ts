import { create } from "zustand";
import type { Grade } from "@/lib/stats/live-grades";

export interface SoulsPoint {
  minutes: number;
  souls: number;
}

/** Trails of bot and practice matches, which log no match id. */
const PRACTICE_TRAIL = "practice";

type LiveSession = {
  /**
   * The local player's souls at every report, by match. The bridge only ever
   * says what the top bar shows now, so the history is ours to keep.
   */
  trails: Record<string, SoulsPoint[]>;
  /**
   * The overall grade each match ended on, by match id, so the queue screen
   * can show how the last match went before the API has it.
   */
  finalGrades: Record<string, Grade>;
  recordSouls: (matchId: string | null, point: SoulsPoint) => void;
  rememberGrade: (matchId: string, grade: Grade) => void;
};

/** What the Live tab remembers for the rest of the app session. */
export const useLiveSession = create<LiveSession>()((set) => ({
  trails: {},
  finalGrades: {},
  recordSouls: (matchId, point) =>
    set((state) => {
      const key = matchId ?? PRACTICE_TRAIL;
      const trail = state.trails[key] ?? [];
      const last = trail.at(-1);
      return last && last.minutes >= point.minutes
        ? state
        : { trails: { ...state.trails, [key]: [...trail, point] } };
    }),
  rememberGrade: (matchId, grade) =>
    set((state) =>
      state.finalGrades[matchId] === grade
        ? state
        : { finalGrades: { ...state.finalGrades, [matchId]: grade } },
    ),
}));

const NO_TRAIL: SoulsPoint[] = [];

export const soulsTrailOf = (
  trails: Record<string, SoulsPoint[]>,
  matchId: string | null,
): SoulsPoint[] => trails[matchId ?? PRACTICE_TRAIL] ?? NO_TRAIL;
