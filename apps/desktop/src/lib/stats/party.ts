import type { BadgeRange, HeroCombStats } from "@/lib/stats/api";

/** Deadlock queues parties of up to six, a full team. */
export const MAX_PARTY_SIZE = 6;

/** Each player offers up to three heroes in queue; the game gives them one. */
export const MAX_PICKS = 3;

/**
 * Below this many matches a lineup's winrate is mostly noise, so the list mutes
 * it instead of hiding it: a rare lineup is still one the party can get.
 */
export const LOW_SAMPLE_MATCHES = 200;

/** Swaps that move the expected winrate by less than this are noise. */
const MIN_SWAP_GAIN = 0.005;

/** Inclusive rank tiers, 0 (Obscurus) to 11 (Eternus). `null` is every rank. */
export type RankRange = { minTier: number; maxTier: number } | null;

/** Tiers hold subranks 1 to 6; Obscurus has none and is badge 0. */
export const rankRangeBadges = (range: RankRange): BadgeRange =>
  range
    ? {
        minBadge: range.minTier === 0 ? 0 : range.minTier * 10 + 1,
        maxBadge: range.maxTier * 10 + 6,
      }
    : null;

type CombRecord = { wins: number; matches: number };

/** Records keyed by their sorted hero ids, e.g. `"10,11,13"`. */
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
  /** Matches as exactly this lineup; null for an estimate. */
  matches: number | null;
  /** Matches behind the winrate: the exact count, or the trios' total. */
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

/**
 * Pairs and trios have exact records. deadlock-api cannot hand out every set
 * of four or more in one request, so a larger lineup is estimated from the
 * trios inside it, weighted by how often each was played.
 */
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

/**
 * Every lineup the game can hand the party: one pick per player, and never the
 * same hero twice. Players without a pick yet are left out.
 */
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
  /** Mean winrate over the lineups with data, each counted the same. */
  expected: number | null;
  isEstimate: boolean;
}

type Rater = (members: number[][]) => PartyOdds;

/**
 * Rates parties against one pair and trio index. Lineup stats are memoized,
 * since the swap search re-rates the same lineups once per candidate hero.
 */
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

/**
 * What the party can expect, best lineup first. The game does not say how it
 * picks among a player's heroes, so every lineup counts the same.
 */
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
  /** The pick to give up; null when the player has a free slot. */
  replace: number | null;
  heroId: number;
  /** Change to the party's expected winrate. */
  gain: number;
}

/**
 * The one change to a player's picks that lifts the party's expected winrate
 * most: filling a free slot, or else swapping out their weakest pick. Null
 * when no hero would help.
 */
export const pickAdvice = (
  members: number[][],
  memberIndex: number,
  candidates: number[],
  pairs: CombIndex,
  trios: CombIndex,
): PickAdvice | null => {
  const rate = createRater(pairs, trios);
  /**
   * Whether `lineup` has a well-played record with `heroId` in it: the exact
   * pair or trio, or for bigger lineups a trio inside it. One win reads as
   * 100%, and an estimate can come from trios without the hero at all.
   */
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
          // The weakest pick is the one the party does best without.
          .sort((a, b) => (b.without ?? 0) - (a.without ?? 0))[0]?.heroId ??
        null);
  const kept = picks.filter((pick) => pick !== replace);
  // Lineups hold one hero per player with picks, in party order.
  const slot = members
    .slice(0, memberIndex)
    .filter((entry) => entry.length > 0).length;

  let best: PickAdvice | null = null;
  for (const heroId of candidates) {
    if (picks.includes(heroId)) continue;
    const { lineups, expected } = withPicks([...kept, heroId]);
    // Lineups without data leave the mean, so a hero this player has no
    // record on would look like a gain just for dropping the pick it replaces.
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
