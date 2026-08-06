import { ASSETS_BASE_URL, DeadlockApiError } from "@/lib/deadlock-api";
import { fetch } from "@/lib/fetch";
import {
  parseList,
  type RankAsset,
  rankAssetSchema,
} from "@/lib/validation/deadlock-api";

export { DeadlockApiError };
export type { RankAsset };

const BASE_URL = "https://api.deadlock-api.com";

// Endpoints deliberately avoided: /card and /account-stats are Patreon-only and
// capped at 5 req/min per IP, and match-history?force_refetch=true is 1 req/h.
// Everything used here is 100 req/s per IP (players) or 200 req/min (analytics).

export interface MatchHistoryEntry {
  account_id: number;
  match_id: number;
  hero_id: number;
  hero_level: number;
  start_time: number;
  game_mode: number;
  match_mode: number;
  player_team: number;
  player_kills: number;
  player_deaths: number;
  player_assists: number;
  denies: number;
  net_worth: number;
  last_hits: number;
  match_duration_s: number;
  /** 0/1 - the team index that won. */
  match_result: number;
  team_abandoned: boolean | null;
  abandoned_time_s: number | null;
  objectives_mask_team0: number;
  objectives_mask_team1: number;
  /**
   * The badge Valve showed the player after this match, encoded like every other
   * badge in the API: tier in the leading digits, subrank in the last one. Null
   * on unranked matches and during placements. This replaced `/mmr-history`,
   * which the API deprecated along with its MMR estimate.
   */
  ranked_display_badge?: number | null;
  /** Ranked progress the match awarded; a subrank spans 1000 points. */
  ranked_delta?: number | null;
  /** Non-zero while the match still counted towards placement. */
  ranked_calibration_match?: number | null;
}

export interface PlayerHeroStats {
  account_id: number;
  hero_id: number;
  matches_played: number;
  wins: number;
  last_played: number;
  time_played: number;
  kills: number;
  deaths: number;
  assists: number;
  ending_level: number;
  accuracy: number;
  crit_shot_rate: number;
  denies_per_match: number;
  kills_per_min: number;
  deaths_per_min: number;
  assists_per_min: number;
  denies_per_min: number;
  networth_per_min: number;
  last_hits_per_min: number;
  damage_per_min: number;
  damage_taken_per_min: number;
  damage_mitigated_per_min: number;
  obj_damage_per_min: number;
  total_player_damage: number;
  total_player_damage_taken: number;
  total_boss_damage: number;
  total_creep_damage: number;
  total_neutral_damage: number;
}

export interface AnalyticsHeroStats {
  hero_id: number;
  matches: number;
  wins: number;
  losses: number;
  total_kills: number;
  total_deaths: number;
  total_assists: number;
  total_net_worth: number;
  total_last_hits: number;
  total_denies: number;
  total_player_damage: number;
  total_player_damage_taken: number;
  total_boss_damage: number;
  total_shots_hit: number;
  total_shots_missed: number;
}

export interface MateStats {
  mate_id: number;
  wins: number;
  matches_played: number;
  matches: number[];
}

export interface EnemyStats {
  enemy_id: number;
  wins: number;
  matches_played: number;
  matches: number[];
}

export interface SteamProfile {
  account_id: number;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  realname: string | null;
  countrycode: string | null;
  last_updated: string;
  matches_played_last_30d: number;
}

export interface PlayerRank {
  badge: number;
  rank: number;
  subrank: number;
}

/**
 * Every endpoint used here is public - a Patreon subscription is tied to the
 * Steam accounts a supporter registers on deadlock-api.com, not to a credential
 * the client has to send. Requests for a prioritized account get the better data
 * on their own, so the app never asks for a key.
 */
export const API_HEADERS: Readonly<Record<string, string>> = {
  Accept: "application/json",
};

const get = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, { headers: API_HEADERS });
  if (!response.ok) {
    throw new DeadlockApiError(response.status, path);
  }
  return (await response.json()) as T;
};

export const getMatchHistory = (accountId: number) =>
  get<MatchHistoryEntry[]>(`/v1/players/${accountId}/match-history`);

/** Takes a whole lobby at once, so the live scoreboard costs a single request. */
export const getPlayerHeroStats = (accountIds: number | number[]) =>
  get<PlayerHeroStats[]>(
    `/v1/players/hero-stats?account_ids=${[accountIds].flat().join(",")}`,
  );

export const getPlayerRank = (accountId: number) =>
  get<PlayerRank>(`/v1/players/${accountId}/rank`);

/** `sameParty` restricts the result to premades instead of any shared match. */
export const getMateStats = (accountId: number, sameParty = false) =>
  get<MateStats[]>(
    `/v1/players/${accountId}/mate-stats?min_matches_played=3${
      sameParty ? "&same_party=true" : ""
    }`,
  );

export const getEnemyStats = (accountId: number) =>
  get<EnemyStats[]>(
    `/v1/players/${accountId}/enemy-stats?min_matches_played=3`,
  );

/** One batched call for every mate, so the Squad tab costs a single request. */
export const getSteamProfiles = (accountIds: number[]) => {
  if (accountIds.length === 0) {
    return Promise.resolve<SteamProfile[]>([]);
  }
  // `refresh` is left off on purpose: the read path is 100 req/s, the refresh
  // path only 3 req/min.
  return get<SteamProfile[]>(
    `/v1/players/steam?account_ids=${accountIds.join(",")}`,
  );
};

/** Global per-hero totals, used to benchmark the player against everyone else. */
export const getAnalyticsHeroStats = (sinceUnix: number) =>
  get<AnalyticsHeroStats[]>(
    `/v1/analytics/hero-stats?min_unix_timestamp=${sinceUnix}`,
  );

export interface ItemStats {
  item_id: number;
  matches: number;
  wins: number;
  losses: number;
  players: number;
  avg_buy_time_s: number;
  /** Where in the match the item is usually bought, as a percentage. */
  avg_buy_time_relative: number;
}

/**
 * Item performance. Without `accountId` this is everyone's data, which is the
 * baseline the player's own numbers get compared against.
 */
export const getItemStats = (
  accountId?: number,
  minMatches = 3,
): Promise<ItemStats[]> =>
  get<ItemStats[]>(
    `/v1/analytics/item-stats?min_matches=${minMatches}${
      accountId ? `&account_id=${accountId}` : ""
    }`,
  );

/**
 * Valve packs division and tier into one badge number: 26 reads as division 2,
 * tier 6. Resolving it against the asset list is the same job in the page header
 * and in the live player card, so it lives here.
 */
export const resolveRank = (
  badge: number | undefined,
  rankAssets: RankAsset[],
) => {
  const tier = Math.floor((badge ?? 0) / 10);
  const subrank = (badge ?? 0) % 10;
  const asset = rankAssets.find((entry) => entry.tier === tier);
  return {
    subrank,
    name: asset?.name,
    image: asset?.images[`large_subrank${subrank}`] ?? asset?.images.large,
  };
};

export const getRankAssets = async (): Promise<RankAsset[]> => {
  const response = await fetch(`${ASSETS_BASE_URL}/v2/ranks`);
  if (!response.ok) {
    throw new DeadlockApiError(response.status, "/v2/ranks");
  }
  return parseList(rankAssetSchema, await response.json(), "/v2/ranks");
};
