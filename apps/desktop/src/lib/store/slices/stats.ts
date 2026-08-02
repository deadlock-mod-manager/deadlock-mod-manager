import type { StateCreator } from "zustand";
import type { State } from "..";

export type StatsState = {
  /**
   * Steam3 account id the Stats page shows. `null` follows whichever account
   * Steam is currently signed in with; a value pins an explicit choice, which is
   * also how a manually entered id survives a restart.
   */
  statsAccountId: number | null;
  setStatsAccountId: (accountId: number | null) => void;
  /**
   * deadlock-api key from a Patreon subscription. Lifts the shared IP rate
   * limits to per-key ones, which is what makes the live broadcast usable
   * across several matches in a row.
   */
  deadlockApiKey: string | null;
  setDeadlockApiKey: (key: string | null) => void;
};

export const statsDeepMergeKeys =
  [] as const satisfies readonly (keyof StatsState)[];

export const createStatsSlice: StateCreator<State, [], [], StatsState> = (
  set,
) => ({
  statsAccountId: null,
  deadlockApiKey: null,

  setStatsAccountId: (accountId) => set({ statsAccountId: accountId }),

  setDeadlockApiKey: (key) =>
    set({ deadlockApiKey: key?.trim() ? key.trim() : null }),
});
