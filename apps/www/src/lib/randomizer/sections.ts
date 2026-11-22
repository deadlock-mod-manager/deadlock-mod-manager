export const SECTION_KEYS = ["build", "abilities", "rules"] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

export type Sections = Record<SectionKey, boolean>;

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
