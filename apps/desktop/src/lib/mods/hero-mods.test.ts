import { describe, expect, it } from "bun:test";
import { ModCategory } from "@/lib/constants";
import { ModStatus } from "@/types/mods";
import {
  groupModsByHero,
  type HeroModOptions,
  type HeroSelectableMod,
  heroAssignCandidates,
} from "./hero-mods";

let nextId = 0;
const makeMod = (
  overrides: Partial<HeroSelectableMod> = {},
): HeroSelectableMod => ({
  remoteId: `mod-${++nextId}`,
  name: "Some Cosmetic",
  hero: null,
  category: ModCategory.SKINS,
  status: ModStatus.Downloaded,
  detectedHero: null,
  heroOverride: undefined,
  ...overrides,
});

const options = (overrides: Partial<HeroModOptions> = {}): HeroModOptions => ({
  includeExtras: false,
  hidden: new Set(),
  ...overrides,
});

describe("groupModsByHero", () => {
  it("groups selectable skins under their resolved hero", () => {
    const haze = makeMod({ detectedHero: "Haze" });
    const wraith = makeMod({ hero: "Wraith" });
    const groups = groupModsByHero([haze, wraith], options());
    expect(groups.get("Haze")?.skins).toEqual([haze]);
    expect(groups.get("Wraith")?.skins).toEqual([wraith]);
  });

  it("prefers the manual hero override over detection", () => {
    const mod = makeMod({ detectedHero: "Haze", heroOverride: "Lash" });
    const groups = groupModsByHero([mod], options());
    expect(groups.get("Lash")?.skins).toEqual([mod]);
    expect(groups.has("Haze")).toBe(false);
  });

  it("counts model replacements as skins", () => {
    const model = makeMod({
      category: ModCategory.MODEL_REPLACEMENT,
      detectedHero: "Haze",
    });
    expect(groupModsByHero([model], options()).get("Haze")?.skins).toEqual([
      model,
    ]);
  });

  it("leaves detected extras out until they are asked for", () => {
    const voiceLines = makeMod({
      category: ModCategory.VOICE_LINES,
      detectedHero: "Haze",
    });
    expect(groupModsByHero([voiceLines], options()).size).toBe(0);

    const group = groupModsByHero(
      [voiceLines],
      options({ includeExtras: true }),
    ).get("Haze");
    expect(group?.extras).toEqual([voiceLines]);
    expect(group?.skins).toEqual([]);
  });

  it("keeps hand-assigned extras listed with the setting off", () => {
    const sound = makeMod({
      category: ModCategory.WEAPON_SOUNDS,
      heroOverride: "Haze",
    });
    expect(groupModsByHero([sound], options()).get("Haze")?.extras).toEqual([
      sound,
    ]);
  });

  it("drops mods the user took off the list", () => {
    const mod = makeMod({ detectedHero: "Haze" });
    const groups = groupModsByHero(
      [mod],
      options({ hidden: new Set([mod.remoteId]) }),
    );
    expect(groups.size).toBe(0);
  });

  it("excludes mods in transitional statuses", () => {
    const installing = makeMod({
      detectedHero: "Haze",
      status: ModStatus.Installing,
    });
    expect(groupModsByHero([installing], options()).size).toBe(0);
  });

  it("keeps failed installs selectable so they can be retried", () => {
    const failed = makeMod({
      detectedHero: "Haze",
      status: ModStatus.FailedToInstall,
    });
    const group = groupModsByHero([failed], options()).get("Haze");
    expect(group?.skins).toEqual([failed]);
    expect(group?.activeSkins).toEqual([]);
  });

  it("excludes mods with no resolvable hero", () => {
    expect(groupModsByHero([makeMod()], options()).size).toBe(0);
  });

  it("collects installed skins and extras as active separately", () => {
    const skin = makeMod({ detectedHero: "Haze", status: ModStatus.Installed });
    const downloaded = makeMod({ detectedHero: "Haze" });
    const sound = makeMod({
      category: ModCategory.KILL_SOUNDS,
      detectedHero: "Haze",
      status: ModStatus.Installed,
    });
    const group = groupModsByHero(
      [skin, downloaded, sound],
      options({ includeExtras: true }),
    ).get("Haze");
    expect(group?.activeSkins).toEqual([skin]);
    expect(group?.activeExtras).toEqual([sound]);
  });
});

describe("heroAssignCandidates", () => {
  it("offers unrecognised mods first, then removed ones, then the rest", () => {
    const unknown = makeMod({ name: "Zed Mystery" });
    const elsewhere = makeMod({
      name: "Abrams Armour",
      detectedHero: "Abrams",
    });
    const removed = makeMod({ name: "Mid Removed", detectedHero: "Haze" });

    const candidates = heroAssignCandidates(
      [elsewhere, removed, unknown],
      "Haze",
      new Set([removed.remoteId]),
    );

    expect(candidates.map((candidate) => candidate.mod)).toEqual([
      unknown,
      removed,
      elsewhere,
    ]);
    expect(candidates[0]?.currentHero).toBeNull();
    expect(candidates[1]?.hidden).toBe(true);
  });

  it("skips mods already listed under the hero", () => {
    const listed = makeMod({ detectedHero: "Haze" });
    expect(heroAssignCandidates([listed], "Haze", new Set())).toEqual([]);
  });

  it("offers extras regardless of the grouping setting", () => {
    const sound = makeMod({ category: ModCategory.ABILITY_SOUNDS });
    const candidates = heroAssignCandidates([sound], "Haze", new Set());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.kind).toBe("extra");
  });

  it("skips categories that never belong to a hero", () => {
    const hud = makeMod({ category: ModCategory.HUD });
    expect(heroAssignCandidates([hud], "Haze", new Set())).toEqual([]);
  });
});
