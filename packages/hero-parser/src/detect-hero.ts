import { extractInternalName, lookupHero } from "./mapping";

/** What a mod's files change; mirrors `content` in `src-rs/types.rs`. */
export type HeroContent = "visual" | "sound" | "other";

export type HeroDetectionResult = {
  hero: string | null;
  heroDisplay: string | null;
  category: "hero" | "other";
  content: HeroContent;
  internalNames: string[];
  usesCriticalPaths: boolean;
  criticalPaths: string[];
};

const CRITICAL_GAME_PATHS = new Set([
  "scripts/abilities.vdata_c",
  "scripts/heroes.vdata_c",
  "scripts/generic_data.vdata_c",
]);

const VISUAL_EXTENSIONS = new Set([
  "vmdl_c",
  "vmesh_c",
  "vmorf_c",
  "vmat_c",
  "vtex_c",
]);
const SOUND_EXTENSIONS = new Set(["vsnd_c", "vsndevts_c", "vsndstck_c"]);

/** Panorama textures are UI art that sound packs ship too, so they never count as visual. */
function detectContent(paths: string[]): HeroContent {
  let hasSound = false;
  for (const path of paths) {
    const ext = path.slice(path.lastIndexOf(".") + 1);
    if (VISUAL_EXTENSIONS.has(ext) && !path.startsWith("panorama/")) {
      return "visual";
    }
    hasSound ||=
      SOUND_EXTENSIONS.has(ext) ||
      path.startsWith("sounds/") ||
      path.startsWith("soundevents/");
  }
  return hasSound ? "sound" : "other";
}

function findCriticalPaths(paths: string[]): string[] {
  const found: string[] = [];
  for (const path of paths) {
    if (CRITICAL_GAME_PATHS.has(path) && !found.includes(path)) {
      found.push(path);
    }
  }
  return found;
}

export function resolveDetectedHeroLabel(
  result: HeroDetectionResult,
): string | null {
  return result.heroDisplay ?? result.hero ?? null;
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
  const content = detectContent(entryPaths);

  if (heroCounts.size === 0) {
    return {
      hero: null,
      heroDisplay: null,
      category: "other",
      content,
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
      content,
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
    content,
    internalNames,
    usesCriticalPaths,
    criticalPaths,
  };
}
