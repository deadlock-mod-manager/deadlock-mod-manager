import { describe, expect, it } from "bun:test";
import { ModCategory } from "@/lib/constants";
import { ModStatus } from "@/types/mods";
import { groupSkinsByHero, type SkinSelectableMod } from "./skin-selection";

let nextId = 0;
const makeMod = (
  overrides: Partial<SkinSelectableMod> = {},
): SkinSelectableMod => ({
  remoteId: `mod-${++nextId}`,
  name: "Some Cosmetic",
  hero: null,
  category: ModCategory.SKINS,
  status: ModStatus.Downloaded,
  detectedHero: null,
  heroOverride: undefined,
  ...overrides,
});

describe("groupSkinsByHero", () => {
  it("groups selectable skins under their resolved hero", () => {
    const haze = makeMod({ detectedHero: "Haze" });
    const wraith = makeMod({ hero: "Wraith" });
    const groups = groupSkinsByHero([haze, wraith]);
    expect(groups.get("Haze")?.skins).toEqual([haze]);
    expect(groups.get("Wraith")?.skins).toEqual([wraith]);
  });

  it("prefers the manual hero override over detection", () => {
    const mod = makeMod({ detectedHero: "Haze", heroOverride: "Lash" });
    const groups = groupSkinsByHero([mod]);
    expect(groups.get("Lash")?.skins).toEqual([mod]);
    expect(groups.has("Haze")).toBe(false);
  });

  it("includes model replacements and excludes audio categories", () => {
    const model = makeMod({
      category: ModCategory.MODEL_REPLACEMENT,
      detectedHero: "Haze",
    });
    const voiceLines = makeMod({
      category: ModCategory.VOICE_LINES,
      detectedHero: "Haze",
    });
    const groups = groupSkinsByHero([model, voiceLines]);
    expect(groups.get("Haze")?.skins).toEqual([model]);
  });

  it("excludes mods in transitional statuses", () => {
    const installing = makeMod({
      detectedHero: "Haze",
      status: ModStatus.Installing,
    });
    expect(groupSkinsByHero([installing]).size).toBe(0);
  });

  it("keeps failed installs selectable so they can be retried", () => {
    const failed = makeMod({
      detectedHero: "Haze",
      status: ModStatus.FailedToInstall,
    });
    const group = groupSkinsByHero([failed]).get("Haze");
    expect(group?.skins).toEqual([failed]);
    expect(group?.active).toEqual([]);
  });

  it("excludes mods with no resolvable hero", () => {
    expect(groupSkinsByHero([makeMod()]).size).toBe(0);
  });

  it("collects every installed skin as active", () => {
    const a = makeMod({ detectedHero: "Haze", status: ModStatus.Installed });
    const b = makeMod({ detectedHero: "Haze", status: ModStatus.Installed });
    const c = makeMod({ detectedHero: "Haze" });
    const group = groupSkinsByHero([a, b, c]).get("Haze");
    expect(group?.skins).toEqual([a, b, c]);
    expect(group?.active).toEqual([a, b]);
  });
});
