import type { StateCreator } from "zustand";
import type { DashboardLayout } from "@/lib/stats/dashboard/layout";
import type { RankRange } from "@/lib/stats/party";
import type { State } from "..";

export type StatsState = {
  statsAccountId: number | null;
  setStatsAccountId: (accountId: number | null) => void;
  statsDashboard: DashboardLayout | null;
  setStatsDashboard: (layout: DashboardLayout | null) => void;
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
  statsDashboard: null,
  partyMembers: [[]],
  partyRankRange: null,

  setStatsAccountId: (accountId) => set({ statsAccountId: accountId }),

  setStatsDashboard: (layout) => set({ statsDashboard: layout }),

  setPartyMembers: (members) => set({ partyMembers: members }),

  setPartyRankRange: (range) => set({ partyRankRange: range }),
});
