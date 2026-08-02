import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type DeadlockHero, getHeroes } from "@/lib/deadlock-api";
import {
  type AnalyticsHeroStats,
  getAnalyticsHeroStats,
  getEnemyStats,
  getMatchHistory,
  getMateStats,
  getMmrHistory,
  getPlayerHeroStats,
  getPlayerRank,
  getRankAssets,
  getSteamProfiles,
  type SteamProfile,
} from "@/lib/stats/api";
import { cachedFetch, clearCachedPrefix, STATS_TTL } from "@/lib/stats/cache";
import {
  benchmarkDeltas,
  generateInsights,
  heroPerformance,
  joinMateStats,
} from "@/lib/stats/derive";

const PLAYER_CACHE_PREFIX = "player:";
/** Only the last ~3 months of global data, so the benchmark matches the meta. */
const BENCHMARK_WINDOW_S = 90 * 24 * 60 * 60;

type StatsQueryOptions = {
  key: string;
  ttl: number;
  enabled?: boolean;
};

const useStatsQuery = <T>(
  { key, ttl, enabled = true }: StatsQueryOptions,
  fetcher: () => Promise<T>,
) =>
  useQuery({
    queryKey: ["stats", key],
    queryFn: () => cachedFetch(key, ttl, fetcher),
    staleTime: ttl,
    gcTime: ttl * 2,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled,
    // The page renders its own inline error/stale state instead of a toast.
    meta: { skipGlobalErrorHandler: true },
  });

export const useHeroCatalog = () => {
  const query = useStatsQuery(
    { key: "assets:heroes", ttl: STATS_TTL.assets },
    getHeroes,
  );

  const byId = useMemo(() => {
    const map = new Map<number, DeadlockHero>();
    for (const hero of query.data?.data ?? []) {
      map.set(hero.id, hero);
    }
    return map;
  }, [query.data]);

  return { heroesById: byId, isPending: query.isPending };
};

export const useRankAssets = () =>
  useStatsQuery({ key: "assets:ranks", ttl: STATS_TTL.assets }, getRankAssets);

/**
 * Everything the Overview and Heroes tabs need. One match-history request feeds
 * most of it; the rest is derived locally.
 */
