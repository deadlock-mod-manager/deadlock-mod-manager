import { z } from "zod";

/**
 * Schemas for everything api.deadlock-api.com sends the Stats page.
 *
 * The app does arithmetic on these numbers and renders the result, so they are
 * parsed at the network boundary rather than cast. The shapes are deliberately
 * forgiving: only the fields an entry is *identified* by are required, and every
 * counter falls back to zero. deadlock-api adds fields between releases and
 * leaves others unset, and neither should empty a scoreboard.
 */

/** A counter the app sums or averages: absent or malformed reads as zero. */
const count = z.number().optional().default(0).catch(0);
/** A counter Valve leaves unset rather than zeroing, where that difference matters. */
const optionalCount = z.number().nullish().default(null).catch(null);
const text = z.string().optional().default("").catch("");

export const matchHistoryEntrySchema = z.object({
  account_id: count,
  match_id: z.number(),
  hero_id: z.number(),
  hero_level: count,
  start_time: z.number(),
  game_mode: count,
  match_mode: count,
  // Which side the player was on and which side won: `isWin` is the difference
  // between them, so a default would silently turn every match into a loss.
  player_team: z.number(),
  match_result: z.number(),
  player_kills: count,
  player_deaths: count,
  player_assists: count,
  denies: count,
  net_worth: count,
  last_hits: count,
  match_duration_s: count,
  team_abandoned: z.boolean().nullish().default(null).catch(null),
  abandoned_time_s: optionalCount,
  objectives_mask_team0: count,
  objectives_mask_team1: count,
  ranked_display_badge: optionalCount,
  ranked_delta: optionalCount,
  ranked_calibration_match: optionalCount,
});

export const matchMetadataItemSchema = z.object({
  game_time_s: count,
  item_id: z.number(),
  upgrade_id: count,
  sold_time_s: count,
});

export const matchMetadataStatSchema = z.object({
  time_stamp_s: count,
  net_worth: count,
  kills: count,
  deaths: count,
  assists: count,
  player_damage: count,
  player_damage_taken: count,
  player_healing: count,
  damage_mitigated: count,
  boss_damage: count,
  shots_hit: count,
  shots_missed: count,
});

export const matchMetadataPlayerSchema = z.object({
  account_id: z.number(),
  team: count,
  hero_id: z.number(),
  kills: count,
  deaths: count,
  assists: count,
  net_worth: count,
  last_hits: count,
  denies: count,
  level: count,
  // A player with no recorded purchases is a real (if dull) match; an empty
  // build must not drop the whole player off the scoreboard.
  items: z.array(matchMetadataItemSchema).optional().default([]).catch([]),
  stats: z.array(matchMetadataStatSchema).optional().default([]).catch([]),
});

export const matchMetadataSchema = z.object({
  match_info: z.object({
    duration_s: count,
    winning_team: count,
    start_time: count,
    match_id: z.number(),
    players: z
      .array(matchMetadataPlayerSchema)
      .optional()
      .default([])
      .catch([]),
  }),
});

export const playerHeroStatsSchema = z.object({
  account_id: z.number(),
  hero_id: z.number(),
  matches_played: count,
  wins: count,
  last_played: count,
  time_played: count,
  kills: count,
  deaths: count,
  assists: count,
  ending_level: count,
  accuracy: count,
  crit_shot_rate: count,
  denies_per_match: count,
  kills_per_min: count,
  deaths_per_min: count,
  assists_per_min: count,
  denies_per_min: count,
  networth_per_min: count,
  last_hits_per_min: count,
  damage_per_min: count,
  damage_taken_per_min: count,
  damage_mitigated_per_min: count,
  obj_damage_per_min: count,
  total_player_damage: count,
  total_player_damage_taken: count,
  total_boss_damage: count,
  total_creep_damage: count,
  total_neutral_damage: count,
});

export const analyticsHeroStatsSchema = z.object({
  hero_id: z.number(),
  matches: count,
  wins: count,
  losses: count,
  total_kills: count,
  total_deaths: count,
  total_assists: count,
  total_net_worth: count,
  total_last_hits: count,
  total_denies: count,
  total_player_damage: count,
  total_player_damage_taken: count,
  total_boss_damage: count,
  total_shots_hit: count,
  total_shots_missed: count,
});

