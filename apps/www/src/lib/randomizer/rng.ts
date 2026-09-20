/**
 * Deterministic randomness for the randomizer. A roll is fully described by its
 * seed, so a shared link reproduces the exact same hero, build and rules for
 * everyone who opens it - and the reroll button is just a new seed.
 */

export type Rng = () => number;

const UINT32 = 0x1_00_00_00_00;

/** mulberry32 - small, fast, and good enough for picking items out of a list. */
export const createRng = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
};

export const randomSeed = (): number =>
  Math.floor(Math.random() * UINT32) >>> 0;

export const encodeSeed = (seed: number): string => (seed >>> 0).toString(36);

export const decodeSeed = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 36);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed >>> 0 : null;
};

export const formatSeed = (seed: number): string =>
  seed.toLocaleString("en-US");

export const pick = <T>(rng: Rng, values: readonly T[]): T =>
  values[Math.floor(rng() * values.length)];

export const shuffle = <T>(rng: Rng, values: readonly T[]): T[] => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Picks one entry with the given weights. Used to bias item rolls towards the
 * upgrades Valve actually recommends for the rolled hero, without ever making
 * the rest of the shop unreachable.
 */
export const weightedPick = <T>(
  rng: Rng,
  values: readonly T[],
  weightOf: (value: T) => number,
): T => {
  const total = values.reduce((sum, value) => sum + weightOf(value), 0);
  let threshold = rng() * total;
  for (const value of values) {
    threshold -= weightOf(value);
    if (threshold <= 0) {
      return value;
    }
  }
  return values[values.length - 1];
};
