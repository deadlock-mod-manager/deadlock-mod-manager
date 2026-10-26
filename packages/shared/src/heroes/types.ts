import type { DeadlockHeroes } from "../constants";

export type HeroDefinition = {
  aliases?: readonly string[];
  fuzzyTokens?: readonly string[];
  phrases?: readonly (readonly string[])[];
  regexSnippets?: readonly string[];
};

export type HeroDefinitions = Record<DeadlockHeroes, HeroDefinition>;

/** A submission's GameBanana category names, from the top level down. */
export type SkinCategoryPath = {
  root?: string;
  parent?: string;
  category?: string;
};
