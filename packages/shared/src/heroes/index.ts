import type { DeadlockHeroes } from "../constants";
import { heroRegistry } from "./registry";

export {
  GENERIC_SKIN_CATEGORIES,
  HERO_DEFINITIONS,
  SKINS_SUPER_CATEGORY,
} from "./constants";
export { HeroRegistry, heroRegistry } from "./registry";
export type { HeroDefinition, HeroDefinitions } from "./types";

export const normalizeHero = (
  value: string | null | undefined,
): DeadlockHeroes | null => heroRegistry.normalize(value);

export const guessHero = (value: string): DeadlockHeroes | null =>
  heroRegistry.guess(value);

export const resolveHeroFromSkinCategory = (
  superCategoryName: string | undefined,
  categoryName: string | undefined,
  modName: string,
): DeadlockHeroes | null =>
  heroRegistry.resolveFromSkinCategory(
    superCategoryName,
    categoryName,
    modName,
  );
