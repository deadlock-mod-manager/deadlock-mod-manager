export type BisectOutcome = "fail" | "pass" | "unresolved";

export type BisectAlgoState = {
  found: string[];
  pool: string[];
  low: number;
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

export const suspectCount = (state: BisectAlgoState) =>
  state.found.length + Math.max(state.high - Math.max(state.low, 0), 0);

export const nextStep = (initial: BisectAlgoState): BisectStep => {
  const state: BisectAlgoState = { ...initial };
  const snapshot = () => ({ ...state });
  for (;;) {
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

export const estimateRounds = (count: number) => {
  const depth = Math.ceil(Math.log2(Math.max(count, 2)));
  return { min: depth + 2, max: 2 * depth + 3 };
};
