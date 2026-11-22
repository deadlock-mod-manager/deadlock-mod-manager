import { z } from "zod";
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
  heroCombStatsSchema,
  heroCounterStatsSchema,
  itemStatsSchema,
  matchHistoryEntrySchema,
  matchMetadataSchema,
  mateStatsSchema,
  metricSpreadSchema,
  performanceCurvePointSchema,
  performancePointSchema,
  playerHeroStatsSchema,
  playerRankSchema,
  playerRegionSchema,
  rankedSeasonSchema,
  regionHistoryEntrySchema,
  steamProfileSchema,
} from "@/lib/validation/stats-api";
import { runtimeServiceOrigin } from "@/lib/runtime-bootstrap";
import {
  statsScopeQuery,
  type StatsScope,
  type StatsMatchMode,
} from "@/lib/stats/scope";
import { jsonValueSchema } from "@/lib/validation/json";

export { DeadlockApiError };
export type { RankAsset };
export type {
  AnalyticsHeroStats,
  BadgeDistributionEntry,
  EnemyStats,
  HeroCombStats,
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
  PerformanceCurvePoint,
  PerformancePoint,
  PlayerHeroStats,
  PlayerRank,
  RankedSeason,
  RegionHistoryEntry,
  SeasonInterval,
  SteamProfile,
} from "@/lib/validation/stats-api";

const BASE_URL = "https://api.deadlock-api.com";
const apiBaseUrl = (): string => runtimeServiceOrigin("deadlockApi", BASE_URL);

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

export const requestJson = async (path: string) => {
  const response = await request(path);
  return jsonValueSchema.parse(await response.json());
};

const getList = async <T>(path: string, schema: z.ZodType<T>): Promise<T[]> => {
  const response = await request(path);
  return parseList(schema, await response.json(), path);
};

const getOne = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
  const response = await request(path);
  return parseOne(schema, await response.json(), path);
};

export const getMatchHistory = (accountId: number) =>
  getList(`/v1/players/${accountId}/match-history`, matchHistoryEntrySchema);

export const getMatchMetadata = (matchId: number) =>
  getOne(
    `/v1/matches/${matchId}/metadata?disable_steam=true`,
    matchMetadataSchema,
  );

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

export const getPlayerRegionHistory = async (accountId: number) => {
  const path = `/v1/players/${accountId}/region`;
  const region = await getOne(path, playerRegionSchema);
  return parseList(regionHistoryEntrySchema, region.history, path);
};

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

export const getSteamProfiles = (accountIds: number[]) => {
  if (accountIds.length === 0) {
    return Promise.resolve<z.infer<typeof steamProfileSchema>[]>([]);
  }
  return getList(
    `/v1/players/steam?account_ids=${accountIds.join(",")}`,
    steamProfileSchema,
  );
};

export const getAnalyticsHeroStats = (
  sinceUnix: number,
  mode: StatsMatchMode = "all",
) =>
  getList(
    `/v1/analytics/hero-stats?${statsScopeQuery({ mode, since: sinceUnix })}`,
    analyticsHeroStatsSchema,
  );

export const getBadgeDistribution = () =>
  getList("/v1/analytics/badge-distribution", badgeDistributionEntrySchema);

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

export const getPerformanceCurve = (accountId: number, heroId: number) =>
  getList(
    `/v1/analytics/player-performance-curve?account_ids=${accountId}&hero_ids=${heroId}&resolution=0`,
    performancePointSchema,
  );

export const getBracketCurve = ({
  heroId,
  badges,
  scope,
}: {
  heroId: number;
  badges: { minBadge: number; maxBadge: number } | null;
  scope: StatsScope;
}) =>
  getList(
    `/v1/analytics/player-performance-curve?hero_ids=${heroId}${badges ? `&min_average_badge=${badges.minBadge}&max_average_badge=${badges.maxBadge}` : ""}&resolution=0&${statsScopeQuery(scope)}`,
    performanceCurvePointSchema,
  );

export type BadgeRange = { minBadge: number; maxBadge: number } | null;

const badgeQuery = (badges: BadgeRange) =>
  badges
    ? `&min_average_badge=${badges.minBadge}&max_average_badge=${badges.maxBadge}`
    : "";

export const getHeroCombStats = ({
  size,
  badges,
  scope,
}: {
  size: 2 | 3;
  badges: BadgeRange;
  scope: StatsScope;
}) =>
  getList(
    `/v1/analytics/hero-comb-stats?comb_size=${size}${badgeQuery(badges)}&${statsScopeQuery(scope)}`,
    heroCombStatsSchema,
  );

export const getRankedSeasons = () =>
  getList("/v1/assets/ranked-seasons", rankedSeasonSchema);

export const getHeroCounterStats = (accountId: number, minMatches = 2) =>
  getList(
    `/v1/analytics/hero-counter-stats?account_id=${accountId}&min_matches=${minMatches}`,
    heroCounterStatsSchema,
  );

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
      heroId ? `&hero_ids=${heroId}` : ""
    }${scope ? `&${statsScopeQuery(scope)}` : ""}`,
    itemStatsSchema,
  );

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

export const badgeBracket = (badge: number | undefined) => {
  const tier = Math.floor((badge ?? 0) / 10);
  return tier > 0
    ? { tier, minBadge: tier * 10 + 1, maxBadge: tier * 10 + 6 }
    : { tier: null, minBadge: 0, maxBadge: 116 };
};

export const rankLabel = (
  badge: number | undefined,
  rankAssets: RankAsset[],
) => {
  const { name, subrank } = resolveRank(badge, rankAssets);
  if (!name) return null;
  return subrank > 0 ? `${name} ${subrank}` : name;
};

export const getRankAssets = async (): Promise<RankAsset[]> => {
  const response = await fetch(`${assetsBaseUrl()}/v1/assets/ranks`);
  if (!response.ok) {
    throw new DeadlockApiError(response.status, "/v1/assets/ranks");
  }
  return parseList(rankAssetSchema, await response.json(), "/v1/assets/ranks");
};
