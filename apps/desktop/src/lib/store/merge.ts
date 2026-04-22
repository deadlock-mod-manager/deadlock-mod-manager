import type { State } from ".";

export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// Recursively merge `incoming` into `base`, only walking into plain objects.
// Arrays, scalars, and class instances on `incoming` win wholesale; functions on
// `incoming` are dropped so we never overwrite the action methods bound to the
// live store. Used for opted-in nested settings objects so adding a new field
// does not strip sibling defaults on hydration.
export const deepMergeOne = (base: unknown, incoming: unknown): unknown => {
  if (incoming === undefined) {
    return base;
  }
  if (!isPlainObject(base) || !isPlainObject(incoming)) {
    return incoming;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === "function") {
      continue;
    }
    out[key] = deepMergeOne(base[key], value);
  }
  return out;
};

// Build a zustand `merge` callback that performs a per-key merge between the
// freshly persisted snapshot and the in-memory default state. Top-level keys
// listed in `deepKeys` are deep-merged so newly-added nested defaults survive;
// every other key is taken as-is from persisted state (the zustand default).
//
// Functions on `persisted` (which should not exist post-JSON, but let's be
// defensive) are always dropped so action methods on the in-memory state
// remain bound.
export const buildPersistMerge =
  (deepKeys: ReadonlySet<string>) =>
  (persisted: unknown, current: State): State => {
    if (!isPlainObject(persisted)) {
      return current;
    }
    const out = { ...current } as Record<string, unknown>;
    for (const [key, value] of Object.entries(persisted)) {
      if (typeof value === "function") {
        continue;
      }
      if (deepKeys.has(key)) {
        out[key] = deepMergeOne(
          (current as unknown as Record<string, unknown>)[key],
          value,
        );
      } else {
        out[key] = value;
      }
    }
    return out as unknown as State;
  };
