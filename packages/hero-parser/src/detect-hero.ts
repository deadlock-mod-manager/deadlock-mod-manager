import { extractInternalName, lookupHero } from "./mapping";

export type HeroDetectionResult = {
  hero: string | null;
  heroDisplay: string | null;
  category: "hero" | "other";
  internalNames: string[];
};

export function detectHero(entryPaths: string[]): HeroDetectionResult {
  const heroCounts = new Map<string, number>();
  const internalNames: string[] = [];

  for (const path of entryPaths) {
    const name = extractInternalName(path);
    if (!name) continue;

    if (!internalNames.includes(name)) {
      internalNames.push(name);
    }

    const hero = lookupHero(name);
    if (hero) {
      heroCounts.set(hero.enumKey, (heroCounts.get(hero.enumKey) ?? 0) + 1);
    }
  }

  if (heroCounts.size === 0) {
    return {
      hero: null,
      heroDisplay: null,
      category: "other",
      internalNames,
    };
  }

  let primaryHeroKey = "";
  let maxCount = 0;
  for (const [key, count] of heroCounts) {
    if (count > maxCount) {
      maxCount = count;
      primaryHeroKey = key;
    }
  }

  const displayName =
    internalNames
      .map((name) => lookupHero(name))
      .find((h) => h?.enumKey === primaryHeroKey)?.displayName ?? null;

  return {
    hero: primaryHeroKey,
    heroDisplay: displayName,
    category: "hero",
    internalNames,
  };
}