export const usePlayerStats = (accountId: number | null) => {
  const enabled = accountId !== null;

  const matchHistory = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}match-history:${accountId}`,
      ttl: STATS_TTL.matchHistory,
      enabled,
    },
    () => getMatchHistory(accountId as number),
  );

  const heroStats = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}hero-stats:${accountId}`,
      ttl: STATS_TTL.heroStats,
      enabled,
    },
    () => getPlayerHeroStats(accountId as number),
  );

  const mmrHistory = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}mmr:${accountId}`,
      ttl: STATS_TTL.mmrHistory,
      enabled,
    },
    () => getMmrHistory(accountId as number),
  );

  const rank = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}rank:${accountId}`,
      ttl: STATS_TTL.rank,
      enabled,
    },
    () => getPlayerRank(accountId as number),
  );

  const profile = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}profile:${accountId}`,
      ttl: STATS_TTL.steamProfiles,
      enabled,
    },
    async () => (await getSteamProfiles([accountId as number]))[0] ?? null,
  );

  const benchmark = useStatsQuery(
    { key: "benchmark:heroes", ttl: STATS_TTL.benchmark },
    () =>
      getAnalyticsHeroStats(Math.floor(Date.now() / 1000) - BENCHMARK_WINDOW_S),
  );

  const matches = matchHistory.data?.data ?? [];
  const heroes = useMemo(
    () => heroPerformance(heroStats.data?.data ?? []),
    [heroStats.data],
  );
  const insights = useMemo(
    () => generateInsights(matches, heroes),
    [matches, heroes],
  );

  const benchmarkByHero = useMemo(() => {
    const map = new Map<number, AnalyticsHeroStats>();
    for (const entry of benchmark.data?.data ?? []) {
      map.set(entry.hero_id, entry);
    }
    return map;
  }, [benchmark.data]);

  const benchmarkFor = useCallback(
    (heroId: number) => {
      const mine = heroStats.data?.data.find((hero) => hero.hero_id === heroId);
      const global = benchmarkByHero.get(heroId);
      return mine && global ? benchmarkDeltas(mine, global) : [];
    },
    [heroStats.data, benchmarkByHero],
  );

  const sources = [matchHistory, heroStats, mmrHistory, rank, profile];

  return {
    matches,
    heroes,
    insights,
    benchmarkFor,
    mmrHistory: mmrHistory.data?.data ?? [],
    rank: rank.data?.data ?? null,
    profile: profile.data?.data ?? null,
    isPending: enabled && sources.some((query) => query.isPending),
    isError: matchHistory.isError,
    error: matchHistory.error,
    isStale: sources.some((query) => query.data?.isStale ?? false),
    fetchedAt: matchHistory.data?.fetchedAt ?? null,
  };
};

/** Mates, enemies and their Steam personas for the Squad tab. */
export const useSquadStats = (
  accountId: number | null,
  matches: ReturnType<typeof usePlayerStats>["matches"],
) => {
  const enabled = accountId !== null;

  const mates = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}mates:${accountId}`,
      ttl: STATS_TTL.mates,
      enabled,
    },
    () => getMateStats(accountId as number),
  );

  const party = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}party:${accountId}`,
      ttl: STATS_TTL.mates,
      enabled,
    },
    () => getMateStats(accountId as number, true),
  );

  const enemies = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}enemies:${accountId}`,
      ttl: STATS_TTL.mates,
      enabled,
    },
    () => getEnemyStats(accountId as number),
  );

  const mateInsights = useMemo(
    () => joinMateStats(mates.data?.data ?? [], matches),
    [mates.data, matches],
  );

  const partyIds = useMemo(
    () => new Set((party.data?.data ?? []).map((mate) => mate.mate_id)),
    [party.data],
  );

  const enemyList = useMemo(
    () =>
      [...(enemies.data?.data ?? [])]
        .filter((enemy) => enemy.matches_played >= 3)
        .sort((a, b) => a.wins / a.matches_played - b.wins / b.matches_played)
        .slice(0, 10),
    [enemies.data],
  );

  // One batched request covers every persona and avatar on the tab.
  const profileIds = useMemo(
    () =>
      [
        ...mateInsights.slice(0, 25).map((mate) => mate.mateId),
        ...enemyList.map((enemy) => enemy.enemy_id),
      ].sort((a, b) => a - b),
    [mateInsights, enemyList],
  );

  // The key has to change when the set of ids changes, not just its size.
  const profileIdsKey = useMemo(
    () => `${profileIds.length}-${profileIds.reduce((sum, id) => sum + id, 0)}`,
    [profileIds],
  );

  const profiles = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}squad-profiles:${accountId}:${profileIdsKey}`,
      ttl: STATS_TTL.steamProfiles,
      enabled: enabled && profileIds.length > 0,
    },
    () => getSteamProfiles(profileIds),
  );

  const profilesById = useMemo(() => {
    const map = new Map<number, SteamProfile>();
    for (const profile of profiles.data?.data ?? []) {
      map.set(profile.account_id, profile);
    }
    return map;
  }, [profiles.data]);

  return {
    mates: mateInsights,
    partyIds,
    enemies: enemyList,
    profilesById,
    isPending: enabled && (mates.isPending || enemies.isPending),
    isError: mates.isError,
  };
};

/**
 * Manual refresh: drops the player entries from the disk cache and refetches, so
 * the button actually hits the network instead of re-reading the cache. Locked
 * for a minute afterwards to stay polite to the shared API.
 */
export const REFRESH_COOLDOWN_MS = 60_000;

export const useStatsRefresh = () => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canRefresh, setCanRefresh] = useState(true);

  useEffect(() => {
    if (canRefresh) return;
    const timer = setTimeout(() => setCanRefresh(true), REFRESH_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [canRefresh]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await clearCachedPrefix(PLAYER_CACHE_PREFIX);
      await queryClient.refetchQueries({ queryKey: ["stats"] });
      setCanRefresh(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  return { refresh, isRefreshing, canRefresh };
};
