import { describe, expect, it } from "bun:test";
import { matchHistoryEntrySchema } from "@/lib/validation/stats-api";
import { localOnlyMatches, mergeHeroStats, mergeLocalMatches } from "./derive";
import {
  ALL_STATS_SCOPE,
  filterStatsMatches,
  statsScopeQuery,
  statsSinceTimestamp,
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
      filterStatsMatches(matches, { mode: "ranked", since: 200 }).map(
        (match) => match.match_id,
      ),
    ).toEqual([2, 3]);
    expect(
      filterStatsMatches(matches, { mode: "ranked", since: 201 }).map(
        (match) => match.match_id,
      ),
    ).toEqual([3]);
  });

  it("identifies unranked by match mode even when a badge is present", () => {
    expect(
      filterStatsMatches(matches, { mode: "unranked", since: 0 }).map(
        (match) => match.match_id,
      ),
    ).toEqual([1]);
    expect(
      filterStatsMatches(matches, { mode: "unranked", since: 101 }),
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
    const scope: StatsScope = { mode: "ranked", since: 200 };
    const history = filterStatsMatches(mergeLocalMatches(api, local), scope);
    const extra = filterStatsMatches(localOnlyMatches(api, local), scope);
    expect(history.map((match) => match.match_id).sort()).toEqual([2, 3]);
    const heroes = mergeHeroStats([], extra);
    expect(heroes[0]?.matches_played).toBe(1);
  });

  it("overrides the upstream 30-day analytics default for all history", () => {
    const query = new URLSearchParams(statsScopeQuery(ALL_STATS_SCOPE));
    expect(query.get("game_mode")).toBe("normal");
    expect(query.get("match_mode")).toBe("ranked,unranked");
    expect(query.get("min_unix_timestamp")).toBe("0");
  });

  it("uses separate cache scopes for different modes and dates", () => {
    const scopes: StatsScope[] = [
      ALL_STATS_SCOPE,
      { mode: "ranked", since: 0 },
      { mode: "unranked", since: 0 },
      { mode: "ranked", since: 200 },
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
});
