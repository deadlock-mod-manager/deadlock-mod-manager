import { fetch } from "@/lib/fetch";

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

export interface MmrHistoryEntry {
  account_id: number;
  match_id: number;
  start_time: number;
  player_score: number;
  rank: number;
  division: number;
  division_tier: number;
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

export interface RankAsset {
  tier: number;
  name: string;
  images: Record<string, string>;
}

export class DeadlockApiError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(`deadlock-api ${endpoint} failed with ${status}`);
    this.name = "DeadlockApiError";
  }
}

const get = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
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

export const getMmrHistory = (accountId: number) =>
  get<MmrHistoryEntry[]>(`/v1/players/${accountId}/mmr-history`);

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

export const getRankAssets = async (): Promise<RankAsset[]> => {
  const response = await fetch("https://assets.deadlock-api.com/v2/ranks");
  if (!response.ok) {
    throw new DeadlockApiError(response.status, "/v2/ranks");
  }
  return (await response.json()) as RankAsset[];
};
