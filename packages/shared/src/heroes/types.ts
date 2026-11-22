import type { DeadlockHeroes } from "../constants";

export type HeroDefinition = {
  aliases?: readonly string[];
  fuzzyTokens?: readonly string[];
  phrases?: readonly (readonly string[])[];
  regexSnippets?: readonly string[];
};

export type HeroDefinitions = Record<DeadlockHeroes, HeroDefinition>;

export type SkinCategoryPath = {
  root?: string;
  parent?: string;
  category?: string;
};
