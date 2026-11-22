import { DeadlockHeroes } from "../constants";
import { HERO_DEFINITIONS, SKINS_SUPER_CATEGORY } from "./constants";
import { normalizeHeroKey } from "./normalize";
import { buildKnownAliases, buildKnownRegexes } from "./patterns";
import type { HeroDefinitions, SkinCategoryPath } from "./types";

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
    path: SkinCategoryPath,
    modName: string,
  ): DeadlockHeroes | null {
    return this.heroFromCategoryPath(path) ?? this.guess(modName);
  }

  // Skins nest as Skins > hero > style (e.g. Faithful/Vanilla+), so the hero is
  // the category or its parent. Profiles omit the root; no other root has
  // hero-named children, so a parent naming a hero is enough on its own.
  private heroFromCategoryPath({
    root,
    parent,
    category,
  }: SkinCategoryPath): DeadlockHeroes | null {
    if (root && root !== SKINS_SUPER_CATEGORY) return null;
    const isSkin =
      root === SKINS_SUPER_CATEGORY || parent === SKINS_SUPER_CATEGORY;
    return (isSkin ? this.normalize(category) : null) ?? this.normalize(parent);
  }
}

export const heroRegistry = HeroRegistry.instance;
