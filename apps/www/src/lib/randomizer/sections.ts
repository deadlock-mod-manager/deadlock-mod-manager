/**
 * Which parts of a roll the page shows. The roll itself always contains all of
 * them - a hidden section must not shift the random stream, or the same seed
 * would hand out a different hero depending on what was ticked.
 */

export const SECTION_KEYS = ["build", "abilities", "rules"] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export type Sections = Record<SectionKey, boolean>;

export const SECTION_LABELS: Record<SectionKey, string> = {
  build: "Build order",
  abilities: "Abilities",
  rules: "Rules",
};

export const ALL_SECTIONS: Sections = {
  build: true,
  abilities: true,
  rules: true,
};

const CODES: Record<SectionKey, string> = {
  build: "b",
  abilities: "a",
  rules: "r",
};

/** Everything on is the default, and stays out of the URL entirely. */
export const encodeSections = (sections: Sections): string | undefined => {
  if (SECTION_KEYS.every((key) => sections[key])) {
    return undefined;
  }
  return SECTION_KEYS.filter((key) => sections[key])
    .map((key) => CODES[key])
    .join("");
};

export const decodeSections = (value: string | undefined): Sections => {
  if (value === undefined) {
    return ALL_SECTIONS;
  }
  return SECTION_KEYS.reduce<Sections>(
    (sections, key) => {
      sections[key] = value.includes(CODES[key]);
      return sections;
    },
    { ...ALL_SECTIONS },
  );
};
