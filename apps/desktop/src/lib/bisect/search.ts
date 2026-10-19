/**
 * Finds the smallest set of mods that breaks the game, one launch per step.
 * Each pass binary-searches the shortest run of `pool` that still breaks with
 * `found` on: its last mod is needed, so it joins `found` and the search goes
 * on in the mods before it. That takes about log2(n) launches per culprit, so
 * a single bad mod and a pair that only breaks together are both found fast.
 * Assumes turning more mods on never fixes the problem.
 */

export type BisectOutcome = "fail" | "pass" | "unresolved";

export type BisectAlgoState = {
  /** Mods known to be needed for the problem. */
  found: string[];
  /** Candidates still suspected, in a fixed order. */
  pool: string[];
  /** Longest run of `pool` known to work; -1 until `found` alone is tested. */
  low: number;
  /** Shortest run of `pool` known to break. */
  high: number;
  results: Record<string, BisectOutcome>;
};

export type BisectStep =
  | { kind: "test"; config: string[]; state: BisectAlgoState }
  | { kind: "done"; culprits: string[]; state: BisectAlgoState };

const configKey = (config: string[]) => JSON.stringify([...config].sort());

export const createBisect = (candidates: string[]): BisectAlgoState => ({
  found: [],
  pool: [...candidates],
  low: -1,
  high: candidates.length,
  results: {},
});

export const recordOutcome = (
  state: BisectAlgoState,
  config: string[],
  outcome: BisectOutcome,
): BisectAlgoState => ({
  ...state,
  results: { ...state.results, [configKey(config)]: outcome },
});

/** How many mods could still be to blame. */
export const suspectCount = (state: BisectAlgoState) =>
  state.found.length + Math.max(state.high - Math.max(state.low, 0), 0);

/**
 * Walks past every configuration that already has a result and returns the
 * next one to launch, or the culprits. "Can't tell" counts as working. With
 * nothing found yet, the first launch has every candidate off, which rules
 * the mods out entirely when the problem stays.
 */
export const nextStep = (initial: BisectAlgoState): BisectStep => {
  // A working copy: the loop rewrites it in place until a step is decided.
  const state: BisectAlgoState = { ...initial };
  const snapshot = () => ({ ...state });
  for (;;) {
    // Answers that contradict each other can leave no run to split.
    if (state.low >= state.high) {
      return { kind: "done", culprits: state.found, state: snapshot() };
    }
    if (state.low >= 0 && state.high - state.low === 1) {
      state.found = [...state.found, state.pool[state.high - 1]];
      state.pool = state.pool.slice(0, state.high - 1);
      state.low = -1;
      state.high = state.pool.length;
      continue;
    }

    const length = state.low < 0 ? 0 : Math.floor((state.low + state.high) / 2);
    const config = [...state.found, ...state.pool.slice(0, length)];
    const result = state.results[configKey(config)];
    if (result === undefined) {
      return { kind: "test", config, state: snapshot() };
    }
    if (result === "fail") {
      if (length === 0) {
        return { kind: "done", culprits: state.found, state: snapshot() };
      }
      state.high = length;
    } else {
      state.low = length;
    }
  }
};

/** Most launches for one bad mod, and for a pair that only breaks together. */
export const estimateRounds = (count: number) => {
  const depth = Math.ceil(Math.log2(Math.max(count, 2)));
  return { min: depth + 2, max: 2 * depth + 3 };
};
