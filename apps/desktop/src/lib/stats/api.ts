import { assetsBaseUrl, DeadlockApiError } from "@/lib/deadlock-api";
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
  metricSpreadSchema,
  performancePointSchema,
  playerHeroStatsSchema,
  playerRankSchema,
  rankedSeasonSchema,
  steamProfileSchema,
} from "@/lib/validation/stats-api";
import { z } from "zod";
import { runtimeServiceOrigin } from "@/lib/runtime-bootstrap";
import {
  statsScopeQuery,
  type StatsScope,
  type StatsMatchMode,
} from "@/lib/stats/scope";
import { jsonValueSchema } from "@/lib/validation/json";

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
  MetricSpread,
  PerformancePoint,
  PlayerHeroStats,
  PlayerRank,
  RankedSeason,
  SeasonInterval,
  SteamProfile,
} from "@/lib/validation/stats-api";

const BASE_URL = "https://api.deadlock-api.com";
const apiBaseUrl = (): string => runtimeServiceOrigin("deadlockApi", BASE_URL);

// Endpoints deliberately avoided: /card and /account-stats are Patreon-only and
// capped at 5 req/min per IP, and match-history?force_refetch=true is 1 req/h.
// Everything used here is 100 req/s per IP (players) or 200 req/min (analytics).

/**
 * Every endpoint used here is public - a Patreon subscription is tied to the
 * Steam accounts a supporter registers on deadlock-api.com, not to a credential
 * the client has to send. Requests for a prioritized account get the better data
 * on their own, so the app never asks for one.
 */
const API_HEADERS = {
  Accept: "application/json",
} as const;

const request = async (path: string) => {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: API_HEADERS,
  });
  if (!response.ok) {
    throw new DeadlockApiError(response.status, path);
  }
  return response;
};

/** Custom widgets accept any JSON shape; dataset conversion happens separately. */
export const requestJson = async (path: string) => {
  const response = await request(path);
  return jsonValueSchema.parse(await response.json());
};

/**
 * A list endpoint. Entries that no longer match their schema are dropped rather
 * than failing the request: one unexpected row should not empty a scoreboard.
 */
const getList = async <T>(path: string, schema: z.ZodType<T>): Promise<T[]> => {
  const response = await request(path);
  return parseList(schema, await response.json(), path);
};

/** A single-object endpoint, where there is nothing to salvage from a bad shape. */
const getOne = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
  const response = await request(path);
  return parseOne(schema, await response.json(), path);
};

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

/** Takes several accounts at once, so the squad view costs a single request. */
export const getPlayerHeroStats = (
  accountIds: number | number[],
  scope?: StatsScope,
) =>
  getList(
    `/v1/players/hero-stats?account_ids=${[accountIds].flat().join(",")}${scope ? `&${statsScopeQuery(scope)}` : ""}`,
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
export const getAnalyticsHeroStats = (
  sinceUnix: number,
  mode: StatsMatchMode = "all",
) =>
  getList(
    `/v1/analytics/hero-stats?${statsScopeQuery({ mode, since: sinceUnix })}`,
    analyticsHeroStatsSchema,
  );

/**
 * How the whole ranked population is spread across the badges. Only badges with a
 * subrank of 1-6 ever carry players, so the response has holes by design.
 */
export const getBadgeDistribution = () =>
  getList("/v1/analytics/badge-distribution", badgeDistributionEntrySchema);

/**
 * How every player inside a badge range performs per match: average and
 * percentiles for each metric. `minBadge`/`maxBadge` filter on the match's
 * average badge, so a whole tier is `tier * 10 + 1` to `tier * 10 + 6`.
 */
export const getBracketMetrics = async ({
  minBadge,
  maxBadge,
  scope,
}: {
  minBadge: number;
  maxBadge: number;
  scope: StatsScope;
}) => {
  const path = `/v1/analytics/player-stats/metrics?min_average_badge=${minBadge}&max_average_badge=${maxBadge}&${statsScopeQuery(scope)}`;
  const response = await request(path);
  return parseOne(
    z.record(z.string(), metricSpreadSchema),
    await response.json(),
    path,
  );
};

/**
 * How an account's souls usually grow over a match on one hero, bucketed in
 * absolute game seconds. The baseline the match page compares a game with.
 */
export const getPerformanceCurve = (accountId: number, heroId: number) =>
  getList(
    `/v1/analytics/player-performance-curve?account_ids=${accountId}&hero_ids=${heroId}&resolution=0`,
    performancePointSchema,
  );

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
  scope,
}: {
  accountId?: number;
  heroId?: number;
  minMatches?: number;
  scope?: StatsScope;
} = {}) =>
  getList(
    `/v1/analytics/item-stats?min_matches=${minMatches}${
      accountId ? `&account_id=${accountId}` : ""
    }${
      // `hero_ids` (plural) is the filter that applies; the singular `hero_id`
      // parameter the schema also lists comes back empty for every account.
      heroId ? `&hero_ids=${heroId}` : ""
    }${scope ? `&${statsScopeQuery(scope)}` : ""}`,
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
  const response = await fetch(`${assetsBaseUrl()}/v1/assets/ranks`);
  if (!response.ok) {
    throw new DeadlockApiError(response.status, "/v1/assets/ranks");
  }
  return parseList(rankAssetSchema, await response.json(), "/v1/assets/ranks");
};
