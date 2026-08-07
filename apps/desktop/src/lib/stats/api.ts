import { ASSETS_BASE_URL, DeadlockApiError } from "@/lib/deadlock-api";
import { fetch } from "@/lib/fetch";
import {
  parseList,
  parseOne,
  type RankAsset,
  rankAssetSchema,
} from "@/lib/validation/deadlock-api";
import {
  analyticsHeroStatsSchema,
  badgeDistributionEntrySchema,
  enemyStatsSchema,
  heroCounterStatsSchema,
  itemStatsSchema,
  matchHistoryEntrySchema,
  matchMetadataSchema,
  mateStatsSchema,
  playerHeroStatsSchema,
  playerRankSchema,
  rankedSeasonSchema,
  steamProfileSchema,
} from "@/lib/validation/stats-api";
import type { z } from "zod";

export { DeadlockApiError };
export type { RankAsset };
// The shapes live with their schemas so the two cannot drift; everything on the
// Stats page still imports them from here.
export type {
  AnalyticsHeroStats,
  BadgeDistributionEntry,
  EnemyStats,
  HeroCounterStats,
  ItemStats,
  LastRankedMatch,
  MatchHistoryEntry,
  MatchMetadata,
  MatchMetadataItem,
  MatchMetadataPlayer,
  MatchMetadataStat,
  MateStats,
  PlayerHeroStats,
  PlayerRank,
  RankedSeason,
  SeasonInterval,
  SteamProfile,
} from "@/lib/validation/stats-api";

const BASE_URL = "https://api.deadlock-api.com";

// Endpoints deliberately avoided: /card and /account-stats are Patreon-only and
// capped at 5 req/min per IP, and match-history?force_refetch=true is 1 req/h.
// Everything used here is 100 req/s per IP (players) or 200 req/min (analytics).

/**
 * Every endpoint used here is public - a Patreon subscription is tied to the
 * Steam accounts a supporter registers on deadlock-api.com, not to a credential
 * the client has to send. Requests for a prioritized account get the better data
 * on their own, so the app never asks for one.
 */
export const API_HEADERS: Readonly<Record<string, string>> = {
  Accept: "application/json",
};

const request = async (path: string): Promise<unknown> => {
  const response = await fetch(`${BASE_URL}${path}`, { headers: API_HEADERS });
  if (!response.ok) {
    throw new DeadlockApiError(response.status, path);
  }
  return await response.json();
};

/**
 * A list endpoint. Entries that no longer match their schema are dropped rather
 * than failing the request: one unexpected row should not empty a scoreboard.
 */
const getList = async <T>(path: string, schema: z.ZodType<T>): Promise<T[]> =>
  parseList(schema, await request(path), path);

/** A single-object endpoint, where there is nothing to salvage from a bad shape. */
const getOne = async <T>(path: string, schema: z.ZodType<T>): Promise<T> =>
  parseOne(schema, await request(path), path);

export const getMatchHistory = (accountId: number) =>
  getList(`/v1/players/${accountId}/match-history`, matchHistoryEntrySchema);

/**
 * Full post-match data. Steam fallback is disabled deliberately: opening a
 * player card must never enqueue a Steam fetch or consume the API's scarce
 * three-per-hour fallback allowance. Cached/S3 metadata is enough here.
 *
 * The schema doubles as the trim: raw metadata also carries pings, damage
 * matrices and tracked-stat trees, and parsing drops every field it does not
 * declare before the response reaches React Query and the disk cache.
 */
export const getMatchMetadata = (matchId: number) =>
  getOne(
    `/v1/matches/${matchId}/metadata?disable_steam=true`,
    matchMetadataSchema,
  );

/** Takes a whole lobby at once, so the live scoreboard costs a single request. */
export const getPlayerHeroStats = (accountIds: number | number[]) =>
  getList(
    `/v1/players/hero-stats?account_ids=${[accountIds].flat().join(",")}`,
    playerHeroStatsSchema,
  );

export const getPlayerRank = (accountId: number) =>
  getOne(`/v1/players/${accountId}/rank`, playerRankSchema);

/** `sameParty` restricts the result to premades instead of any shared match. */
export const getMateStats = (accountId: number, sameParty = false) =>
  getList(
    `/v1/players/${accountId}/mate-stats?min_matches_played=3${
      sameParty ? "&same_party=true" : ""
    }`,
    mateStatsSchema,
  );

export const getEnemyStats = (accountId: number) =>
  getList(
    `/v1/players/${accountId}/enemy-stats?min_matches_played=3`,
    enemyStatsSchema,
  );

/** One batched call for every mate, so the Squad tab costs a single request. */
export const getSteamProfiles = (accountIds: number[]) => {
  if (accountIds.length === 0) {
    return Promise.resolve<z.infer<typeof steamProfileSchema>[]>([]);
  }
  // `refresh` is left off on purpose: the read path is 100 req/s, the refresh
  // path only 3 req/min.
  return getList(
    `/v1/players/steam?account_ids=${accountIds.join(",")}`,
    steamProfileSchema,
  );
};

/** Global per-hero totals, used to benchmark the player against everyone else. */
export const getAnalyticsHeroStats = (sinceUnix: number) =>
  getList(
    `/v1/analytics/hero-stats?min_unix_timestamp=${sinceUnix}`,
    analyticsHeroStatsSchema,
  );

/**
 * How the whole ranked population is spread across the badges. Only badges with a
 * subrank of 1-6 ever carry players, so the response has holes by design.
 */
export const getBadgeDistribution = () =>
  getList("/v1/analytics/badge-distribution", badgeDistributionEntrySchema);

/** The season definitions the game client ships, including its entry requirements. */
export const getRankedSeasons = () =>
  getList("/v1/assets/ranked-seasons", rankedSeasonSchema);

/**
 * The player's own record against every enemy hero. Scoped to `accountId`, so
 * this is their matchups rather than the global ones.
 */
export const getHeroCounterStats = (accountId: number, minMatches = 2) =>
  getList(
    `/v1/analytics/hero-counter-stats?account_id=${accountId}&min_matches=${minMatches}`,
    heroCounterStatsSchema,
  );

/**
 * Item performance. Without `accountId` this is everyone's data, which is the
 * baseline the player's own numbers get compared against; with `heroId` it is
 * narrowed to the builds that player ran on that one hero.
 */
export const getItemStats = ({
  accountId,
  heroId,
  minMatches = 3,
}: {
  accountId?: number;
  heroId?: number;
  minMatches?: number;
} = {}) =>
  getList(
    `/v1/analytics/item-stats?min_matches=${minMatches}${
      accountId ? `&account_id=${accountId}` : ""
    }${
      // `hero_ids` (plural) is the filter that applies; the singular `hero_id`
      // parameter the schema also lists comes back empty for every account.
      heroId ? `&hero_ids=${heroId}` : ""
    }`,
    itemStatsSchema,
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
