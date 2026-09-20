import { describe, expect, it } from "vitest";
import {
  ALL_SECTIONS,
  decodeSections,
  encodeSections,
  SECTION_KEYS,
} from "./sections";

describe("sections", () => {
  it("keeps the default of everything on out of the url", () => {
    expect(encodeSections(ALL_SECTIONS)).toBeUndefined();
    expect(decodeSections(undefined)).toEqual(ALL_SECTIONS);
  });

  it("round-trips every combination", () => {
    for (let mask = 0; mask < 1 << SECTION_KEYS.length; mask++) {
      const sections = SECTION_KEYS.reduce(
        (acc, key, index) => {
          acc[key] = (mask & (1 << index)) !== 0;
          return acc;
        },
        { ...ALL_SECTIONS },
      );
      expect(decodeSections(encodeSections(sections))).toEqual(sections);
    }
  });

  it("turns everything off for an empty selection", () => {
    expect(decodeSections("")).toEqual({
      build: false,
      abilities: false,
      rules: false,
    });
  });

  it("ignores codes it does not know", () => {
    expect(decodeSections("bz")).toEqual({
      build: true,
      abilities: false,
      rules: false,
    });
  });
});
