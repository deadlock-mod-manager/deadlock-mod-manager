import { describe, expect, it } from "bun:test";
import type { PerformanceCurvePoint } from "@/lib/stats/api";
import {
  curveAt,
  type LivePlayerNumbers,
  liveGradeRows,
} from "@/lib/stats/live-grades";

// Rounded from deadlock-api's curve for Wraith in the Seeker bracket.
const point = (
  game_time: number,
  values: Partial<PerformanceCurvePoint>,
): PerformanceCurvePoint => ({
  game_time,
  net_worth_avg: 0,
  net_worth_std: 0,
  kills_avg: 0,
  kills_std: 0,
  deaths_avg: 0,
  deaths_std: 0,
  assists_avg: 0,
  assists_std: 0,
  boss_damage_avg: 0,
  boss_damage_std: 0,
  samples: 12_000,
  ...values,
});

const curve = [
  point(180, {
    net_worth_avg: 1854,
    net_worth_std: 220,
    kills_avg: 0.2,
    kills_std: 0.46,
    deaths_avg: 0.17,
    deaths_std: 0.41,
    boss_damage_avg: 88,
    boss_damage_std: 217,
  }),
  point(360, {
    net_worth_avg: 4092,
    net_worth_std: 576,
    kills_avg: 0.61,
    kills_std: 0.85,
    deaths_avg: 0.46,
    deaths_std: 0.72,
    boss_damage_avg: 518,
    boss_damage_std: 749,
  }),
];

const player = (numbers: Partial<LivePlayerNumbers>): LivePlayerNumbers => ({
  kills: null,
  deaths: null,
  assists: null,
  souls: null,
  objectiveDamage: null,
  ...numbers,
});

describe("curveAt", () => {
  it("interpolates between steps and from zero before the first", () => {
    expect(curveAt(curve, "net_worth", 270)?.avg).toBeCloseTo(2973);
    expect(curveAt(curve, "net_worth", 90)?.avg).toBeCloseTo(927);
  });

  it("holds the last step past the end of the curve", () => {
    expect(curveAt(curve, "net_worth", 900)?.avg).toBe(4092);
  });
});

describe("liveGradeRows", () => {
  it("grades souls against the bracket at the same game time", () => {
    // The screenshot case: 5,400 souls at 5:33, well ahead of the curve, even
    // though 973 a minute is below a whole-match average.
    const rows = liveGradeRows({
      player: player({ souls: 5400 }),
      minutes: 5.55,
      curve,
    });
    const souls = rows.find((row) => row.metric === "soulsPerMin");

    expect(souls?.value).toBeCloseTo(973, 0);
    expect(souls?.grade).toBe("S");
  });

  it("flips deaths, so dying less grades higher", () => {
    const [deaths] = liveGradeRows({
      player: player({ deaths: 0 }),
      minutes: 6,
      curve,
    });

    expect(deaths?.metric).toBe("deaths");
    // 0 against an average of 0.46 (std 0.72): ahead of about three quarters.
    expect(deaths?.beats).toBeCloseTo(0.74, 2);
    expect(deaths?.grade).toBe("B");
  });

  it("waits for the first minute and skips metrics without data", () => {
    expect(
      liveGradeRows({ player: player({ kills: 1 }), minutes: 0.5, curve }),
    ).toEqual([]);
    expect(
      liveGradeRows({
        player: player({ kills: 1 }),
        minutes: 5,
        curve,
      }).map((row) => row.metric),
    ).toEqual(["kills"]);
  });
});
