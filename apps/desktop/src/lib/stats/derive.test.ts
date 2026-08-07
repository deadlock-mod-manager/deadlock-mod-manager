import { describe, expect, it } from "bun:test";
import type {
  AnalyticsHeroStats,
  ItemStats,
  MatchHistoryEntry,
  MateStats,
  PlayerHeroStats,
} from "@/lib/stats/api";
import {
  benchmarkDeltas,
  chronological,
  generateInsights,
  heroPerformance,
  isWin,
  joinItemStats,
  joinMateStats,
  mergeHeroStats,
  mergeLocalMatches,
  rollingWinrate,
  sessionCurve,
  streaks,
  summarize,
  winrateByHour,
} from "./derive";

const HOUR = 3600;

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
  ...overrides,
});

const win = (overrides: Partial<MatchHistoryEntry> = {}) =>
  makeMatch({ player_team: 0, match_result: 0, ...overrides });
const loss = (overrides: Partial<MatchHistoryEntry> = {}) =>
  makeMatch({ player_team: 0, match_result: 1, ...overrides });

// Zeroed baselines, so a test only has to state the fields it actually asserts on
// without any of them silently arriving as `undefined`.
const makeHeroStats = (
  overrides: Partial<PlayerHeroStats> = {},
): PlayerHeroStats => ({
  account_id: 1,
  hero_id: 15,
  matches_played: 0,
  wins: 0,
  last_played: 0,
  time_played: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  ending_level: 0,
  accuracy: 0,
  crit_shot_rate: 0,
  denies_per_match: 0,
  kills_per_min: 0,
  deaths_per_min: 0,
  assists_per_min: 0,
  denies_per_min: 0,
  networth_per_min: 0,
  last_hits_per_min: 0,
  damage_per_min: 0,
  damage_taken_per_min: 0,
  damage_mitigated_per_min: 0,
  obj_damage_per_min: 0,
  total_player_damage: 0,
  total_player_damage_taken: 0,
  total_boss_damage: 0,
  total_creep_damage: 0,
  total_neutral_damage: 0,
  ...overrides,
});

const makeAnalyticsHeroStats = (
  overrides: Partial<AnalyticsHeroStats> = {},
): AnalyticsHeroStats => ({
  hero_id: 15,
  matches: 0,
  wins: 0,
  losses: 0,
  total_kills: 0,
  total_deaths: 0,
  total_assists: 0,
  total_net_worth: 0,
  total_last_hits: 0,
  total_denies: 0,
  total_player_damage: 0,
  total_player_damage_taken: 0,
  total_boss_damage: 0,
  total_shots_hit: 0,
  total_shots_missed: 0,
  ...overrides,
});

describe("isWin", () => {
  it("treats match_result as the winning team index", () => {
    expect(isWin(makeMatch({ player_team: 1, match_result: 1 }))).toBe(true);
    expect(isWin(makeMatch({ player_team: 1, match_result: 0 }))).toBe(false);
  });
});

describe("chronological", () => {
  it("reverses the newest-first order the API returns without mutating", () => {
    const input = [
      makeMatch({ start_time: 300 }),
      makeMatch({ start_time: 100 }),
    ];
    expect(chronological(input).map((m) => m.start_time)).toEqual([100, 300]);
    expect(input[0].start_time).toBe(300);
  });
});

describe("summarize", () => {
  it("averages per match and derives per-minute rates", () => {
    const summary = summarize([
      win({ player_kills: 10, player_deaths: 2, player_assists: 4 }),
      loss({ player_kills: 0, player_deaths: 8, player_assists: 2 }),
    ]);

    expect(summary.matches).toBe(2);
    expect(summary.wins).toBe(1);
    expect(summary.winrate).toBe(0.5);
    expect(summary.kills).toBe(5);
    expect(summary.kda).toBe((10 + 4 + 0 + 2) / 10);
    // 2 x 30 min, 30k souls each.
    expect(summary.soulsPerMin).toBe(1000);
    expect(summary.avgDurationMin).toBe(30);
  });

  it("counts a deathless run as one death instead of dividing by zero", () => {
    const summary = summarize([
      win({ player_kills: 5, player_deaths: 0, player_assists: 3 }),
    ]);
    expect(summary.kda).toBe(8);
  });

  it("returns zeroes for an empty history", () => {
    expect(summarize([]).matches).toBe(0);
    expect(summarize([]).winrate).toBe(0);
  });
});

