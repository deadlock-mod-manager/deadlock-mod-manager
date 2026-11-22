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
