import { describe, expect, it } from "bun:test";
import { averageBadge, streakOf } from "@/lib/stats/live-lobby";

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
