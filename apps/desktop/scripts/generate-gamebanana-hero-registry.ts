import {
  DeadlockHeroes,
  DeadlockHeroesByAlias,
  HERO_DEFINITIONS,
} from "@deadlock-mods/shared";

const outputPath = new URL(
  "../src-tauri/src/providers/gamebanana/generated_hero_registry.rs",
  import.meta.url,
);

const rustString = (value: string): string =>
  `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

const rustValues = (values: readonly string[]): string =>
  `&[${values.map(rustString).join(", ")}]`;

const table = (
  name: string,
  rows: ReadonlyArray<readonly [string, readonly string[]]>,
): string => {
  const entries = rows
    .filter(([, values]) => values.length > 0)
    .map(([hero, values]) => `  (${rustString(hero)}, ${rustValues(values)}),`)
    .join("\n");

  return `pub const ${name}: &[(&str, &[&str])] = &[\n${entries}\n];`;
};

const aliases: Array<readonly [string, readonly string[]]> = [];
const fuzzyTokens: Array<readonly [string, readonly string[]]> = [];
const phrases: Array<readonly [string, readonly string[]]> = [];

for (const hero of Object.values(DeadlockHeroes)) {
  const definition = HERO_DEFINITIONS[hero];
  aliases.push([
    hero,
    [
      ...new Set([
        hero,
        DeadlockHeroesByAlias[hero],
        ...(definition.aliases ?? []),
      ]),
    ],
  ]);
  fuzzyTokens.push([hero, definition.fuzzyTokens ?? []]);
  const aliasPhrases = (definition.aliases ?? []).filter((alias) =>
    alias.includes(" "),
  );
  const snippetPhrases = (definition.regexSnippets ?? []).map((snippet) =>
    snippet.replaceAll("[^a-z0-9]*", " "),
  );
  phrases.push([
    hero,
    [
      ...(definition.phrases ?? []).map((parts) => parts.join(" ")),
      ...aliasPhrases,
      ...snippetPhrases,
    ],
  ]);
}

const output = `// Generated from packages/shared/src/heroes/.
// Run apps/desktop/scripts/generate-gamebanana-hero-registry.ts after edits.

${table("HERO_ALIASES", aliases)}

${table("HERO_FUZZY_TOKENS", fuzzyTokens)}

${table("HERO_PHRASES", phrases)}
`;

await Bun.write(outputPath, output);
