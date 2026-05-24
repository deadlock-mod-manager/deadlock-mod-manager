import { describe, expect, it } from "vitest";
import type { LocalMod } from "@/types/mods";
import {
  matchesHeroFilter,
  resolveLocalModHero,
  resolveModHero,
} from "./hero-resolution";

const mod = (values: {
  name: string;
  hero?: string | null;
  detectedHero?: string | null;
  heroOverride?: string | null;
}) =>
  ({
    name: values.name,
    hero: values.hero ?? null,
    detectedHero: values.detectedHero,
    heroOverride: values.heroOverride,
  }) as LocalMod;

describe("resolveModHero", () => {
  it("prefers manual overrides over all automatic sources", () => {
    const localMod = mod({
      name: "Toon Seven",
      hero: "Seven",
      detectedHero: "Calico",
      heroOverride: "Victor",
    });

    expect(resolveModHero(localMod, localMod)).toMatchObject({
      hero: "Victor",
      source: "manual",
      hasOverride: true,
    });
  });

  it("prefers API heroes over stale local VPK detection", () => {
    const localMod = mod({
      name: "Toon Seven",
      hero: "Seven",
      detectedHero: "Calico",
    });

    expect(resolveModHero(localMod, localMod)).toMatchObject({
      hero: "Seven",
      source: "api",
    });
  });

  it("uses name aliases before VPK detection when the API is missing a hero", () => {
    const localMod = mod({
      name: "Toon Viktor",
      hero: null,
      detectedHero: "Infernus",
    });

    expect(resolveModHero(localMod, localMod)).toMatchObject({
      hero: "Victor",
      source: "name",
    });
  });

  it("can manually mark a local mod as general or other", () => {
    const localMod = mod({
      name: "Mystery Pack",
      hero: "Seven",
      heroOverride: null,
    });

    expect(resolveModHero(localMod, localMod)).toMatchObject({
      hero: null,
      source: "manual",
      hasOverride: true,
    });
  });
});

describe("resolveLocalModHero", () => {
  it("matches resolveModHero for local mods", () => {
    const localMod = mod({
      name: "Toon Seven",
      hero: "Seven",
      detectedHero: "Calico",
    });

    expect(resolveLocalModHero(localMod)).toEqual(
      resolveModHero(localMod, localMod),
    );
  });
});

describe("matchesHeroFilter", () => {
  it("matches general or other mods when None is selected", () => {
    expect(matchesHeroFilter(null, ["None"])).toBe(true);
    expect(matchesHeroFilter("Seven", ["None", "Seven"])).toBe(true);
    expect(matchesHeroFilter("Victor", ["None"])).toBe(false);
  });

  it("matches specific heroes when None is not selected", () => {
    expect(matchesHeroFilter("Seven", ["Seven"])).toBe(true);
    expect(matchesHeroFilter(null, ["Seven"])).toBe(false);
    expect(matchesHeroFilter("Victor", ["Seven"])).toBe(false);
  });
});
