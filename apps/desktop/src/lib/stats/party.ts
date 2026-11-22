import type { BadgeRange, HeroCombStats } from "@/lib/stats/api";

export const MAX_PARTY_SIZE = 6;

export const MAX_PICKS = 3;

export const LOW_SAMPLE_MATCHES = 200;

const MIN_SWAP_GAIN = 0.005;

export type RankRange = { minTier: number; maxTier: number } | null;

export const rankRangeBadges = (range: RankRange): BadgeRange =>
  range
    ? {
        minBadge: range.minTier === 0 ? 0 : range.minTier * 10 + 1,
        maxBadge: range.maxTier * 10 + 6,
      }
    : null;

type CombRecord = { wins: number; matches: number };

export type CombIndex = Map<string, CombRecord>;

const combKey = (heroIds: number[]) =>
  [...heroIds].sort((a, b) => a - b).join(",");

export const indexCombs = (combs: HeroCombStats[]): CombIndex => {
  const index: CombIndex = new Map();
  for (const comb of combs) {
    const key = combKey(comb.hero_ids);
    const total = index.get(key) ?? { wins: 0, matches: 0 };
    total.wins += comb.wins;
    total.matches += comb.matches;
    index.set(key, total);
  }
  return index;
};

export interface LineupStat {
  winrate: number;
  matches: number | null;
  sample: number;
  isEstimate: boolean;
}

const subsetsOfThree = (heroIds: number[]): number[][] => {
  const subsets: number[][] = [];
  heroIds.forEach((first, i) => {
    heroIds.slice(i + 1).forEach((second, j) => {
      for (const third of heroIds.slice(i + j + 2)) {
        subsets.push([first, second, third]);
      }
    });
  });
  return subsets;
};

export const lineupStat = (
  lineup: number[],
  pairs: CombIndex,
  trios: CombIndex,
): LineupStat | null => {
  if (lineup.length < 2) return null;
  if (lineup.length <= 3) {
    const record = (lineup.length === 2 ? pairs : trios).get(combKey(lineup));
    return record && record.matches > 0
      ? {
          winrate: record.wins / record.matches,
          matches: record.matches,
          sample: record.matches,
          isEstimate: false,
        }
      : null;
  }
  let wins = 0;
  let matches = 0;
  for (const trio of subsetsOfThree(lineup)) {
    const record = trios.get(combKey(trio));
    if (record) {
      wins += record.wins;
      matches += record.matches;
    }
  }
  return matches > 0
    ? {
        winrate: wins / matches,
        matches: null,
        sample: matches,
        isEstimate: true,
      }
    : null;
};

export const partyLineups = (members: number[][]): number[][] =>
  members
    .filter((picks) => picks.length > 0)
    .reduce<number[][]>(
      (lineups, picks) =>
        lineups.flatMap((lineup) =>
          picks
            .filter((heroId) => !lineup.includes(heroId))
            .map((heroId) => lineup.concat(heroId)),
        ),
      [[]],
    );

export interface RatedLineup {
  heroIds: number[];
  stat: LineupStat | null;
}

export interface PartyOdds {
  lineups: RatedLineup[];
  expected: number | null;
  isEstimate: boolean;
}

type Rater = (members: number[][]) => PartyOdds;

const createRater = (pairs: CombIndex, trios: CombIndex): Rater => {
  const memo = new Map<string, LineupStat | null>();
  const statOf = (heroIds: number[]) => {
    const key = heroIds.join(",");
    if (!memo.has(key)) memo.set(key, lineupStat(heroIds, pairs, trios));
    return memo.get(key) ?? null;
  };
  return (members) => {
    const lineups = partyLineups(members).map((heroIds) => ({
      heroIds,
      stat: statOf(heroIds),
    }));
    const rated = lineups.flatMap((lineup) =>
      lineup.stat ? [lineup.stat] : [],
    );
    return {
      lineups,
      expected:
        rated.length > 0
          ? rated.reduce((sum, stat) => sum + stat.winrate, 0) / rated.length
          : null,
      isEstimate: rated.some((stat) => stat.isEstimate),
    };
  };
};

export const partyOdds = (
  members: number[][],
  pairs: CombIndex,
  trios: CombIndex,
): PartyOdds => {
  const odds = createRater(pairs, trios)(members);
  return {
    ...odds,
    lineups: odds.lineups.sort(
      (a, b) => (b.stat?.winrate ?? -1) - (a.stat?.winrate ?? -1),
    ),
  };
};

export interface PickAdvice {
  replace: number | null;
  heroId: number;
  gain: number;
}

export const pickAdvice = (
  members: number[][],
  memberIndex: number,
  candidates: number[],
  pairs: CombIndex,
  trios: CombIndex,
): PickAdvice | null => {
  const rate = createRater(pairs, trios);
  const hasSolidRecord = (lineup: number[], heroId: number) =>
    (lineup.length <= 3
      ? [(lineup.length === 2 ? pairs : trios).get(combKey(lineup))]
      : subsetsOfThree(lineup)
          .filter((trio) => trio.includes(heroId))
          .map((trio) => trios.get(combKey(trio)))
    ).some((record) => (record?.matches ?? 0) >= LOW_SAMPLE_MATCHES);
  const picks = members[memberIndex] ?? [];
  const current = rate(members).expected;
  if (current === null || picks.length === 0) return null;
  const withPicks = (next: number[]) =>
    rate(members.map((entry, index) => (index === memberIndex ? next : entry)));

  const replace =
    picks.length < MAX_PICKS
      ? null
      : (picks
          .map((heroId) => ({
            heroId,
            without: withPicks(picks.filter((pick) => pick !== heroId))
              .expected,
          }))
          .sort((a, b) => (b.without ?? 0) - (a.without ?? 0))[0]?.heroId ??
        null);
  const kept = picks.filter((pick) => pick !== replace);
  const slot = members
    .slice(0, memberIndex)
    .filter((entry) => entry.length > 0).length;

  let best: PickAdvice | null = null;
  for (const heroId of candidates) {
    if (picks.includes(heroId)) continue;
    const { lineups, expected } = withPicks([...kept, heroId]);
    const hasRecord = lineups.some(
      ({ heroIds }) =>
        heroIds[slot] === heroId && hasSolidRecord(heroIds, heroId),
    );
    if (expected === null || !hasRecord) continue;
    const gain = expected - current;
    if (gain >= MIN_SWAP_GAIN && (!best || gain > best.gain)) {
      best = { replace, heroId, gain };
    }
  }
  return best;
};
