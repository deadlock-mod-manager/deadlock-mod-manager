import type { DeadlockHeroes } from "../constants";

export const normalizeHeroKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/['`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const isSingleWordDisplayName = (hero: DeadlockHeroes): boolean =>
  !normalizeHeroKey(hero).includes(" ");
