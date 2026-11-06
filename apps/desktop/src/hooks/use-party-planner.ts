import { useDeferredValue, useMemo } from "react";
import { useStatsQuery } from "@/hooks/use-player-stats";
import { getHeroCombStats } from "@/lib/stats/api";
import { STATS_TTL } from "@/lib/stats/cache";
import {
  indexCombs,
  partyOdds,
  pickAdvice,
  type RankRange,
  rankRangeBadges,
} from "@/lib/stats/party";
import { statsScopeQuery, type StatsScope } from "@/lib/stats/scope";

/**
 * Every lineup the party can get, how it does, and the one change to each
 * player's picks that helps most. One request covers any party: every pair
 * for a duo, every trio from three players up.
 */
export const usePartyPlanner = (
  members: number[][],
  rankRange: RankRange,
  scope: StatsScope,
  candidates: number[],
) => {
  const badges = rankRangeBadges(rankRange);
  const filters = `${badges ? `${badges.minBadge}-${badges.maxBadge}` : "all"}:${statsScopeQuery(scope)}`;
  const players = members.filter((picks) => picks.length > 0).length;

  const pairsQuery = useStatsQuery(
    {
      key: `party:combs:2:${filters}`,
      ttl: STATS_TTL.heroCombs,
      enabled: players === 2,
    },
    () => getHeroCombStats({ size: 2, badges, scope }),
  );
  const triosQuery = useStatsQuery(
    {
      key: `party:combs:3:${filters}`,
      ttl: STATS_TTL.heroCombs,
      enabled: players >= 3,
    },
    () => getHeroCombStats({ size: 3, badges, scope }),
  );

  const pairs = useMemo(
    () => indexCombs(pairsQuery.data?.data ?? []),
    [pairsQuery.data],
  );
  const trios = useMemo(
    () => indexCombs(triosQuery.data?.data ?? []),
    [triosQuery.data],
  );
  const odds = useMemo(
    () => partyOdds(members, pairs, trios),
    [members, pairs, trios],
  );
  // The swap search re-rates every lineup per candidate hero, around 300 ms
  // for a full six-stack, so it trails the picks instead of blocking them.
  const deferredMembers = useDeferredValue(members);
  const advice = useMemo(
    () =>
      deferredMembers.map((_, index) =>
        pickAdvice(deferredMembers, index, candidates, pairs, trios),
      ),
    [deferredMembers, candidates, pairs, trios],
  );

  const query = players >= 3 ? triosQuery : pairsQuery;
  return {
    odds,
    // Advice for an older party would point at picks that already changed.
    advice: deferredMembers === members ? advice : members.map(() => null),
    isAdviceStale: deferredMembers !== members,
    isPending: query.isPending && query.fetchStatus !== "idle",
    isError: query.isError,
  };
};
