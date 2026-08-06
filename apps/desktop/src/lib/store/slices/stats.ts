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
   * The patron hint points at something outside the app and nothing here can
   * satisfy it, so re-showing it every visit would only nag. Dismissing is final.
   */
  patronHintDismissed: boolean;
  dismissPatronHint: () => void;
};

export const statsDeepMergeKeys =
  [] as const satisfies readonly (keyof StatsState)[];

export const createStatsSlice: StateCreator<State, [], [], StatsState> = (
  set,
) => ({
  statsAccountId: null,
  patronHintDismissed: false,

  setStatsAccountId: (accountId) => set({ statsAccountId: accountId }),

  dismissPatronHint: () => set({ patronHintDismissed: true }),
});
