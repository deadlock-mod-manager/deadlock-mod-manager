import { describe, expect, it } from "bun:test";
import {
  indexCombs,
  lineupStat,
  partyLineups,
  partyOdds,
  pickAdvice,
  rankRangeBadges,
} from "@/lib/stats/party";

const comb = (heroIds: number[], wins: number, matches: number) => ({
  hero_ids: heroIds,
  wins,
  matches,
});

const NONE = indexCombs([]);

describe("partyLineups", () => {
  it("gives each player one pick, never the same hero twice", () => {
    expect(partyLineups([[1, 2], [2, 3], []])).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
  });
});

describe("lineupStat", () => {
  it("reads pairs and trios whatever order the players come in", () => {
    const trios = indexCombs([comb([1, 2, 3], 6, 10)]);
    expect(lineupStat([3, 1, 2], NONE, trios)).toEqual({
      winrate: 0.6,
      matches: 10,
      sample: 10,
      isEstimate: false,
    });
  });

  it("estimates four or more heroes from the trios inside, by matches", () => {
    const trios = indexCombs([
      comb([1, 2, 3], 60, 100),
      comb([1, 2, 4], 10, 100),
      comb([2, 3, 4], 30, 200),
    ]);
    // (60 + 10 + 30) wins over 400 matches; the missing trio [1, 3, 4] adds nothing.
    expect(lineupStat([1, 2, 3, 4], NONE, trios)).toEqual({
      winrate: 0.25,
      matches: null,
      sample: 400,
      isEstimate: true,
    });
  });
});

describe("partyOdds", () => {
  it("averages the lineups with data and sorts the rest last", () => {
    const pairs = indexCombs([comb([1, 3], 7, 10), comb([2, 3], 3, 10)]);
    const odds = partyOdds([[1, 2, 4], [3]], pairs, NONE);
    expect(odds.expected).toBeCloseTo(0.5);
    expect(odds.lineups.map((lineup) => lineup.heroIds)).toEqual([
      [1, 3],
      [2, 3],
      [4, 3],
    ]);
  });
});

describe("pickAdvice", () => {
  const pairs = indexCombs([
    comb([1, 5], 400, 1000),
    comb([2, 5], 500, 1000),
    comb([3, 5], 600, 1000),
    comb([4, 5], 900, 1000),
    comb([6, 5], 1, 1),
  ]);

  it("swaps out the weakest pick when every slot is taken", () => {
    const advice = pickAdvice(
      [[1, 2, 3], [5]],
      0,
      [1, 2, 3, 4, 5],
      pairs,
      NONE,
    );
    expect(advice?.replace).toBe(1);
    expect(advice?.heroId).toBe(4);
    // From (40 + 50 + 60) / 3 to (90 + 50 + 60) / 3.
    expect(advice?.gain).toBeCloseTo(50 / 300);
    expect(pickAdvice([[2, 1, 3], [5]], 0, [4], pairs, NONE)?.replace).toBe(1);
  });

  it("never suggests a hero the party has no solid record with", () => {
    // Hero 7 has no pair with 5, so its lineup would only leave the average.
    expect(pickAdvice([[1, 2, 3], [5]], 0, [7], pairs, NONE)).toBeNull();
    // Hero 6 won its one match with 5, too few to trust.
    expect(pickAdvice([[1, 2, 3], [5]], 0, [6], pairs, NONE)).toBeNull();
    // Hero 5 only has records as the teammate's pick, never as this player's.
    expect(pickAdvice([[1, 2, 3], [5]], 0, [5], pairs, NONE)).toBeNull();
    // Hero 4's estimate comes only from the teammates' trio, none with 4 in it.
    const trios = indexCombs([
      comb([5, 6, 7], 600, 1000),
      comb([1, 5, 6], 100, 1000),
    ]);
    expect(
      pickAdvice([[1, 2, 3], [5], [6], [7]], 0, [4], NONE, trios),
    ).toBeNull();
  });

  it("fills a free slot, and stays quiet when nothing helps", () => {
    expect(pickAdvice([[2], [5]], 0, [1, 4], pairs, NONE)).toEqual({
      replace: null,
      heroId: 4,
      gain: expect.closeTo(0.2),
    });
    expect(pickAdvice([[4], [5]], 0, [1, 2], pairs, NONE)).toBeNull();
  });
});

describe("rankRangeBadges", () => {
  it("spans whole tiers and starts Obscurus at badge 0", () => {
    expect(rankRangeBadges({ minTier: 8, maxTier: 11 })).toEqual({
      minBadge: 81,
      maxBadge: 116,
    });
    expect(rankRangeBadges({ minTier: 0, maxTier: 0 })?.minBadge).toBe(0);
  });
});
