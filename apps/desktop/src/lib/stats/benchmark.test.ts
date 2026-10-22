import { describe, expect, it } from "bun:test";
import type { MetricSpread } from "@/lib/stats/api";
import { bracketRows, shareBelow } from "@/lib/stats/benchmark";

const spread = (values: number[]): MetricSpread => {
  const [p1, p5, p10, p25, p50, p75, p90, p95, p99] = values;
  return {
    avg: p50 ?? 0,
    percentile1: p1 ?? 0,
    percentile5: p5 ?? 0,
    percentile10: p10 ?? 0,
    percentile25: p25 ?? 0,
    percentile50: p50 ?? 0,
    percentile75: p75 ?? 0,
    percentile90: p90 ?? 0,
    percentile95: p95 ?? 0,
    percentile99: p99 ?? 0,
  };
};

describe("shareBelow", () => {
  const deaths = spread([1, 2, 3, 4, 6, 8, 10, 11, 14]);

  it("interpolates between the reported percentiles", () => {
    expect(shareBelow(5, deaths)).toBeCloseTo(0.375);
  });

  it("stays inside the bracket past either end", () => {
    expect(shareBelow(0, deaths)).toBeCloseTo(0.005);
    expect(shareBelow(40, deaths)).toBeCloseTo(0.995);
  });
});

describe("bracketRows", () => {
  it("flips the standing for deaths, where fewer is better", () => {
    const rows = bracketRows(
      { deaths: spread([1, 2, 3, 4, 6, 8, 10, 11, 14]) },
      { deaths: 4 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.beats).toBeCloseTo(0.75);
  });

  it("skips metrics either side is missing", () => {
    expect(
      bracketRows(
        { kda: spread([0, 1, 1, 2, 3, 5, 8, 10, 15]) },
        { accuracy: 0.5 },
      ),
    ).toEqual([]);
  });
});
