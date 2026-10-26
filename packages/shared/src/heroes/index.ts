import type { DeadlockHeroes } from "../constants";
import { heroRegistry } from "./registry";
import type { SkinCategoryPath } from "./types";

export { HERO_DEFINITIONS, SKINS_SUPER_CATEGORY } from "./constants";
export { HeroRegistry, heroRegistry } from "./registry";
export type {
  HeroDefinition,
  HeroDefinitions,
  SkinCategoryPath,
} from "./types";

export const normalizeHero = (
  value: string | null | undefined,
): DeadlockHeroes | null => heroRegistry.normalize(value);

export const guessHero = (value: string): DeadlockHeroes | null =>
  heroRegistry.guess(value);

export const resolveHeroFromSkinCategory = (
  path: SkinCategoryPath,
  modName: string,
): DeadlockHeroes | null => heroRegistry.resolveFromSkinCategory(path, modName);
