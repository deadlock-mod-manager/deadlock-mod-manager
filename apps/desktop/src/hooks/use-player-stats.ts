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
  getBadgeDistribution,
  getEnemyStats,
  getHeroCounterStats,
  getItemStats,
  getMatchHistory,
  getMatchMetadata,
  getMateStats,
  getPlayerHeroStats,
  getPlayerRank,
  getRankAssets,
  getRankedSeasons,
  getSteamProfiles,
  type MatchHistoryEntry,
  type PlayerHeroStats,
  type PlayerRank,
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
import { heroStatsByAccount } from "@/lib/stats/live-players";
import { playerFromMatch } from "@/lib/stats/match-detail";

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
  { key, ttl, enabled = true }: { key: string; ttl: number; enabled?: boolean },
  fetcher: (accountId: number) => Promise<T>,
) =>
  useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}${key}:${accountId}`,
      ttl,
      enabled: accountId !== null && enabled,
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

export const useItemCatalog = (active = true) => {
  const query = useStatsQuery(
    { key: "assets:items", ttl: STATS_TTL.assets, enabled: active },
    getItems,
  );

  const itemsById = useMemo(() => {
    const map = new Map<number, DeadlockItem>();
    for (const item of query.data?.data ?? []) {
      map.set(item.id, item);
    }
    return map;
  }, [query.data]);

  return {
    itemsById,
    isPending: active && query.isPending,
    isError: query.isError,
  };
};

/** The player's item performance against everyone else's. */
export const useItemStats = (accountId: number | null, active = true) => {
  const enabled = accountId !== null && active;
  const catalog = useItemCatalog(active);

  const mine = usePlayerScopedQuery(
    accountId,
    { key: "items", ttl: STATS_TTL.heroStats, enabled: active },
    (id) => getItemStats({ accountId: id }),
  );

  const global = useStatsQuery(
    {
      key: "benchmark:items",
      ttl: STATS_TTL.benchmark,
      enabled: active,
    },
    () => getItemStats({ minMatches: 1000 }),
  );

  const items = useMemo(
    () => joinItemStats(mine.data?.data ?? [], global.data?.data ?? []),
    [mine.data, global.data],
  );

  return {
    items,
    itemsById: catalog.itemsById,
    isPending: enabled && (mine.isPending || global.isPending),
    isError: mine.isError,
  };
};

/**
 * Where the player sits on the current ladder. Both payloads are global and
 * account-independent, so they are fetched once and shared by every card that
 * wants to place a badge - and only once something actually opens.
 */
export const useRankInsights = (active = true) => {
  const distribution = useStatsQuery(
    {
      key: "ranked:distribution",
      ttl: STATS_TTL.distribution,
      enabled: active,
    },
    getBadgeDistribution,
  );

  const seasons = useStatsQuery(
    { key: "assets:ranked-seasons", ttl: STATS_TTL.assets, enabled: active },
    getRankedSeasons,
  );

  return {
    distribution: distribution.data?.data ?? [],
    seasons: seasons.data?.data ?? [],
    // Both, or the card renders a season-less summary the moment the histogram
    // lands and then pops the season panel in underneath it.
    isPending: active && (distribution.isPending || seasons.isPending),
  };
};

/**
 * The per-hero deep dive: who the player beats on that hero and what they build
 * on it. Two analytics requests, made only once a hero card is opened.
 */
export const useHeroDeepDive = (
  accountId: number | null,
  heroId: number | null,
) => {
  const enabled = accountId !== null && heroId !== null;

  const counters = usePlayerScopedQuery(
    accountId,
    { key: "counters", ttl: STATS_TTL.heroStats, enabled },
    (id) => getHeroCounterStats(id),
  );

  const items = usePlayerScopedQuery(
    accountId,
    { key: `hero-items:${heroId}`, ttl: STATS_TTL.heroStats, enabled },
    (id) => getItemStats({ accountId: id, heroId: heroId ?? undefined }),
  );

  const catalog = useItemCatalog(enabled);

  // One request covers every hero the player has faced; the card only wants the
  // rows for the hero it is showing.
  const matchups = useMemo(
    () =>
      (counters.data?.data ?? [])
        .filter((entry) => entry.hero_id === heroId)
        .sort((a, b) => b.matches_played - a.matches_played),
    [counters.data, heroId],
  );

  const build = useMemo(
    () =>
      [...(items.data?.data ?? [])]
        .filter((item) => catalog.itemsById.has(item.item_id))
        .sort((a, b) => b.matches - a.matches),
    [items.data, catalog.itemsById],
  );

  return {
    matchups,
    build,
    itemsById: catalog.itemsById,
    // The catalog counts: `build` drops every item it cannot name, so reporting
    // ready while it loads would show the hero as having no build at all.
    isPending:
      enabled && (counters.isPending || items.isPending || catalog.isPending),
    isError: counters.isError || items.isError || catalog.isError,
  };
};

/** Detailed data for one selected match, never fetched for the closed tab. */
export const useMatchDetails = (
  matchId: number | null,
  accountId: number | null,
  active = true,
) => {
  const enabled = active && matchId !== null && accountId !== null;
  const metadata = useStatsQuery(
    {
      key: `match:${matchId}:metadata`,
      ttl: STATS_TTL.matchMetadata,
      enabled,
    },
    () => {
      if (matchId === null) {
        throw new RuntimeError("match metadata ran without a match");
      }
      return getMatchMetadata(matchId);
    },
  );
  const catalog = useItemCatalog(enabled);

  const player = useMemo(() => {
    if (accountId === null || !metadata.data) return null;
    return playerFromMatch(metadata.data.data.match_info.players, accountId);
  }, [accountId, metadata.data]);

  return {
    match: metadata.data?.data.match_info ?? null,
    player,
    itemsById: catalog.itemsById,
    isPending: enabled && (metadata.isPending || catalog.isPending),
    // A missing catalog is an error, not an empty build: the timeline resolves
    // every purchase through it, so without it the match reads as though the
    // player never bought anything.
    isError: metadata.isError || catalog.isError,
    refetch: metadata.refetch,
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
 * Everything the player card still needs, fetched only once the card opens - a
 * lobby of twelve must not pull twelve histories up front.
 *
 * Roster views seed data they already have. Remaining requests reuse the keys
 * from `usePlayerStats`, so opening your own card or the same player twice is
 * free while the cache is fresh.
 */
export interface PlayerCardSeed {
  heroStats?: PlayerHeroStats[];
  rank?: PlayerRank;
}

export const usePlayerCard = (
  accountId: number | null,
  seed: PlayerCardSeed = {},
) => {
  const history = usePlayerScopedQuery(
    accountId,
    { key: "match-history", ttl: STATS_TTL.matchHistory },
    (id) => getMatchHistory(id),
  );

  const heroStats = usePlayerScopedQuery(
    accountId,
    {
      key: "hero-stats",
      ttl: STATS_TTL.heroStats,
      enabled: seed.heroStats === undefined,
    },
    (id) => getPlayerHeroStats(id),
  );

  const rank = usePlayerScopedQuery(
    accountId,
    {
      key: "rank",
      ttl: STATS_TTL.rank,
      enabled: seed.rank === undefined,
    },
    (id) => getPlayerRank(id),
  );

  return {
    matches: history.data?.data ?? [],
    heroStats: seed.heroStats ?? heroStats.data?.data ?? [],
    rank: seed.rank ?? rank.data?.data,
    isPending: accountId !== null && history.isPending,
    isHeroStatsPending:
      accountId !== null && seed.heroStats === undefined && heroStats.isPending,
  };
};

/** Mates, enemies and their Steam personas for the Squad tab. */
export const useSquadStats = (
  accountId: number | null,
  matches: ReturnType<typeof usePlayerStats>["matches"],
  active = true,
) => {
  const enabled = accountId !== null && active;

  const mates = usePlayerScopedQuery(
    accountId,
    { key: "mates", ttl: STATS_TTL.mates, enabled: active },
    (id) => getMateStats(id),
  );

  const party = usePlayerScopedQuery(
    accountId,
    { key: "party", ttl: STATS_TTL.mates, enabled: active },
    (id) => getMateStats(id, true),
  );

  const enemies = usePlayerScopedQuery(
    accountId,
    { key: "enemies", ttl: STATS_TTL.mates, enabled: active },
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
        ...new Set([
          ...mateInsights.slice(0, 25).map((mate) => mate.mateId),
          ...enemyList.map((enemy) => enemy.enemy_id),
        ]),
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

  const heroStats = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}squad-hero-stats:${profileIdsKey}`,
      ttl: STATS_TTL.heroStats,
      enabled: enabled && profileIds.length > 0,
    },
    () => getPlayerHeroStats(profileIds),
  );

  const profilesById = useMemo(() => {
    const map = new Map<number, SteamProfile>();
    for (const profile of profiles.data?.data ?? []) {
      map.set(profile.account_id, profile);
    }
    return map;
  }, [profiles.data]);

  const heroStatsById = useMemo(
    () => heroStatsByAccount(heroStats.data?.data ?? []),
    [heroStats.data],
  );

  return {
    mates: mateInsights,
    partyIds,
    enemies: enemyList,
    profilesById,
    heroStatsById,
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
