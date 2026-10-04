import type { ModDto } from "@deadlock-mods/shared";

/** The hero with the most mods, ties going to the first seen. */
export const getTopHero = (mods: Pick<ModDto, "hero">[]): string | null => {
  const counts = new Map<string, number>();
  let top: string | null = null;
  for (const { hero } of mods) {
    if (!hero) continue;
    const count = (counts.get(hero) ?? 0) + 1;
    counts.set(hero, count);
    if (!top || count > (counts.get(top) ?? 0)) top = hero;
  }
  return top;
};
