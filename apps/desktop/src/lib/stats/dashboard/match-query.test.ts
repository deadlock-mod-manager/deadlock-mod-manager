import { describe, expect, it } from "bun:test";
import type { z } from "zod";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { matchQuerySchema } from "./layout";
import { GROUP_FIELD, runMatchQuery } from "./match-query";

const HOUR = 3600;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000 + 30 * DAY;

let nextMatchId = 0;
const makeMatch = (
  overrides: Partial<MatchHistoryEntry> = {},
): MatchHistoryEntry => ({
  account_id: 1,
  match_id: ++nextMatchId,
  hero_id: 15,
  hero_level: 20,
  start_time: 1_700_000_000,
  game_mode: 1,
  match_mode: 1,
  player_team: 0,
  player_kills: 6,
  player_deaths: 3,
  player_assists: 9,
  denies: 4,
  net_worth: 30_000,
  last_hits: 120,
  match_duration_s: 1800,
  match_result: 0,
  team_abandoned: false,
  abandoned_time_s: 0,
  objectives_mask_team0: 0,
  objectives_mask_team1: 0,
  ranked_display_badge: null,
  ranked_delta: null,
  ranked_calibration_match: null,
  ...overrides,
});

const win = (overrides: Partial<MatchHistoryEntry> = {}) =>
  makeMatch({ player_team: 0, match_result: 0, ...overrides });
const loss = (overrides: Partial<MatchHistoryEntry> = {}) =>
  makeMatch({ player_team: 0, match_result: 1, ...overrides });

const query = (input: z.input<typeof matchQuerySchema>) =>
  matchQuerySchema.parse(input);

describe("runMatchQuery", () => {
  it("returns a single row when nothing is grouped", () => {
    const result = runMatchQuery(
      [win(), win(), loss()],
      query({ metrics: ["winrate", "matches"] }),
      NOW,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.winrate).toBeCloseTo(2 / 3);
    expect(result.rows[0]?.matches).toBe(3);
    expect(result.fields.map((field) => field.key)).toEqual([
      "winrate",
      "matches",
    ]);
  });

  it("pools KDA instead of averaging per-match ratios", () => {
    const result = runMatchQuery(
      [
        win({ player_kills: 10, player_assists: 0, player_deaths: 0 }),
        loss({ player_kills: 0, player_assists: 0, player_deaths: 10 }),
      ],
      query({ metrics: ["kda"] }),
      NOW,
    );
    // (10 + 0) / 10 deaths, not the mean of 10 and 0.
    expect(result.rows[0]?.kda).toBe(1);
  });

  it("applies the chosen aggregate to per-match values", () => {
    const matches = [
      win({ player_kills: 2 }),
      win({ player_kills: 10 }),
      loss({ player_kills: 3 }),
    ];
    const max = runMatchQuery(
      matches,
      query({ metrics: ["kills"], aggregate: "max" }),
      NOW,
    );
    const median = runMatchQuery(
      matches,
      query({ metrics: ["kills"], aggregate: "median" }),
      NOW,
    );
    expect(max.rows[0]?.kills).toBe(10);
    expect(median.rows[0]?.kills).toBe(3);
  });

  it("groups by hero", () => {
    const result = runMatchQuery(
      [win({ hero_id: 1 }), loss({ hero_id: 1 }), win({ hero_id: 2 })],
      query({ metrics: ["winrate", "matches"], groupBy: "hero" }),
      NOW,
    );
    expect(result.fields[0]).toMatchObject({
      key: GROUP_FIELD,
      format: "hero",
    });
    expect(result.rows).toEqual([
      { [GROUP_FIELD]: 1, winrate: 0.5, matches: 2 },
      { [GROUP_FIELD]: 2, winrate: 1, matches: 1 },
    ]);
  });

  it("orders weekdays Monday first", () => {
    // 2023-11-12 was a Sunday, 2023-11-13 a Monday (local noon avoids TZ edges).
    const sunday = new Date(2023, 10, 12, 12).getTime() / 1000;
    const monday = new Date(2023, 10, 13, 12).getTime() / 1000;
    const result = runMatchQuery(
      [win({ start_time: sunday }), win({ start_time: monday })],
      query({ metrics: ["matches"], groupBy: "weekday" }),
      NOW,
    );
    expect(result.rows.map((row) => row[GROUP_FIELD])).toEqual([1, 0]);
  });

  it("keeps the newest N matches before filtering by result", () => {
    const matches = [
      win({ start_time: NOW - 3 * DAY }),
      loss({ start_time: NOW - 2 * DAY }),
      win({ start_time: NOW - DAY }),
    ];
    const result = runMatchQuery(
      matches,
      query({ metrics: ["matches"], lastMatches: 2, result: "wins" }),
      NOW,
    );
    expect(result.rows[0]?.matches).toBe(1);
  });

  it("drops matches outside the period", () => {
    const result = runMatchQuery(
      [win({ start_time: NOW - 40 * DAY }), win({ start_time: NOW - DAY })],
      query({ metrics: ["matches"], sinceDays: 30 }),
      NOW,
    );
    expect(result.rows[0]?.matches).toBe(1);
  });

  it("only emits a smoothed point once its window is full", () => {
    const matches = [0, 1, 2, 3].map((index) =>
      (index % 2 === 0 ? win : loss)({ start_time: NOW - (10 - index) * HOUR }),
    );
    const result = runMatchQuery(
      matches,
      query({ metrics: ["winrate"], groupBy: "match", smoothing: 2 }),
      NOW,
    );
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((row) => row.winrate === 0.5)).toBe(true);
  });

  it("skips matches without a rank for rank metrics", () => {
    const result = runMatchQuery(
      [win({ ranked_display_badge: 42 }), win()],
      query({ metrics: ["rankBadge"], aggregate: "max" }),
      NOW,
    );
    expect(result.rows[0]?.rankBadge).toBe(42);
  });
});
