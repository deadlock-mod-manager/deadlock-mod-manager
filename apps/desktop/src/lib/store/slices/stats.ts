import type { StateCreator } from "zustand";
import type { DashboardLayout } from "@/lib/stats/dashboard/layout";
import type { RankRange } from "@/lib/stats/party";
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
  /** The user's Stats dashboard; `null` is the built-in default. */
  statsDashboard: DashboardLayout | null;
  setStatsDashboard: (layout: DashboardLayout | null) => void;
  /**
   * The Party tab's players, each with the heroes they offer in queue. Kept
   * because a party tends to queue together again.
   */
  partyMembers: number[][];
  setPartyMembers: (members: number[][]) => void;
  partyRankRange: RankRange;
  setPartyRankRange: (range: RankRange) => void;
};

export const statsDeepMergeKeys =
  [] as const satisfies readonly (keyof StatsState)[];

export const createStatsSlice: StateCreator<State, [], [], StatsState> = (
  set,
) => ({
  statsAccountId: null,
  patronHintDismissed: false,
  statsDashboard: null,
  partyMembers: [[]],
  partyRankRange: null,

  setStatsAccountId: (accountId) => set({ statsAccountId: accountId }),

  dismissPatronHint: () => set({ patronHintDismissed: true }),

  setStatsDashboard: (layout) => set({ statsDashboard: layout }),

  setPartyMembers: (members) => set({ partyMembers: members }),

  setPartyRankRange: (range) => set({ partyRankRange: range }),
});