export const mateStatsSchema = z.object({
  mate_id: z.number(),
  wins: count,
  matches_played: count,
  matches: z.array(z.number()).optional().default([]).catch([]),
});

export const enemyStatsSchema = z.object({
  enemy_id: z.number(),
  wins: count,
  matches_played: count,
  matches: z.array(z.number()).optional().default([]).catch([]),
});

export const steamProfileSchema = z.object({
  account_id: z.number(),
  personaname: text,
  profileurl: text,
  avatar: text,
  avatarmedium: text,
  avatarfull: text,
  realname: z.string().nullish().default(null).catch(null),
  countrycode: z.string().nullish().default(null).catch(null),
  last_updated: text,
  matches_played_last_30d: count,
});

export const lastRankedMatchSchema = z.object({
  match_id: count,
  start_time: count,
  player_rank_initial_display_rank: count,
  player_rank_initial_flat_progress: optionalCount,
  player_rank_final_flat_progress: optionalCount,
  player_rank_desired_progress_change: optionalCount,
  player_rank_initial_calibration_games: optionalCount,
  player_rank_initial_demotion_protection_games: optionalCount,
  player_rank_consumed_demotion_protection: z
    .boolean()
    .nullish()
    .default(null)
    .catch(null),
  player_rank_initial_win_streak: optionalCount,
});

export const playerRankSchema = z.object({
  badge: count,
  rank: count,
  subrank: count,
  last_match: lastRankedMatchSchema.nullish().default(null).catch(null),
});

export const itemStatsSchema = z.object({
  item_id: z.number(),
  matches: count,
  wins: count,
  losses: count,
  players: count,
  avg_buy_time_s: count,
  avg_buy_time_relative: count,
});

export const badgeDistributionEntrySchema = z.object({
  badge_level: z.number(),
  total_matches: count,
  unique_players: count,
});

export const seasonIntervalSchema = z.object({
  interval: count,
  start_timestamp: z.number(),
  end_timestamp: z.number(),
});

export const rankedSeasonSchema = z.object({
  class_name: text,
  name: text,
  ranked_type: text,
  min_wins: count,
  min_hero_wins: count,
  min_hero_unlocks: count,
  calibration_matches: count,
  valid_party_sizes: z.array(z.number()).optional().default([]).catch([]),
  intervals: z.array(seasonIntervalSchema).optional().default([]).catch([]),
});

export const heroCounterStatsSchema = z.object({
  hero_id: z.number(),
  enemy_hero_id: z.number(),
  wins: count,
  matches_played: count,
  kills: count,
  deaths: count,
  assists: count,
  networth: count,
  enemy_kills: count,
  enemy_deaths: count,
  enemy_networth: count,
});

export type MatchHistoryEntry = z.infer<typeof matchHistoryEntrySchema>;
export type MatchMetadataItem = z.infer<typeof matchMetadataItemSchema>;
export type MatchMetadataStat = z.infer<typeof matchMetadataStatSchema>;
export type MatchMetadataPlayer = z.infer<typeof matchMetadataPlayerSchema>;
export type MatchMetadata = z.infer<typeof matchMetadataSchema>;
export type PlayerHeroStats = z.infer<typeof playerHeroStatsSchema>;
export type AnalyticsHeroStats = z.infer<typeof analyticsHeroStatsSchema>;
export type MateStats = z.infer<typeof mateStatsSchema>;
export type EnemyStats = z.infer<typeof enemyStatsSchema>;
export type SteamProfile = z.infer<typeof steamProfileSchema>;
export type LastRankedMatch = z.infer<typeof lastRankedMatchSchema>;
export type PlayerRank = z.infer<typeof playerRankSchema>;
export type ItemStats = z.infer<typeof itemStatsSchema>;
export type BadgeDistributionEntry = z.infer<
  typeof badgeDistributionEntrySchema
>;
export type SeasonInterval = z.infer<typeof seasonIntervalSchema>;
export type RankedSeason = z.infer<typeof rankedSeasonSchema>;
export type HeroCounterStats = z.infer<typeof heroCounterStatsSchema>;
