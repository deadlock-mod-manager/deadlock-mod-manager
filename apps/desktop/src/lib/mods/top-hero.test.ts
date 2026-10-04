import { describe, expect, test } from "bun:test";
import { getTopHero } from "./top-hero";

describe("getTopHero", () => {
  test("returns the hero with the most mods", () => {
    expect(
      getTopHero([
        { hero: "Haze" },
        { hero: "Calico" },
        { hero: null },
        { hero: "Calico" },
      ]),
    ).toBe("Calico");
  });

  test("keeps the first hero seen on a tie", () => {
    expect(getTopHero([{ hero: "Haze" }, { hero: "Calico" }])).toBe("Haze");
  });

  test("returns null when no mod targets a hero", () => {
    expect(getTopHero([{ hero: null }])).toBeNull();
    expect(getTopHero([])).toBeNull();
  });
});
