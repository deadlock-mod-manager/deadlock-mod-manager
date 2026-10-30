import { describe, expect, it } from "bun:test";
import {
  averageBadge,
  type LiveLobby,
  matchupReport,
  scoutingTags,
  streakOf,
} from "@/lib/stats/live-lobby";
import type { ResolvedPlayer } from "@/lib/stats/live-teams";

describe("averageBadge", () => {
  it("steps over the gap between a tier's sixth subrank and the next tier", () => {
    // Ritualist 6 (106) and Emissary 1 (111) are neighbours, not five apart.
    expect(averageBadge([106, 111])).toBe(111);
    expect(averageBadge([106, 106, 111])).toBe(106);
  });

  it("ignores unranked players and has nothing to say without ranks", () => {
    expect(averageBadge([0, 101, 103])).toBe(102);
    expect(averageBadge([0])).toBeNull();
  });
});

describe("streakOf", () => {
  it("reads the run from the newest result", () => {
    expect(streakOf([false, false, false, true])).toEqual({
      won: false,
      length: 3,
    });
    expect(streakOf([true, true, true, true])).toEqual({
      won: true,
      length: 4,
    });
  });

  it("stays quiet about short runs", () => {
    expect(streakOf([true, true, false])).toBeNull();
    expect(streakOf([])).toBeNull();
  });
});

describe("matchupReport", () => {
  const heroes = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("only rates matchups with enough games and flags the worst as hardest", () => {
    const { matchups, pooled } = matchupReport(
      new Map([
        [1, { matches: 10, wins: 3 }],
        [2, { matches: 4, wins: 0 }],
        [3, { matches: 10, wins: 7 }],
      ]),
      heroes,
    );
    expect(matchups.map((matchup) => [matchup.tone, matchup.note])).toEqual([
      ["bad", "hardest"],
      ["unknown", null],
      ["good", "best"],
    ]);
    expect(pooled).toEqual({ matches: 24, wins: 10 });
  });

  it("calls nothing hardest when the worst matchup is still even", () => {
    const { matchups } = matchupReport(
      new Map([[1, { matches: 10, wins: 5 }]]),
      heroes.slice(0, 1),
    );
    expect(matchups[0]).toMatchObject({ tone: "even", note: null });
  });
});

const lobby = (overrides: Partial<LiveLobby>): LiveLobby => ({
  records: new Map(),
  ranks: new Map(),
  form: new Map(),
  mates: new Map(),
  enemies: new Map(),
  matchups: new Map(),
  isPending: false,
  ...overrides,
});
const entry = (isLocal = false): ResolvedPlayer => ({
  player: {
    name: "Player",
    accountId: 7,
    heroId: 1,
    heroName: null,
    souls: null,
    level: null,
    kills: null,
    deaths: null,
    assists: null,
    objectiveDamage: null,
    isLocal,
    isDead: false,
  },
  hero: undefined,
});

describe("scoutingTags", () => {
  it("tells an enemy who mostly beat you apart from one you split games with", () => {
    const beat = lobby({ enemies: new Map([[7, { matches: 3, wins: 1 }]]) });
    const split = lobby({ enemies: new Map([[7, { matches: 4, wins: 2 }]]) });
    expect(scoutingTags(beat, entry(), true)[0]).toEqual({
      kind: "beatYou",
      lost: 2,
      count: 3,
    });
    expect(scoutingTags(split, entry(), true)[0]).toEqual({
      kind: "againstYou",
      count: 4,
    });
  });

  it("never tags you with your own history or a missing record", () => {
    const met = lobby({ mates: new Map([[7, { matches: 3, wins: 1 }]]) });
    expect(scoutingTags(met, entry(true), false)).toEqual([]);
    expect(scoutingTags(met, entry(), false)).toEqual([
      { kind: "withYou", count: 3 },
      { kind: "noRecord" },
    ]);
  });
});
