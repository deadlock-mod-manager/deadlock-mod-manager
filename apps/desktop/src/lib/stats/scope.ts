import type { MatchHistoryEntry, RankedSeason } from "@/lib/stats/api";

export type StatsMatchMode = "all" | "ranked" | "unranked";

export interface StatsScope {
  mode: StatsMatchMode;
  since: number;
  /** The first second after the window, or 0 for no end. */
  until: number;
}

export const ALL_STATS_SCOPE: StatsScope = { mode: "all", since: 0, until: 0 };

/** A ranked season as a window the filter can pick. */
export interface SeasonWindow {
  id: string;
  name: string;
  since: number;
  until: number;
  isRunning: boolean;
}

/** What the time filter holds: a season, or a custom start and end date. */
export type StatsRange =
  | { kind: "dates"; sinceDate: string; untilDate: string }
  | { kind: "season"; id: string };

export const ALL_TIME_RANGE: StatsRange = {
  kind: "dates",
  sinceDate: "",
  untilDate: "",
};

export const isStatsMatchMode = (value: string): value is StatsMatchMode =>
  value === "all" || value === "ranked" || value === "unranked";

// What deadlock-api's analytics endpoints count when no start is given.
const ANALYTICS_DEFAULT_WINDOW_S = 30 * 24 * 60 * 60;

const scopeQuery = (scope: StatsScope, since: number): string => {
  const query = new URLSearchParams({
    game_mode: "normal",
    match_mode: scope.mode === "all" ? "ranked,unranked" : scope.mode,
  });
  // Without a picked date each endpoint keeps its own default window. An explicit
  // zero asked for all of history, which the global benchmarks cannot answer in time.
  if (since > 0) {
    query.set("min_unix_timestamp", String(since));
  }
  // deadlock-api's end is inclusive.
  if (scope.until > 0) {
    query.set("max_unix_timestamp", String(scope.until - 1));
  }
  return query.toString();
};

export const statsScopeQuery = (scope: StatsScope): string =>
  scopeQuery(scope, scope.since);

/**
 * For the analytics endpoints, which count the last 30 days when no start is
 * given: with only an end picked, that would be the 30 days before today and
 * empty for an older end, so the same 30 days move back to end there instead.
 */
export const analyticsScopeQuery = (scope: StatsScope): string =>
  scopeQuery(
    scope,
    scope.since === 0 && scope.until > 0
      ? scope.until - ANALYTICS_DEFAULT_WINDOW_S
      : scope.since,
  );

export const statsSinceTimestamp = (date: string): number => {
  if (!date) return 0;
  const timestamp = new Date(`${date}T00:00:00`).getTime() / 1000;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

/** The local midnight after `date`, so the whole picked day is kept. */
export const statsUntilTimestamp = (date: string): number => {
  const day = new Date(`${date}T00:00:00`);
  if (!date || Number.isNaN(day.getTime())) return 0;
  return (
    new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime() /
    1000
  );
};

/** A season no longer in the list leaves the window open, as All time does. */
export const statsRangeWindow = (
  range: StatsRange,
  seasons: SeasonWindow[],
): Pick<StatsScope, "since" | "until"> => {
  if (range.kind === "dates") {
    return {
      since: statsSinceTimestamp(range.sinceDate),
      until: statsUntilTimestamp(range.untilDate),
    };
  }
  const season = seasons.find((entry) => entry.id === range.id);
  return season
    ? { since: season.since, until: season.until }
    : { since: 0, until: 0 };
};

const isDate = (unix: number) => !Number.isNaN(new Date(unix * 1000).getTime());

/**
 * The seasons that have started, newest first. A season can run in several
 * intervals, and covers the span from its first to its last.
 */
export const seasonWindows = (
  seasons: RankedSeason[],
  nowUnix: number,
): SeasonWindow[] =>
  seasons
    .flatMap((season) => {
      if (season.intervals.length === 0) return [];
      const since = Math.min(
        ...season.intervals.map((interval) => interval.start_timestamp),
      );
      const until = Math.max(
        ...season.intervals.map((interval) => interval.end_timestamp),
      );
      // The picker keys options by id and shows the first and last second as
      // dates, so a row without an id or such a span can't be offered.
      if (
        !season.class_name ||
        until - 1 < since ||
        since > nowUnix ||
        !isDate(since) ||
        !isDate(until)
      )
        return [];
      return [
        {
          id: season.class_name,
          name: season.name,
          since,
          until,
          isRunning: until > nowUnix,
        },
      ];
    })
    .sort((a, b) => b.since - a.since);

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
      match.start_time >= scope.since &&
      (scope.until === 0 || match.start_time < scope.until),
  );
