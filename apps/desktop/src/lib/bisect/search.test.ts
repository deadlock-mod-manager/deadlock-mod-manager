import { describe, expect, it } from "bun:test";
import {
  type BisectOutcome,
  createBisect,
  estimateRounds,
  nextStep,
  recordOutcome,
} from "./search";

const mods = (count: number) =>
  Array.from({ length: count }, (_, index) => `mod-${index}`);

/** Plays every round against `breaks`, as a user answering honestly would. */
const run = (
  candidates: string[],
  breaks: (enabled: Set<string>) => BisectOutcome,
) => {
  let state = createBisect(candidates);
  const tested: string[][] = [];
  for (;;) {
    const step = nextStep(state);
    if (step.kind === "done") return { culprits: step.culprits, tested };
    tested.push(step.config);
    state = recordOutcome(
      step.state,
      step.config,
      breaks(new Set(step.config)),
    );
  }
};

const brokenWhenAllOn =
  (...culprits: string[]) =>
  (enabled: Set<string>): BisectOutcome =>
    culprits.every((id) => enabled.has(id)) ? "fail" : "pass";

describe("mod bisect", () => {
  it("tests with every candidate off first", () => {
    const step = nextStep(createBisect(mods(4)));
    expect(step).toMatchObject({ kind: "test", config: [] });
  });

  it("ends when the problem remains with every candidate off", () => {
    const { culprits, tested } = run(mods(8), () => "fail");
    expect(culprits).toEqual([]);
    expect(tested).toEqual([[]]);
  });

  it("finds a single culprit at every position within the estimate", () => {
    for (const count of [1, 2, 12, 100]) {
      const candidates = mods(count);
      const { min } = estimateRounds(count);
      for (const culprit of candidates) {
        const { culprits, tested } = run(candidates, brokenWhenAllOn(culprit));
        expect(culprits).toEqual([culprit]);
        expect(tested.length).toBeLessThanOrEqual(min);
      }
    }
  });

  it("finds every pair that only breaks together within the estimate", () => {
    const candidates = mods(12);
    const { max } = estimateRounds(candidates.length);
    for (const first of candidates) {
      for (const second of candidates) {
        if (first >= second) continue;
        const { culprits, tested } = run(
          candidates,
          brokenWhenAllOn(first, second),
        );
        expect([...culprits].sort()).toEqual([first, second].sort());
        expect(tested.length).toBeLessThanOrEqual(max);
      }
    }
  });

  it("never launches the same set of mods twice", () => {
    const { tested } = run(mods(12), brokenWhenAllOn("mod-3", "mod-4"));
    const keys = tested.map((config) => [...config].sort().join(","));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("still finishes when answers contradict each other", () => {
    let answer = 0;
    const { tested } = run(mods(16), () =>
      answer++ % 2 === 0 ? "pass" : "fail",
    );
    expect(tested.length).toBeLessThan(40);
  });
});
