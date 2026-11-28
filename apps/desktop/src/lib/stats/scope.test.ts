import { describe, expect, it } from "bun:test";
import { matchHistoryEntrySchema } from "@/lib/validation/stats-api";
import { localOnlyMatches, mergeHeroStats, mergeLocalMatches } from "./derive";
import type { RankedSeason } from "@/lib/stats/api";
import {
  ALL_STATS_SCOPE,
  analyticsScopeQuery,
  filterStatsMatches,
  seasonWindows,
  statsRangeWindow,
  statsScopeQuery,
  statsSinceTimestamp,
  statsUntilTimestamp,
  type StatsRange,
  type StatsScope,
} from "./scope";

const matches = [
  {
    match_id: 1,
    game_mode: 1,
    match_mode: 1,
    start_time: 100,
    ranked_display_badge: 86,
  },
  {
    match_id: 2,
    game_mode: 1,
    match_mode: 4,
    start_time: 200,
    ranked_display_badge: null,
  },
  {
    match_id: 3,
    game_mode: 1,
    match_mode: 4,
    start_time: 300,
    ranked_display_badge: 86,
  },
  {
    match_id: 4,
    game_mode: 4,
    match_mode: 1,
    start_time: 400,
    ranked_display_badge: null,
  },
  {
    match_id: 5,
    game_mode: 1,
    match_mode: 2,
    start_time: 500,
    ranked_display_badge: null,
  },
  {
    match_id: 6,
    game_mode: 1,
    match_mode: 3,
    start_time: 600,
    ranked_display_badge: null,
  },
  {
    match_id: 7,
    game_mode: 0,
    match_mode: 0,
    start_time: 700,
    ranked_display_badge: null,
  },
];

const sentWindow = (scope: StatsScope) => {
  const query = new URLSearchParams(statsScopeQuery(scope));
  return [query.get("min_unix_timestamp"), query.get("max_unix_timestamp")];
};

const analyticsStart = (scope: StatsScope) =>
  new URLSearchParams(analyticsScopeQuery(scope)).get("min_unix_timestamp");

const season = (name: string, intervals: [number, number][]): RankedSeason => ({
  class_name: name,
  name,
  ranked_type: "normal",
  min_wins: 60,
  min_hero_wins: 15,
  min_hero_unlocks: 3,
  calibration_matches: 8,
  valid_party_sizes: [1, 2],
  intervals: intervals.map(([start, end], index) => ({
    interval: index + 1,
    start_timestamp: start,
    end_timestamp: end,
  })),
});