describe("rollingWinrate", () => {
  it("stays blank until the window is full, then follows the trailing slice", () => {
    const matches = [
      win({ start_time: 1 }),
      loss({ start_time: 2 }),
      win({ start_time: 3 }),
      win({ start_time: 4 }),
    ];

    const points = rollingWinrate(matches, 3);

    expect(points.map((p) => p.winrate)).toEqual([
      null,
      null,
      2 / 3, // win, loss, win
      2 / 3, // loss, win, win
    ]);
  });
});

describe("streaks", () => {
  it("reports the running streak signed and both records", () => {
    const result = streaks([
      win({ start_time: 1 }),
      win({ start_time: 2 }),
      win({ start_time: 3 }),
      loss({ start_time: 4 }),
      loss({ start_time: 5 }),
    ]);

    expect(result.current).toBe(-2);
    expect(result.longestWin).toBe(3);
    expect(result.longestLoss).toBe(2);
  });
});

/** A local-time timestamp, so the hour buckets are timezone independent. */
const at = (hour: number) =>
  Math.floor(new Date(2024, 0, 15, hour, 0, 0).getTime() / 1000);

describe("winrateByHour", () => {
  it("buckets by the player's local hour", () => {
    const buckets = winrateByHour([
      win({ start_time: at(23) }),
      loss({ start_time: at(23) }),
      win({ start_time: at(10) }),
    ]);

    expect(buckets.find((b) => b.bucket === 23)).toMatchObject({
      matches: 2,
      wins: 1,
      winrate: 0.5,
    });
    expect(buckets.find((b) => b.bucket === 10)?.winrate).toBe(1);
  });
});

describe("sessionCurve", () => {
  it("counts position within a session and restarts after a long break", () => {
    const start = 1_700_000_000;
    const curve = sessionCurve([
      win({ start_time: start }),
      loss({ start_time: start + 1 * HOUR }),
      loss({ start_time: start + 2 * HOUR }),
      // 12h later: a new session, so this is position 1 again.
      win({ start_time: start + 14 * HOUR }),
    ]);

    expect(curve.find((slot) => slot.bucket === 1)).toMatchObject({
      matches: 2,
      wins: 2,
    });
    expect(curve.find((slot) => slot.bucket === 2)?.matches).toBe(1);
    expect(curve.find((slot) => slot.bucket === 3)?.winrate).toBe(0);
  });

  it("caps the position so late-session buckets keep a usable sample size", () => {
    const start = 1_700_000_000;
    const curve = sessionCurve(
      Array.from({ length: 9 }, (_, index) =>
        win({ start_time: start + index * HOUR }),
      ),
    );

    expect(Math.max(...curve.map((slot) => slot.bucket))).toBe(6);
    expect(curve.find((slot) => slot.bucket === 6)?.matches).toBe(4);
  });
});

describe("benchmarkDeltas", () => {
  const mine = makeHeroStats({
    matches_played: 10,
    kills: 100,
    deaths: 50,
    assists: 80,
    time_played: 10 * 30 * 60,
    denies_per_match: 8,
    last_hits_per_min: 5,
    networth_per_min: 1000,
    total_player_damage: 200_000,
  });

  const global = makeAnalyticsHeroStats({
    matches: 1000,
    total_kills: 5000,
    total_deaths: 5000,
    total_assists: 9000,
    total_last_hits: 150_000,
    total_denies: 5000,
    total_net_worth: 25_000_000,
    total_player_damage: 25_000_000,
  });

  it("compares per-match averages on both sides", () => {
    const rows = benchmarkDeltas(mine, global);
    const kills = rows.find((row) => row.metric === "kills");

    // 10 kills/match vs a global 5.
    expect(kills?.mine).toBe(10);
    expect(kills?.global).toBe(5);
    expect(kills?.deltaPct).toBe(1);
  });

  it("marks deaths as a metric where less is better", () => {
    const deaths = benchmarkDeltas(mine, global).find(
      (row) => row.metric === "deaths",
    );
    expect(deaths?.higherIsBetter).toBe(false);
    expect(deaths?.deltaPct).toBe(0);
  });
});

