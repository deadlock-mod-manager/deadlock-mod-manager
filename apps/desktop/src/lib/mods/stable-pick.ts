const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const pickStable = <T>(
  items: readonly T[],
  seed: string,
): T | undefined => {
  if (items.length === 0) return undefined;
  return items[hashString(seed) % items.length];
};
