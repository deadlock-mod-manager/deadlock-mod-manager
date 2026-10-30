import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { useQueries } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
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

/**
 * How players on one hero in the player's rank bracket stand over a match, for
 * grading a match while it runs. One request per hero and bracket.
 */
export const useLiveHeroBenchmark = (
  heroId: number | null,
  badge: number | undefined,
  scope: StatsScope,
) => {
  const { tier: bracket, minBadge, maxBadge } = badgeBracket(badge);
  return useStatsQuery(
    {
      key: `benchmark:live-curve:${heroId}:${bracket ?? "all"}:${statsScopeQuery(scope)}`,
      ttl: STATS_TTL.benchmark,
      enabled: heroId !== null,
    },
    () => {
      if (heroId === null) {
        throw new RuntimeError("live benchmark query ran without a hero");
      }
      return getBracketCurve({ heroId, minBadge, maxBadge, scope });
    },
  );
};