describe("joinMateStats", () => {
  it("compares matches with a mate against the same player's other matches", () => {
    const shared = [
      win({ match_id: 1, start_time: 10 }),
      win({ match_id: 2, start_time: 20 }),
      win({ match_id: 3, start_time: 30 }),
      loss({ match_id: 4, start_time: 40 }),
      loss({ match_id: 5, start_time: 50 }),
    ];
    const alone = [
      loss({ match_id: 6 }),
      loss({ match_id: 7 }),
      loss({ match_id: 8 }),
      loss({ match_id: 9 }),
      win({ match_id: 10 }),
    ];
    const mates: MateStats[] = [
      {
        mate_id: 42,
        wins: 3,
        matches_played: 6,
        // Match 99 is outside our own history and must be ignored.
        matches: [1, 2, 3, 4, 5, 99],
      },
    ];

    const [mate] = joinMateStats(mates, [...shared, ...alone]);

    expect(mate.matchesTogether).toBe(5);
    expect(mate.winrateTogether).toBe(0.6);
    expect(mate.winrateDelta).toBeCloseTo(0.4, 10);
    expect(mate.lastPlayed).toBe(50);
  });

  it("drops mates below the minimum shared matches", () => {
    const matches = [win({ match_id: 1 }), win({ match_id: 2 })];
    const mates: MateStats[] = [
      { mate_id: 7, wins: 2, matches_played: 2, matches: [1, 2] },
    ];

    expect(joinMateStats(mates, matches, 5)).toEqual([]);
  });
});

describe("heroPerformance", () => {
  it("skips heroes without matches and sorts by games played", () => {
    const stats = [
      makeHeroStats({ hero_id: 1, matches_played: 0 }),
      makeHeroStats({
        hero_id: 2,
        matches_played: 5,
        wins: 3,
        kills: 20,
        deaths: 10,
        assists: 30,
      }),
      makeHeroStats({
        hero_id: 3,
        matches_played: 20,
        wins: 10,
        kills: 50,
        deaths: 25,
        assists: 60,
      }),
    ];

    const result = heroPerformance(stats);

    expect(result.map((hero) => hero.heroId)).toEqual([3, 2]);
    expect(result[1].winrate).toBe(0.6);
    expect(result[1].kda).toBe(5);
  });
});

describe("mergeLocalMatches", () => {
  it("adds matches the API has not ingested yet", () => {
    const api = [win({ match_id: 1 }), win({ match_id: 2 })];
    const local = [win({ match_id: 2 }), win({ match_id: 3 })];

    const merged = mergeLocalMatches(api, local);

    expect(merged.map((m) => m.match_id).sort()).toEqual([1, 2, 3]);
  });

  it("keeps the API entry when both know a match", () => {
    const fromApi = win({ match_id: 7, net_worth: 50_000 });
    const merged = mergeLocalMatches(
      [fromApi],
      [win({ match_id: 7, net_worth: 0 })],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].net_worth).toBe(50_000);
  });

  it("returns the API list untouched when there is nothing local", () => {
    const api = [win({ match_id: 1 })];

    expect(mergeLocalMatches(api, [])).toBe(api);
  });
});

describe("mergeHeroStats", () => {
  const heroStats = [
    makeHeroStats({
      matches_played: 10,
      wins: 5,
      kills: 50,
      deaths: 40,
      assists: 60,
      time_played: 18_000,
      last_played: 100,
      networth_per_min: 1000,
    }),
  ];

  it("folds today's matches into the hero the API already knows", () => {
    const [hero] = mergeHeroStats(heroStats, [
      win({
        hero_id: 15,
        player_kills: 10,
        player_deaths: 2,
        player_assists: 4,
        start_time: 500,
      }),
    ]);

    expect(hero.matches_played).toBe(11);
    expect(hero.wins).toBe(6);
    expect(hero.kills).toBe(60);
    expect(hero.last_played).toBe(500);
    // Rates the API computed are left alone rather than guessed at.
    expect(hero.networth_per_min).toBe(1000);
  });

  it("adds a hero that only exists locally so far", () => {
    const merged = mergeHeroStats(heroStats, [
      loss({ hero_id: 99, player_kills: 1, player_deaths: 9 }),
    ]);

    const fresh = merged.find((hero) => hero.hero_id === 99);
    expect(fresh?.matches_played).toBe(1);
    expect(fresh?.wins).toBe(0);
  });

  it("returns the API rows untouched with nothing to merge", () => {
    expect(mergeHeroStats(heroStats, [])).toBe(heroStats);
  });
});

