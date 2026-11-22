import { create } from "zustand";
import type { Grade } from "@/lib/stats/live-grades";

export interface SoulsPoint {
  minutes: number;
  souls: number;
}

const PRACTICE_TRAIL = "practice";

type LiveSession = {
  trails: Record<string, SoulsPoint[]>;
  finalGrades: Record<string, Grade>;
  recordSouls: (matchId: string | null, point: SoulsPoint) => void;
  rememberGrade: (matchId: string, grade: Grade) => void;
};

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