describe("Stats match scope", () => {
  it("limits the combined selection to standard ranked and unranked matches", () => {
    expect(
      filterStatsMatches(matches, ALL_STATS_SCOPE).map(
        (match) => match.match_id,
      ),
    ).toEqual([1, 2, 3]);
    expect(matches).toHaveLength(7);
  });

  it("keeps ranked placements without a badge and applies an inclusive cutoff", () => {
    expect(
      filterStatsMatches(matches, { mode: "ranked", since: 200, until: 0 }).map(
        (match) => match.match_id,
      ),
    ).toEqual([2, 3]);
    expect(
      filterStatsMatches(matches, { mode: "ranked", since: 201, until: 0 }).map(
        (match) => match.match_id,
      ),
    ).toEqual([3]);
  });

  it("identifies unranked by match mode even when a badge is present", () => {
    expect(
      filterStatsMatches(matches, { mode: "unranked", since: 0, until: 0 }).map(
        (match) => match.match_id,
      ),
    ).toEqual([1]);
    expect(
      filterStatsMatches(matches, { mode: "unranked", since: 101, until: 0 }),
    ).toEqual([]);
  });

  it("deduplicates local history before applying the same scope to hero totals", () => {
    const rows = matches.map((match) =>
      matchHistoryEntrySchema.parse({
        ...match,
        hero_id: 15,
        player_team: 0,
        match_result: 0,
      }),
    );
    const api = rows.slice(0, 2);
    const local = rows.slice(1);
    const scope: StatsScope = { mode: "ranked", since: 200, until: 0 };
    const history = filterStatsMatches(mergeLocalMatches(api, local), scope);
    const extra = filterStatsMatches(localOnlyMatches(api, local), scope);
    expect(history.map((match) => match.match_id).sort()).toEqual([2, 3]);
    const heroes = mergeHeroStats([], extra);
    expect(heroes[0]?.matches_played).toBe(1);
  });

  it("leaves the start to each endpoint without a picked date", () => {
    const query = new URLSearchParams(statsScopeQuery(ALL_STATS_SCOPE));
    expect(query.get("game_mode")).toBe("normal");
    expect(query.get("match_mode")).toBe("ranked,unranked");
    expect(query.has("min_unix_timestamp")).toBe(false);
  });

  it("uses separate cache scopes for different modes and dates", () => {
    const scopes: StatsScope[] = [
      ALL_STATS_SCOPE,
      { mode: "ranked", since: 0, until: 0 },
      { mode: "unranked", since: 0, until: 0 },
      { mode: "ranked", since: 200, until: 0 },
    ];
    const keys = scopes.map(statsScopeQuery);
    expect(new Set(keys).size).toBe(4);
  });

  it("starts a selected day at local midnight and treats an empty date as all history", () => {
    expect(statsSinceTimestamp("2026-10-17")).toBe(
      new Date(2026, 9, 17).getTime() / 1000,
    );
    expect(statsSinceTimestamp("")).toBe(0);
    expect(statsSinceTimestamp("invalid")).toBe(0);
  });

  it("sends each picked bound, the end as its last included second", () => {
    expect(sentWindow({ mode: "all", since: 100, until: 500 })).toEqual([
      "100",
      "499",
    ]);
    expect(sentWindow({ mode: "all", since: 100, until: 0 })).toEqual([
      "100",
      null,
    ]);
    expect(sentWindow({ mode: "all", since: 0, until: 500 })).toEqual([
      null,
      "499",
    ]);
    expect(sentWindow(ALL_STATS_SCOPE)).toEqual([null, null]);
  });

  it("gives global comparisons the 30 days before an end picked without a start", () => {
    const end = 1_790_000_000;
    expect(analyticsStart({ mode: "all", since: 0, until: end })).toBe(
      String(end - 30 * 86_400),
    );
    expect(
      analyticsStart({ mode: "all", since: 1_780_000_000, until: end }),
    ).toBe("1780000000");
    expect(analyticsStart(ALL_STATS_SCOPE)).toBeNull();
  });

  it("keeps every match of the picked end day and none after it", () => {
    const until = statsUntilTimestamp("2026-11-05");
    expect(until).toBe(new Date(2026, 10, 6).getTime() / 1000);
    expect(statsUntilTimestamp("")).toBe(0);
    expect(statsUntilTimestamp("1970-01-01")).toBe(
      new Date(1970, 0, 2).getTime() / 1000,
    );
    const rows = [
      { match_id: 1, game_mode: 1, match_mode: 1, start_time: until - 1 },
      { match_id: 2, game_mode: 1, match_mode: 1, start_time: until },
    ];
    expect(
      filterStatsMatches(rows, { mode: "all", since: 0, until }).map(
        (match) => match.match_id,
      ),
    ).toEqual([1]);
  });

  it("offers started seasons newest first, each spanning all its intervals", () => {
    const windows = seasonWindows(
      [
        season("split", [
          [300, 400],
          [100, 200],
        ]),
        season("running", [[400, 900]]),
        season("upcoming", [[900, 1000]]),
        season("undated", []),
        season("", [[100, 200]]),
        season("reversed", [[300, 100]]),
        season("instant", [[100, 100]]),
        season("subsecond", [[100, 100.5]]),
        season("fractional", [[100.5, 200.5]]),
        season("unrepresentable", [[-9_000_000_000_000, 200]]),
      ],
      500,
    );
    expect(windows).toEqual([
      {
        id: "running",
        name: "running",
        since: 400,
        until: 900,
        isRunning: true,
      },
      { id: "split", name: "split", since: 100, until: 400, isRunning: false },
    ]);
  });

  it("reads a picked season's window from the current list", () => {
    const range: StatsRange = { kind: "season", id: "picked" };
    const revised = seasonWindows([season("picked", [[200, 250]])], 500);
    expect(statsRangeWindow(range, revised)).toEqual({
      since: 200,
      until: 250,
    });
    expect(statsRangeWindow(range, [])).toEqual({ since: 0, until: 0 });
  });
});
