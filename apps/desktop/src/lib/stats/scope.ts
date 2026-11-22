import type { MatchHistoryEntry } from "@/lib/stats/api";

export type StatsMatchMode = "all" | "ranked" | "unranked";

export interface StatsScope {
  mode: StatsMatchMode;
  since: number;
}

export const ALL_STATS_SCOPE: StatsScope = { mode: "all", since: 0 };

export const isStatsMatchMode = (value: string): value is StatsMatchMode =>
  value === "all" || value === "ranked" || value === "unranked";

export const statsScopeQuery = (scope: StatsScope): string => {
  const query = new URLSearchParams({
    game_mode: "normal",
    match_mode: scope.mode === "all" ? "ranked,unranked" : scope.mode,
  });
  // Without a picked date each endpoint keeps its own default window. An explicit
  // zero asked for all of history, which the global benchmarks cannot answer in time.
  if (scope.since > 0) {
    query.set("min_unix_timestamp", String(scope.since));
  }
  return query.toString();
};

export const statsSinceTimestamp = (date: string): number => {
  if (!date) return 0;
  const timestamp = new Date(`${date}T00:00:00`).getTime() / 1000;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

// Valve's ECitadelGameMode_Normal = 1, Unranked = 1 and Ranked = 4.
// A rank badge is optional during placements, so it cannot identify the mode.
export const filterStatsMatches = <
  T extends Pick<MatchHistoryEntry, "game_mode" | "match_mode" | "start_time">,
>(
  matches: T[],
  scope: StatsScope,
): T[] =>
  matches.filter(
    (match) =>
      match.game_mode === 1 &&
      (scope.mode === "all"
        ? match.match_mode === 1 || match.match_mode === 4
        : match.match_mode === (scope.mode === "ranked" ? 4 : 1)) &&
      match.start_time >= scope.since,
  );
