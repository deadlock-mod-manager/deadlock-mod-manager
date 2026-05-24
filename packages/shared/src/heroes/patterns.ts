import { DeadlockHeroes, DeadlockHeroesByAlias } from "../constants";
import { isSingleWordDisplayName, normalizeHeroKey } from "./normalize";
import type { HeroDefinitions } from "./types";

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tokenPattern = (pattern: string): RegExp =>
  new RegExp(`(?:^|[^a-z0-9])${pattern}(?:$|[^a-z0-9])`, "i");

const word = (value: string): RegExp => tokenPattern(escapeRegex(value));

const phrase = (...parts: string[]): RegExp =>
  tokenPattern(parts.map(escapeRegex).join("[^a-z0-9]+"));

export const buildKnownAliases = (
  definitions: HeroDefinitions,
): Map<string, DeadlockHeroes> => {
  const knownAliases = new Map<string, DeadlockHeroes>();

  for (const hero of Object.values(DeadlockHeroes)) {
    const definition = definitions[hero];
    const aliasValues = [
      hero,
      DeadlockHeroesByAlias[hero],
      ...(definition.aliases ?? []),
    ];

    for (const alias of aliasValues) {
      knownAliases.set(normalizeHeroKey(alias), hero);
    }
  }

  return knownAliases;
};

export const buildKnownRegexes = (
  definitions: HeroDefinitions,
): Map<DeadlockHeroes, RegExp[]> => {
  const knownRegexes = new Map<DeadlockHeroes, RegExp[]>();

  for (const hero of Object.values(DeadlockHeroes)) {
    const definition = definitions[hero];
    const patterns: RegExp[] = [];
    const seenWords = new Set<string>();

    const addWord = (token: string) => {
      const normalizedToken = normalizeHeroKey(token);
      if (normalizedToken.length === 0 || seenWords.has(normalizedToken)) {
        return;
      }

      seenWords.add(normalizedToken);
      patterns.push(word(normalizedToken));
    };

    if (isSingleWordDisplayName(hero)) {
      addWord(hero);
    }

    for (const token of definition.fuzzyTokens ?? []) {
      addWord(token);
    }

    for (const alias of definition.aliases ?? []) {
      const aliasParts = normalizeHeroKey(alias).split(" ");
      if (aliasParts.length === 1) {
        addWord(aliasParts[0]);
      }
    }

    for (const phraseParts of definition.phrases ?? []) {
      patterns.push(phrase(...phraseParts));
    }

    for (const alias of definition.aliases ?? []) {
      const aliasParts = normalizeHeroKey(alias).split(" ");
      if (aliasParts.length > 1) {
        patterns.push(phrase(...aliasParts));
      }
    }

    for (const snippet of definition.regexSnippets ?? []) {
      patterns.push(tokenPattern(snippet));
    }

    knownRegexes.set(hero, patterns);
  }

  return knownRegexes;
};
