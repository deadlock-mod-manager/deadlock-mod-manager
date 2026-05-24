import { DeadlockHeroes } from "../constants";
import {
  GENERIC_SKIN_CATEGORIES,
  HERO_DEFINITIONS,
  SKINS_SUPER_CATEGORY,
} from "./constants";
import { normalizeHeroKey } from "./normalize";
import { buildKnownAliases, buildKnownRegexes } from "./patterns";
import type { HeroDefinitions } from "./types";

export class HeroRegistry {
  private readonly knownAliases: Map<string, DeadlockHeroes>;
  private readonly knownRegexes: Map<DeadlockHeroes, RegExp[]>;

  private constructor(definitions: HeroDefinitions) {
    this.knownAliases = buildKnownAliases(definitions);
    this.knownRegexes = buildKnownRegexes(definitions);
  }

  static readonly instance = new HeroRegistry(HERO_DEFINITIONS);

  normalize(value: string | null | undefined): DeadlockHeroes | null {
    if (!value) return null;
    return this.knownAliases.get(normalizeHeroKey(value)) ?? null;
  }

  guess(value: string): DeadlockHeroes | null {
    const exactHero = this.normalize(value);
    if (exactHero) return exactHero;

    const normalizedValue = value.toLowerCase();

    for (const hero of Object.values(DeadlockHeroes)) {
      const patterns = this.knownRegexes.get(hero) ?? [];
      if (patterns.some((pattern) => pattern.test(normalizedValue))) {
        return hero;
      }
    }

    return null;
  }

  resolveFromSkinCategory(
    superCategoryName: string | undefined,
    categoryName: string | undefined,
    modName: string,
  ): DeadlockHeroes | null {
    const fromCategory =
      superCategoryName === SKINS_SUPER_CATEGORY &&
      categoryName &&
      !GENERIC_SKIN_CATEGORIES.has(categoryName)
        ? this.normalize(categoryName)
        : null;

    return fromCategory ?? this.guess(modName);
  }
}

export const heroRegistry = HeroRegistry.instance;
