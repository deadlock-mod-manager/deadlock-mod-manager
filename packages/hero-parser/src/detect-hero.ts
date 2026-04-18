import { extractInternalName, lookupHero } from "./mapping";

export type HeroDetectionResult = {
  hero: string | null;
  heroDisplay: string | null;
  category: "hero" | "other";
  internalNames: string[];
  usesCriticalPaths: boolean;
  criticalPaths: string[];
};

const CRITICAL_GAME_PATHS = new Set([
  "scripts/abilities.vdata_c",
  "scripts/heroes.vdata_c",
  "scripts/generic_data.vdata_c",
]);

function findCriticalPaths(paths: string[]): string[] {
  const found: string[] = [];
  for (const path of paths) {
    if (CRITICAL_GAME_PATHS.has(path) && !found.includes(path)) {
      found.push(path);
    }
  }
  return found;
}

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

  const criticalPaths = findCriticalPaths(entryPaths);
  const usesCriticalPaths = criticalPaths.length > 0;

  if (heroCounts.size === 0) {
    return {
      hero: null,
      heroDisplay: null,
      category: "other",
      internalNames,
      usesCriticalPaths,
      criticalPaths,
    };
  }

  let primaryHeroKey = "";
  let maxCount = 0;
  let isTied = false;
  for (const [key, count] of heroCounts) {
    if (count > maxCount) {
      maxCount = count;
      primaryHeroKey = key;
      isTied = false;
    } else if (count === maxCount) {
      isTied = true;
    }
  }

  if (isTied) {
    return {
      hero: null,
      heroDisplay: null,
      category: "other",
      internalNames,
      usesCriticalPaths,
      criticalPaths,
    };
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
    usesCriticalPaths,
    criticalPaths,
  };
}
