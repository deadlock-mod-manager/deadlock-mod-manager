import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DeadlockHero,
  type DeadlockItem,
  getHeroes,
  getItems,
} from "@/lib/deadlock-api";
import {
  type AnalyticsHeroStats,
  getAnalyticsHeroStats,
  getEnemyStats,
  getItemStats,
  getMatchHistory,
  getMateStats,
  getPlayerHeroStats,
  getPlayerRank,
  getRankAssets,
  getSteamProfiles,
  type MatchHistoryEntry,
  type SteamProfile,
} from "@/lib/stats/api";
import { cachedFetch, clearCachedPrefix, STATS_TTL } from "@/lib/stats/cache";
import {
  benchmarkDeltas,
  generateInsights,
  heroPerformance,
  joinItemStats,
  joinMateStats,
  localOnlyMatches,
  mergeHeroStats,
  mergeLocalMatches,
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

/**
 * A query that only means anything for a known account. The guard is what lets
 * the fetchers take a plain `number` - every caller would otherwise assert the
 * nullable id away behind the `enabled` flag.
 */
const usePlayerScopedQuery = <T>(
  accountId: number | null,
  { key, ttl }: { key: string; ttl: number },
  fetcher: (accountId: number) => Promise<T>,
) =>
  useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}${key}:${accountId}`,
      ttl,
      enabled: accountId !== null,
    },
    () => {
      if (accountId === null) {
        throw new RuntimeError(`stats query "${key}" ran without an account`);
      }
      return fetcher(accountId);
    },
  );

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

/** The player's item performance against everyone else's. */
export const useItemStats = (accountId: number | null) => {
  const enabled = accountId !== null;

  const catalog = useStatsQuery(
    { key: "assets:items", ttl: STATS_TTL.assets },
    getItems,
  );

  const mine = usePlayerScopedQuery(
    accountId,
    { key: "items", ttl: STATS_TTL.heroStats },
    (id) => getItemStats(id),
  );

  const global = useStatsQuery(
    { key: "benchmark:items", ttl: STATS_TTL.benchmark },
    () => getItemStats(undefined, 1000),
  );

  const items = useMemo(
    () => joinItemStats(mine.data?.data ?? [], global.data?.data ?? []),
    [mine.data, global.data],
  );

  const itemsById = useMemo(() => {
    const map = new Map<number, DeadlockItem>();
    for (const item of catalog.data?.data ?? []) {
      map.set(item.id, item);
    }
    return map;
  }, [catalog.data]);

  return {
    items,
    itemsById,
    isPending: enabled && (mine.isPending || global.isPending),
    isError: mine.isError,
  };
};

/**
 * Everything the Overview and Heroes tabs need. One match-history request feeds
 * most of it; the rest is derived locally.
 */
export const usePlayerStats = (accountId: number | null) => {
  const enabled = accountId !== null;

  const matchHistory = usePlayerScopedQuery(
    accountId,
    { key: "match-history", ttl: STATS_TTL.matchHistory },
    (id) => getMatchHistory(id),
  );

  const heroStats = usePlayerScopedQuery(
    accountId,
    { key: "hero-stats", ttl: STATS_TTL.heroStats },
    (id) => getPlayerHeroStats(id),
  );

  const rank = usePlayerScopedQuery(
    accountId,
    { key: "rank", ttl: STATS_TTL.rank },
    (id) => getPlayerRank(id),
  );

  const profile = usePlayerScopedQuery(
    accountId,
    { key: "profile", ttl: STATS_TTL.steamProfiles },
    async (id) => (await getSteamProfiles([id]))[0] ?? null,
  );

  const benchmark = useStatsQuery(
    { key: "benchmark:heroes", ttl: STATS_TTL.benchmark },
    () =>
      getAnalyticsHeroStats(Math.floor(Date.now() / 1000) - BENCHMARK_WINDOW_S),
  );

  // Today's matches come from the Game Coordinator; the API has not ingested
  // them yet. Silent by design - it either adds matches or it does not.
  const local = useQuery({
    queryKey: ["local-match-history", accountId],
    queryFn: () => {
      if (accountId === null) {
        throw new RuntimeError("local match history ran without an account");
      }
      return invoke<MatchHistoryEntry[]>("get_local_match_history", {
        accountId,
      });
    },
    enabled,
    staleTime: STATS_TTL.matchHistory,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });

  // Computed once and reused: the same gap fills the history and the per-hero
  // aggregates, which lag by the same day.
  const localOnly = useMemo(
    () => localOnlyMatches(matchHistory.data?.data ?? [], local.data ?? []),
    [matchHistory.data, local.data],
  );

  const matches = useMemo(
    () => mergeLocalMatches(matchHistory.data?.data ?? [], local.data ?? []),
    [matchHistory.data, local.data],
  );
  // The per-hero aggregates the API returns, topped up with today's local-only
  // matches. Shared by the Heroes table and the per-hero benchmark.
  const mergedHeroStats = useMemo(
    () => mergeHeroStats(heroStats.data?.data ?? [], localOnly),
    [heroStats.data, localOnly],
  );
  const heroes = useMemo(
    () => heroPerformance(mergedHeroStats),
    [mergedHeroStats],
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
      const mine = mergedHeroStats.find((hero) => hero.hero_id === heroId);
      const global = benchmarkByHero.get(heroId);
      return mine && global ? benchmarkDeltas(mine, global) : [];
    },
    [mergedHeroStats, benchmarkByHero],
  );

  const sources = [matchHistory, heroStats, rank, profile];

  return {
    matches,
    heroes,
    insights,
    benchmarkFor,
    rank: rank.data?.data ?? null,
    profile: profile.data?.data ?? null,
    isPending: enabled && sources.some((query) => query.isPending),
    isError: matchHistory.isError,
    error: matchHistory.error,
    isStale: sources.some((query) => query.data?.isStale ?? false),
    fetchedAt: matchHistory.data?.fetchedAt ?? null,
  };
};

/**
 * Everything the player card shows, fetched only once a card is opened - a lobby
 * of twelve must not pull twelve histories up front.
 *
 * The query keys are the ones `usePlayerStats` uses, so opening your own card,
 * or the same player twice, costs nothing. All three endpoints are on the 100
 * req/s players tier and cached for minutes, which is why the card fetches for
 * itself rather than making every caller thread lobby data through.
 */
export const usePlayerCard = (accountId: number | null) => {
  const history = usePlayerScopedQuery(
    accountId,
    { key: "match-history", ttl: STATS_TTL.matchHistory },
    (id) => getMatchHistory(id),
  );

  const heroStats = usePlayerScopedQuery(
    accountId,
    { key: "hero-stats", ttl: STATS_TTL.heroStats },
    (id) => getPlayerHeroStats(id),
  );

  const rank = usePlayerScopedQuery(
    accountId,
    { key: "rank", ttl: STATS_TTL.rank },
    (id) => getPlayerRank(id),
  );

  return {
    matches: history.data?.data ?? [],
    heroStats: heroStats.data?.data ?? [],
    rank: rank.data?.data ?? undefined,
    isPending: accountId !== null && history.isPending,
  };
};

/** Mates, enemies and their Steam personas for the Squad tab. */
export const useSquadStats = (
  accountId: number | null,
  matches: ReturnType<typeof usePlayerStats>["matches"],
) => {
  const enabled = accountId !== null;

  const mates = usePlayerScopedQuery(
    accountId,
    { key: "mates", ttl: STATS_TTL.mates },
    (id) => getMateStats(id),
  );

  const party = usePlayerScopedQuery(
    accountId,
    { key: "party", ttl: STATS_TTL.mates },
    (id) => getMateStats(id, true),
  );

  const enemies = usePlayerScopedQuery(
    accountId,
    { key: "enemies", ttl: STATS_TTL.mates },
    (id) => getEnemyStats(id),
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

  // The key has to identify the exact set of ids: a length-plus-sum digest
  // collides (swap two mates for two others summing the same and the cache would
  // hand back the wrong personas).
  const profileIdsKey = useMemo(() => profileIds.join(","), [profileIds]);

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