describe("joinItemStats", () => {
  const item = (
    itemId: number,
    matches: number,
    wins: number,
    buyTime: number,
  ): ItemStats => ({
    item_id: itemId,
    matches,
    wins,
    losses: matches - wins,
    players: 1,
    avg_buy_time_s: buyTime,
    avg_buy_time_relative: 30,
  });

  it("compares the player against everyone building the same item", () => {
    const [row] = joinItemStats(
      [item(1, 20, 14, 900)],
      [item(1, 100_000, 50_000, 600)],
    );

    expect(row.winrate).toBe(0.7);
    expect(row.globalWinrate).toBe(0.5);
    expect(row.winrateDelta).toBeCloseTo(0.2, 10);
    // Bought five minutes later than everyone else.
    expect(row.buyTimeDeltaS).toBe(300);
  });

  it("drops items with too few matches to mean anything", () => {
    expect(
      joinItemStats([item(1, 2, 2, 600)], [item(1, 500, 250, 600)]),
    ).toEqual([]);
  });

  it("falls back to the player's own numbers when the item has no baseline", () => {
    const [row] = joinItemStats([item(9, 10, 5, 600)], []);

    expect(row.winrateDelta).toBe(0);
    expect(row.buyTimeDeltaS).toBe(0);
  });
});

describe("generateInsights", () => {
  it("stays quiet when there is not enough history", () => {
    expect(generateInsights([win(), loss()], [])).toEqual([]);
  });

  it("flags a losing streak and a trap hero", () => {
    const start = 1_700_000_000;
    // 20 wins long ago, then 6 straight losses.
    const matches = [
      ...Array.from({ length: 20 }, (_, i) =>
        win({ start_time: start + i * 24 * HOUR }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        loss({ start_time: start + (30 + i) * 24 * HOUR }),
      ),
    ];
    const heroes = heroPerformance([
      makeHeroStats({
        hero_id: 9,
        matches_played: 20,
        wins: 2,
        kills: 10,
        deaths: 40,
        assists: 10,
        last_played: start,
        time_played: 3600,
        accuracy: 0.3,
        networth_per_min: 900,
      }),
    ]);

    const insights = generateInsights(matches, heroes);

    expect(insights.find((i) => i.kind === "streak")).toMatchObject({
      length: 6,
      won: false,
      tone: "bad",
    });
    expect(insights.find((i) => i.kind === "trapHero")).toMatchObject({
      heroId: 9,
      tone: "bad",
    });
  });

  it("adds always-true fallbacks so the card grid never runs short", () => {
    const start = 1_700_000_000;
    // A steady account: nothing deviates enough for a threshold insight.
    const matches = Array.from({ length: 40 }, (_, i) =>
      (i % 2 === 0 ? win : loss)({
        start_time: start + i * 24 * HOUR,
        match_duration_s: 40 * 60,
      }),
    );
    const heroes = heroPerformance([
      makeHeroStats({
        hero_id: 4,
        matches_played: 40,
        wins: 20,
        kills: 200,
        deaths: 200,
        assists: 300,
        last_played: start,
        time_played: 96_000,
        accuracy: 0.5,
        networth_per_min: 1000,
      }),
    ]);

    const insights = generateInsights(matches, heroes);

    expect(insights.map((i) => i.kind)).toEqual(["topHero", "longGames"]);
    expect(insights.find((i) => i.kind === "longGames")).toMatchObject({
      minutes: 35,
      winrate: 0.5,
    });
  });

  it("does not repeat a hero that already has a comfort or trap card", () => {
    const start = 1_700_000_000;
    const matches = Array.from({ length: 20 }, (_, i) =>
      win({ start_time: start + i * 24 * HOUR }),
    );
    const heroes = heroPerformance([
      makeHeroStats({
        hero_id: 9,
        matches_played: 20,
        wins: 2,
        kills: 10,
        deaths: 40,
        assists: 10,
        last_played: start,
        time_played: 3600,
        accuracy: 0.3,
        networth_per_min: 900,
      }),
    ]);

    const kinds = generateInsights(matches, heroes).map((i) => i.kind);

    expect(kinds).toContain("trapHero");
    expect(kinds).not.toContain("topHero");
  });
});
