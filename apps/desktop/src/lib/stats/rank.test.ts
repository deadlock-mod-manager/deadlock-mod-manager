import { describe, expect, it } from "bun:test";
import type {
  BadgeDistributionEntry,
  LastRankedMatch,
  PlayerRank,
  RankedSeason,
} from "@/lib/stats/api";
import {
  activeSeason,
  badgeHistogram,
  badgeStanding,
  badgeToStep,
  rankProgress,
  stepToBadge,
} from "./rank";

const lastMatch = (
  overrides: Partial<LastRankedMatch> = {},
): LastRankedMatch => ({
  match_id: 98_023_373,
  start_time: 1_786_117_940,
  player_rank_initial_display_rank: 86,
  player_rank_initial_flat_progress: 54_025,
  player_rank_final_flat_progress: 54_400,
  player_rank_desired_progress_change: 375,
  player_rank_initial_calibration_games: 0,
  player_rank_initial_demotion_protection_games: 0,
  player_rank_consumed_demotion_protection: false,
  player_rank_initial_win_streak: 0,
  ...overrides,
});

const rank = (overrides: Partial<PlayerRank> = {}): PlayerRank => ({
  badge: 86,
  rank: 8,
  subrank: 6,
  last_match: lastMatch(),
  ...overrides,
});

describe("badgeToStep", () => {
  it("flattens a badge onto the ladder the progress counter counts in", () => {
    // Phantom 6 sits at 54 steps, which is where 54000 progress points land.
    expect(badgeToStep(86)).toBe(54);
    expect(badgeToStep(11)).toBe(7);
    expect(badgeToStep(116)).toBe(72);
  });

  it("round-trips through stepToBadge", () => {
    for (const badge of [11, 16, 21, 55, 86, 101, 116]) {
      expect(stepToBadge(badgeToStep(badge))).toBe(badge);
    }
  });
});

describe("rankProgress", () => {
  it("reads the fraction of a subrank out of the flat progress counter", () => {
    const progress = rankProgress(rank());

    expect(progress).toMatchObject({
      badge: 86,
      nextBadge: 91,
      points: 400,
      delta: 375,
      blockedLoss: null,
    });
    expect(progress?.fraction).toBeCloseTo(0.4);
  });

  it("reports the loss demotion protection absorbed", () => {
    const progress = rankProgress(
      rank({
        last_match: lastMatch({
          player_rank_initial_flat_progress: 54_025,
          player_rank_final_flat_progress: 54_000,
          player_rank_desired_progress_change: -300,
          player_rank_consumed_demotion_protection: true,
        }),
      }),
    );

    expect(progress?.delta).toBe(-25);
    expect(progress?.blockedLoss).toBe(-300);
  });

  it("has nothing to show without a ranked match or a progress counter", () => {
    expect(rankProgress(null)).toBeNull();
    expect(rankProgress(rank({ last_match: null }))).toBeNull();
    expect(
      rankProgress(
        rank({
          last_match: lastMatch({ player_rank_final_flat_progress: null }),
        }),
      ),
    ).toBeNull();
  });

  it("stops at the top of the ladder instead of inventing a next badge", () => {
    const progress = rankProgress(
      rank({
        last_match: lastMatch({ player_rank_final_flat_progress: 72_500 }),
      }),
    );

    expect(progress?.badge).toBe(116);
    expect(progress?.nextBadge).toBeNull();
  });

  it("keeps the bar inside its track past the end of the ladder", () => {
    const progress = rankProgress(
      rank({
        last_match: lastMatch({ player_rank_final_flat_progress: 90_000 }),
      }),
    );

    expect(progress?.badge).toBe(116);
    expect(progress?.points).toBeLessThan(1000);
    expect(progress?.fraction).toBeLessThanOrEqual(1);
  });
});

const distribution: BadgeDistributionEntry[] = [
  { badge_level: 11, total_matches: 0, unique_players: 100 },
  { badge_level: 12, total_matches: 0, unique_players: 200 },
  // The API returns every badge, including the subranks nobody can ever hold.
  { badge_level: 17, total_matches: 0, unique_players: 0 },
  { badge_level: 21, total_matches: 0, unique_players: 700 },
];

describe("badgeStanding", () => {
  it("places a badge in the population, splitting its own bracket", () => {
    const standing = badgeStanding(distribution, 12);

    expect(standing?.atBadge).toBe(200);
    expect(standing?.totalPlayers).toBe(1000);
    // 100 below plus half of the 200 sharing the badge.
    expect(standing?.percentile).toBeCloseTo(0.2);
  });

  it("has no standing for an unranked account or an empty distribution", () => {
    expect(badgeStanding(distribution, 0)).toBeNull();
    expect(badgeStanding([], 12)).toBeNull();
  });
});

describe("badgeHistogram", () => {
  it("collapses the subranks into one bar per tier and marks the player's", () => {
    expect(badgeHistogram(distribution, 21)).toEqual([
      { badge: 11, tier: 1, players: 300, isOwn: false },
      { badge: 21, tier: 2, players: 700, isOwn: true },
    ]);
  });

  it("keeps a rung nobody has reached, so the ladder has no gap in it", () => {
    const withEmptyTier = [
      ...distribution,
      { badge_level: 111, total_matches: 0, unique_players: 0 },
    ];

    expect(badgeHistogram(withEmptyTier, 21).at(-1)).toEqual({
      badge: 111,
      tier: 11,
      players: 0,
      isOwn: false,
    });
  });
});

const season = (name: string, from: number, to: number): RankedSeason => ({
  class_name: name,
  name,
  ranked_type: "normal",
  min_wins: 60,
  min_hero_wins: 15,
  min_hero_unlocks: 3,
  calibration_matches: 8,
  valid_party_sizes: [1, 2],
  intervals: [{ interval: 1, start_timestamp: from, end_timestamp: to }],
});

describe("activeSeason", () => {
  it("prefers the window that is running right now", () => {
    const seasons = [season("past", 100, 200), season("now", 300, 500)];

    expect(activeSeason(seasons, 400)).toMatchObject({
      isRunning: true,
      season: { name: "now" },
    });
  });

  it("falls back to the next season to start", () => {
    const seasons = [season("later", 900, 1000), season("soon", 300, 500)];

    expect(activeSeason(seasons, 200)).toMatchObject({
      isRunning: false,
      season: { name: "soon" },
    });
  });

  it("returns nothing once every season is over", () => {
    expect(activeSeason([season("past", 100, 200)], 9999)).toBeNull();
  });
});
