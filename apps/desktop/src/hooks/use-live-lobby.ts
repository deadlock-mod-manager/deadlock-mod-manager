import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { useQueries } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  playerQueryOptions,
  usePlayerHistory,
  usePlayerScopedQuery,
  useStatsQuery,
} from "@/hooks/use-player-stats";
import {
  badgeBracket,
  getBracketCurve,
  getHeroCounterStats,
  getMatchHistory,
  getPlayerHeroStats,
  getPlayerRank,
  type MatchHistoryEntry,
  type PlayerRank,
} from "@/lib/stats/api";
import { STATS_TTL } from "@/lib/stats/cache";
import {
  type LiveLobby,
  lobbyRecords,
  matchupsFor,
  recentForm,
  type WinRecord,
} from "@/lib/stats/live-lobby";
import { statsScopeQuery, type StatsScope } from "@/lib/stats/scope";

/**
 * What the Live tab knows about a lobby beyond the top bar. Records for the
 * whole lobby are one request; ranks and recent form are one per player, so
 * they are cached per account and shared with the player cards. Who you met
 * before and how your hero fares against theirs come from your own account.
 */
export const useLiveLobby = ({
  accountIds,
  yourAccountId,
  yourHeroId,
}: {
  accountIds: number[];
  yourAccountId: number | null;
  yourHeroId: number | null;
}): LiveLobby => {
  const ids = useMemo(() => [...new Set(accountIds)].sort(), [accountIds]);
  const heroStats = useStatsQuery(
    {
      key: `lobby:careers:${ids.join(",")}`,
      ttl: STATS_TTL.heroStats,
      enabled: ids.length > 0,
    },
    () => getPlayerHeroStats(ids),
  );
  // A stable `combine` keeps these maps from rebuilding on every live poll.
  const ranks = useQueries({
    queries: ids.map((id) =>
      playerQueryOptions(
        id,
        { key: "rank", ttl: STATS_TTL.rank },
        getPlayerRank,
      ),
    ),
    combine: useCallback(
      (results: { data?: { data: PlayerRank } }[]) =>
        new Map(
          ids.flatMap((id, index) => {
            const rank = results[index]?.data?.data;
            return rank ? [[id, rank.badge] as const] : [];
          }),
        ),
      [ids],
    ),
  });
  const form = useQueries({
    queries: ids.map((id) =>
      playerQueryOptions(
        id,
        { key: "match-history", ttl: STATS_TTL.matchHistory },
        getMatchHistory,
      ),
    ),
    combine: useCallback(
      (results: { data?: { data: MatchHistoryEntry[] } }[]) =>
        new Map(
          ids.flatMap((id, index) => {
            const history = results[index]?.data?.data;
            return history ? [[id, recentForm(history)] as const] : [];
          }),
        ),
      [ids],
    ),
  });
  const encounters = usePlayerHistory(yourAccountId, ids.length > 0);
  const counters = usePlayerScopedQuery(
    yourAccountId,
    {
      key: "counters",
      ttl: STATS_TTL.heroStats,
      enabled: yourHeroId !== null,
    },
    (id) => getHeroCounterStats(id),
  );

  const records = useMemo(
    () => lobbyRecords(heroStats.data?.data ?? []),
    [heroStats.data],
  );
  const met = useMemo(() => {
    const toRecord = (entry: { wins: number; matches_played: number }) => ({
      matches: entry.matches_played,
      wins: entry.wins,
    });
    return {
      mates: new Map(
        [...encounters.mates].map(([id, mate]) => [id, toRecord(mate)]),
      ),
      enemies: new Map(
        [...encounters.enemies].map(([id, enemy]) => [id, toRecord(enemy)]),
      ),
    };
  }, [encounters.mates, encounters.enemies]);
  const matchups = useMemo(
    () =>
      yourHeroId === null
        ? new Map<number, WinRecord>()
        : matchupsFor(counters.data?.data ?? [], yourHeroId),
    [counters.data, yourHeroId],
  );

  return {
    records,
    ranks,
    form,
    mates: met.mates,
    enemies: met.enemies,
    matchups,
    isPending: ids.length > 0 && heroStats.isPending,
  };
};

const DAY_S = 24 * 60 * 60;
const LIVE_CURVE_DAYS = 7;
/** The local hero can flicker while the bridge resolves it; each flicker is a heavy request. */
const HERO_SETTLE_MS = 2000;
const LIVE_CURVE_RETRY_MS = 30_000;

/**
 * How players on one hero in the player's rank bracket stand over a match, for
 * grading a match while it runs. One request per hero and bracket.
 *
 * A hero filter keeps deadlock-api off its pre-aggregated rollup, so the curve
 * scans every match of that hero in the window: 30 days ran into its 20 s
 * timeout. The window is the last week from a UTC midnight, which keeps the URL,
 * and so the API's cache, the same for every player on that hero all day.
 */
export const useLiveHeroBenchmark = (
  heroId: number | null,
  badge: number | undefined,
  scope: StatsScope,
) => {
  const settledHeroId = useDebouncedValue(heroId, HERO_SETTLE_MS);
  const { tier: bracket, minBadge, maxBadge } = badgeBracket(badge);
  const today = Math.floor(Date.now() / 1000 / DAY_S) * DAY_S;
  const windowScope = {
    ...scope,
    since: Math.max(scope.since, today - LIVE_CURVE_DAYS * DAY_S),
  };
  return useStatsQuery(
    {
      key: `benchmark:live-curve:${settledHeroId}:${bracket ?? "all"}:${statsScopeQuery(windowScope)}`,
      ttl: STATS_TTL.benchmark,
      enabled: settledHeroId !== null && settledHeroId === heroId,
      retryEvery: LIVE_CURVE_RETRY_MS,
    },
    () => {
      if (settledHeroId === null) {
        throw new RuntimeError("live benchmark query ran without a hero");
      }
      return getBracketCurve({
        heroId: settledHeroId,
        badges: bracket === null ? null : { minBadge, maxBadge },
        scope: windowScope,
      });
    },
  );
};
