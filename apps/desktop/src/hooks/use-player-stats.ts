import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { DeadlockHeroes, normalizeHero } from "@deadlock-mods/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DeadlockHero,
  type DeadlockItem,
  getHeroes,
  getItems,
} from "@/lib/deadlock-api";
import { isMatchSyncBuilt } from "@/lib/runtime-bootstrap";
import {
  type AnalyticsHeroStats,
  badgeBracket,
  getAnalyticsHeroStats,
  getBadgeDistribution,
  getBracketMetrics,
  getEnemyStats,
  getHeroCounterStats,
  getItemStats,
  getMatchHistory,
  getMatchMetadata,
  getMateStats,
  getPerformanceCurve,
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
import { bracketRows, playerBracketValues } from "@/lib/stats/benchmark";
import { cachedFetch, clearCachedPrefix, STATS_TTL } from "@/lib/stats/cache";
import {
  benchmarkDeltas,
  generateInsights,
  heroPerformance,
  heroStatsByAccount,
  joinItemStats,
  joinMateStats,
  localOnlyMatches,
  mergeHeroStats,
  mergeLocalMatches,
} from "@/lib/stats/derive";
import { playerFromMatch } from "@/lib/stats/match-detail";
import {
  ALL_STATS_SCOPE,
  filterStatsMatches,
  statsScopeQuery,
  type StatsScope,
} from "@/lib/stats/scope";

const PLAYER_CACHE_PREFIX = "player:";

type StatsQueryOptions = {
  key: string;
  ttl: number;
  enabled?: boolean;
  /** Asks again this often (ms) while the request keeps failing. */
  retryEvery?: number;
};

/** Options for a cached stats request, for `useQuery` and `useQueries` alike. */
const statsQueryOptions = <T>(
  { key, ttl, enabled = true, retryEvery }: StatsQueryOptions,
  fetcher: () => Promise<T>,
) => ({
  queryKey: ["stats", key],
  queryFn: () => cachedFetch(key, ttl, fetcher),
  staleTime: ttl,
  gcTime: ttl * 2,
  refetchOnWindowFocus: false,
  retry: 1,
  refetchInterval: (query: { state: { status: string } }) =>
    retryEvery !== undefined && query.state.status === "error"
      ? retryEvery
      : false,
  enabled,
  // The page renders its own inline error/stale state instead of a toast.
  meta: { skipGlobalErrorHandler: true },
});

export const useStatsQuery = <T>(
  options: StatsQueryOptions,
  fetcher: () => Promise<T>,
) => useQuery(statsQueryOptions(options, fetcher));

/** A per-account query keyed like `usePlayerScopedQuery`, so caches are shared. */
export const playerQueryOptions = <T>(
  accountId: number,
  { key, ttl }: { key: string; ttl: number },
  fetcher: (accountId: number) => Promise<T>,
) =>
  statsQueryOptions(
    { key: `${PLAYER_CACHE_PREFIX}${key}:${accountId}`, ttl },
    () => fetcher(accountId),
  );

/**
 * A query that only means anything for a known account. The guard is what lets
 * the fetchers take a plain `number` - every caller would otherwise assert the
 * nullable id away behind the `enabled` flag.
 */
export const usePlayerScopedQuery = <T>(
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

type HeroCatalogIndex = {
  byId: Map<number, DeadlockHero>;
  /** Accepts any registry alias ("Mo & Krill", "The Doorman") or an asset codename ("hero_krill"). */
  heroByName: (name: string) => DeadlockHero | undefined;
};

const NO_HEROES: DeadlockHero[] = [];
// Keyed on the query payload so every HeroIcon on screen shares one index.
const heroCatalogIndexes = new WeakMap<DeadlockHero[], HeroCatalogIndex>();

const indexHeroCatalog = (heroes: DeadlockHero[]): HeroCatalogIndex => {
  const cached = heroCatalogIndexes.get(heroes);
  if (cached) {
    return cached;
  }
  const byId = new Map<number, DeadlockHero>();
  const byKey = new Map<string, DeadlockHero>();
  for (const hero of heroes) {
    byId.set(hero.id, hero);
    byKey.set(hero.class_name, hero);
    byKey.set(normalizeHero(hero.name) ?? hero.name, hero);
  }
  const index: HeroCatalogIndex = {
    byId,
    heroByName: (name) => byKey.get(normalizeHero(name) ?? name),
  };
  heroCatalogIndexes.set(heroes, index);
  return index;
};

const HERO_CATALOG_KEY = "assets:heroes";
const SESSION_START = Date.now();

const useHeroCatalogQuery = () =>
  useStatsQuery({ key: HERO_CATALOG_KEY, ttl: STATS_TTL.assets }, getHeroes);

export const useHeroCatalog = () => {
  const query = useHeroCatalogQuery();
  const { byId, heroByName } = indexHeroCatalog(query.data?.data ?? NO_HEROES);

  return { heroesById: byId, heroByName, isPending: query.isPending };
};

/**
 * A hero missing from a catalog cached in an earlier session is usually a new
 * release, so that catalog is refetched. One fetched this session that still
 * misses a hero means the hero isn't out yet, and refetching would not help.
 */
export const useRefreshHeroCatalogOnMiss = (missing: boolean) => {
  const queryClient = useQueryClient();
  const fetchedAt = useHeroCatalogQuery().data?.fetchedAt;

  useEffect(() => {
    if (!missing || fetchedAt === undefined || fetchedAt >= SESSION_START) {
      return;
    }
    void queryClient.prefetchQuery({
      queryKey: ["stats", HERO_CATALOG_KEY],
      queryFn: () =>
        cachedFetch(HERO_CATALOG_KEY, STATS_TTL.assets, getHeroes, {
          force: true,
        }),
      staleTime: 0,
    });
  }, [missing, fetchedAt, queryClient]);
};

const hasPortrait = (hero: DeadlockHero): boolean =>
  Boolean(hero.images.icon_image_small_webp || hero.images.icon_image_small);

/**
 * Whether a hero picker should offer `name`. The enum can know heroes Valve
 * hasn't released yet; the active catalog only lists them once they are
 * playable and have a portrait, so they appear on their own. With no catalog
 * yet - loading or offline - every hero is offered.
 */
export const useIsHeroAvailable = (): ((name: string) => boolean) => {
  const { heroesById, heroByName } = useHeroCatalog();
  const hasCatalog = heroesById.size > 0;
  const isAvailable = useCallback(
    (name: string) => {
      if (!hasCatalog) {
        return true;
      }
      const hero = heroByName(name);
      return hero !== undefined && hasPortrait(hero);
    },
    [hasCatalog, heroByName],
  );
  // A week-old catalog would keep a hero hidden long after its release.
  useRefreshHeroCatalogOnMiss(
    Object.values(DeadlockHeroes).some((hero) => !isAvailable(hero)),
  );
  return isAvailable;
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
export const useItemStats = (
  accountId: number | null,
  active = true,
  scope: StatsScope = ALL_STATS_SCOPE,
) => {
  const scopeKey = statsScopeQuery(scope);
  const enabled = accountId !== null && active;
  const catalog = useItemCatalog(active);

  const mine = usePlayerScopedQuery(
    accountId,
    { key: `items:${scopeKey}`, ttl: STATS_TTL.heroStats, enabled: active },
    (id) => getItemStats({ accountId: id, scope }),
  );

  const global = useStatsQuery(
    {
      key: `benchmark:items:${scopeKey}`,
      ttl: STATS_TTL.benchmark,
      enabled: active,
    },
    () => getItemStats({ minMatches: 1000, scope }),
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
 * The player's numbers placed among everyone in their rank tier. Unranked
 * players are compared with the whole population instead, which the response
 * reports as `tier: null`. One global request per tier and scope, shared by
 * every account in that tier.
 */
export const useBracketBenchmark = (
  stats: Pick<ReturnType<typeof usePlayerStats>, "matches" | "heroes" | "rank">,
  scope: StatsScope,
) => {
  const { tier: bracket, minBadge, maxBadge } = badgeBracket(stats.rank?.badge);
  const query = useStatsQuery(
    {
      key: `benchmark:bracket:${bracket ?? "all"}:${statsScopeQuery(scope)}`,
      ttl: STATS_TTL.benchmark,
    },
    () => getBracketMetrics({ minBadge, maxBadge, scope }),
  );

  const rows = useMemo(
    () =>
      bracketRows(
        query.data?.data ?? {},
        playerBracketValues(stats.matches, stats.heroes),
      ),
    [query.data, stats.matches, stats.heroes],
  );

  return {
    rows,
    tier: bracket,
    isPending: query.isPending,
    isError: query.isError,
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
      // v2 keeps slots, deaths, MVP and lane; older entries were trimmed without them.
      key: `match:${matchId}:metadata:v2`,
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
    isFetching: metadata.isFetching,
    refetch: metadata.refetch,
  };
};

/** Personas and avatars for everyone in one match: a single batched request. */
export const useMatchProfiles = (matchId: number, accountIds: number[]) => {
  const ids = useMemo(
    () => [...accountIds].sort((a, b) => a - b),
    [accountIds],
  );
  const query = useStatsQuery(
    {
      key: `${PLAYER_CACHE_PREFIX}match-profiles:${matchId}`,
      ttl: STATS_TTL.steamProfiles,
      enabled: ids.length > 0,
    },
    () => getSteamProfiles(ids),
  );
  return useMemo(() => {
    const map = new Map<number, SteamProfile>();
    for (const profile of query.data?.data ?? []) {
      map.set(profile.account_id, profile);
    }
    return map;
  }, [query.data]);
};

/**
 * The player's usual game on a hero: average buy time per item and souls over
 * time. Fetched only once the build view opens.
 */
export const useHeroBaseline = (
  accountId: number | null,
  heroId: number,
  active: boolean,
) => {
  const items = usePlayerScopedQuery(
    accountId,
    { key: `hero-items:${heroId}`, ttl: STATS_TTL.heroStats, enabled: active },
    (id) => getItemStats({ accountId: id, heroId }),
  );
  const curve = usePlayerScopedQuery(
    accountId,
    { key: `hero-curve:${heroId}`, ttl: STATS_TTL.heroStats, enabled: active },
    (id) => getPerformanceCurve(id, heroId),
  );
  const buyTimes = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of items.data?.data ?? []) {
      map.set(item.item_id, item.avg_buy_time_s);
    }
    return map;
  }, [items.data]);

  return {
    buyTimes,
    curve: curve.data?.data ?? [],
    isPending:
      active && accountId !== null && (items.isPending || curve.isPending),
  };
};

/** Shared matches as teammates, premades, and record against each enemy. */
const usePlayerEncounters = (accountId: number | null, active: boolean) => {
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
  return { mates, party, enemies };
};

/**
 * Who the player has met before, keyed for lookup. Shares its queries with the
 * Squad tab, so either one warms the other.
 */
export const usePlayerHistory = (accountId: number | null, active: boolean) => {
  const { mates, party, enemies } = usePlayerEncounters(accountId, active);
  return useMemo(
    () => ({
      mates: new Map(
        (mates.data?.data ?? []).map((mate) => [mate.mate_id, mate]),
      ),
      party: new Set((party.data?.data ?? []).map((mate) => mate.mate_id)),
      enemies: new Map(
        (enemies.data?.data ?? []).map((enemy) => [enemy.enemy_id, enemy]),
      ),
    }),
    [mates.data, party.data, enemies.data],
  );
};

/**
 * Everything the Overview and Heroes tabs need. One match-history request feeds
 * most of it; the rest is derived locally.
 */
export const usePlayerStats = (
  accountId: number | null,
  scope: StatsScope = ALL_STATS_SCOPE,
) => {
  const scopeKey = statsScopeQuery(scope);
  const enabled = accountId !== null;

  const matchHistory = usePlayerScopedQuery(
    accountId,
    { key: "match-history", ttl: STATS_TTL.matchHistory },
    (id) => getMatchHistory(id),
  );

  const heroStats = usePlayerScopedQuery(
    accountId,
    { key: `hero-stats:${scopeKey}`, ttl: STATS_TTL.heroStats },
    (id) => getPlayerHeroStats(id, scope),
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
    { key: `benchmark:heroes:${scopeKey}`, ttl: STATS_TTL.benchmark },
    () => getAnalyticsHeroStats(scope.since, scope.mode),
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
    enabled: enabled && isMatchSyncBuilt(),
    staleTime: STATS_TTL.matchHistory,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });

  // Computed once and reused: the same gap fills the history and the per-hero
  // aggregates, which lag by the same day.
  const localOnly = useMemo(
    () =>
      filterStatsMatches(
        localOnlyMatches(matchHistory.data?.data ?? [], local.data ?? []),
        scope,
      ),
    [matchHistory.data, local.data, scope],
  );

  const allMatches = useMemo(
    () => mergeLocalMatches(matchHistory.data?.data ?? [], local.data ?? []),
    [matchHistory.data, local.data],
  );
  const matches = useMemo(
    () => filterStatsMatches(allMatches, scope),
    [allMatches, scope],
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
    allMatches,
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
  const { mates, party, enemies } = usePlayerEncounters(accountId, active);

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
