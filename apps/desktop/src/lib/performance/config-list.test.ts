import { describe, expect, test } from "bun:test";
import type { UserPerfConfig } from "@/lib/store/slices/performance";
import type { CatalogSummary } from "@/types/generated/CatalogSummary";
import type { CommunityConfigSummary } from "@/types/generated/CommunityConfigSummary";
import type { PresetSummary } from "@/types/generated/PresetSummary";
import type { ResolvedCounts } from "@/types/generated/ResolvedCounts";
import {
  applySourceFor,
  buildConfigList,
  type ConfigListItem,
  filterConfigs,
  parseConfigId,
  sortConfigs,
  sourceCounts,
  unusedCount,
} from "./config-list";

const counts = (overrides: Partial<ResolvedCounts> = {}): ResolvedCounts => ({
  applies: 0,
  unchanged: 0,
  blocked: 0,
  removed: 0,
  notConvar: 0,
  engineSection: 0,
  excluded: 0,
  denied: 0,
  omitted: 0,
  unsupported: 0,
  overridden: 0,
  ...overrides,
});

const preset = (overrides: Partial<PresetSummary>): PresetSummary => ({
  id: "preset",
  name: "Preset",
  author: "author",
  tier: "balanced",
  blurb: "",
  highlights: [],
  recommended: false,
  version: null,
  updatedAt: null,
  baseBuild: null,
  source: { kind: "bundled" },
  videoSettings: [],
  notes: [],
  counts: counts(),
  cutScore: 0.3,
  ...overrides,
});

const community = (
  overrides: Partial<CommunityConfigSummary>,
): CommunityConfigSummary => ({
  id: "gb",
  gamebananaId: 1,
  name: "GameBanana config",
  author: "author",
  downloads: 0,
  updatedAt: null,
  tier: "lean",
  blurb: "",
  baseBuild: null,
  fileId: 10,
  variantHint: null,
  settingsCount: 0,
  engineEditCount: 0,
  cutScore: 0.5,
  ...overrides,
});

const userConfig = (overrides: Partial<UserPerfConfig>): UserPerfConfig => ({
  id: "user:1",
  name: "Mine",
  createdAt: "2026-10-01T00:00:00.000Z",
  origin: { kind: "paste", format: "cfg" },
  entries: [],
  videoSettings: [],
  baseBuild: null,
  ...overrides,
});

const catalog = (overrides: Partial<CatalogSummary>): CatalogSummary => ({
  version: "1",
  generatedAt: "2026-10-01T00:00:00.000Z",
  origin: "bundled",
  latestBuild: 6800,
  convarBuild: 6800,
  categories: [],
  guardedSections: [],
  presets: [],
  community: [],
  ...overrides,
});

const names = (items: ConfigListItem[]) => items.map((item) => item.name);

describe("buildConfigList", () => {
  test("links a GameBanana config to the user's newest import of it", () => {
    const older = userConfig({
      id: "user:old",
      createdAt: "2026-09-01T00:00:00.000Z",
      origin: {
        kind: "gamebanana",
        gamebananaId: 7,
        fileId: 1,
        variant: null,
      },
    });
    const newer = userConfig({
      id: "user:new",
      createdAt: "2026-10-01T00:00:00.000Z",
      origin: {
        kind: "gamebanana",
        gamebananaId: 7,
        fileId: 2,
        variant: null,
      },
    });
    const items = buildConfigList(
      catalog({ community: [community({ id: "dyson", gamebananaId: 7 })] }),
      { [older.id]: older, [newer.id]: newer },
      null,
    );
    const card = items.find((item) => item.kind === "community");
    expect(card?.kind === "community" && card.imported?.id).toBe("user:new");
  });

  test("user configs inherit the tier of the preset they were forked from", () => {
    const fork = userConfig({
      origin: { kind: "fork", fromConfigId: "preset:optilock" },
    });
    const items = buildConfigList(
      catalog({
        presets: [preset({ id: "optilock", tier: "sweaty", cutScore: 0.72 })],
      }),
      { [fork.id]: fork },
      null,
    );
    const mine = items.find((item) => item.kind === "user");
    expect(mine?.tier).toBe("sweaty");
    expect(mine?.cutScore).toBe(0.72);
  });

  test("a pasted config only gets a tier when it is the active one", () => {
    const pasted = userConfig({});
    const inactive = buildConfigList(undefined, { [pasted.id]: pasted }, null);
    expect(inactive[0]?.tier).toBeNull();

    const active = buildConfigList(
      undefined,
      { [pasted.id]: pasted },
      { configId: pasted.id, cutScore: 0.88 },
    );
    expect(active[0]?.tier).toBe("potato");
  });
});

describe("filterConfigs", () => {
  const imported = userConfig({
    id: "user:dyson",
    name: "dyson copy",
    origin: { kind: "gamebanana", gamebananaId: 7, fileId: 1, variant: null },
  });
  const pasted = userConfig({ id: "user:paste", name: "pasted" });
  const items = buildConfigList(
    catalog({
      presets: [preset({ id: "clean", name: "Clean", tier: "pretty" })],
      community: [community({ name: "dyson", gamebananaId: 7 })],
    }),
    { [imported.id]: imported, [pasted.id]: pasted },
    null,
  );

  test("All hides the user's copy of a GameBanana config listed in the catalog", () => {
    expect(names(filterConfigs(items, { source: "all", tier: null }))).toEqual([
      "Clean",
      "dyson",
      "pasted",
    ]);
    expect(
      names(filterConfigs(items, { source: "yours", tier: null })),
    ).toEqual(["dyson copy", "pasted"]);
  });

  test("a tier filter drops configs without a known tier", () => {
    expect(
      names(filterConfigs(items, { source: "yours", tier: "lean" })),
    ).toEqual(["dyson copy"]);
  });

  test("counts each source under the current tier filter", () => {
    expect(sourceCounts(items, null)).toEqual({
      all: 3,
      curated: 1,
      gamebanana: 1,
      yours: 2,
    });
    expect(sourceCounts(items, "pretty")).toEqual({
      all: 1,
      curated: 1,
      gamebanana: 0,
      yours: 0,
    });
  });
});

describe("sortConfigs", () => {
  const items = buildConfigList(
    catalog({
      presets: [
        preset({ id: "a", name: "Zeta", cutScore: 0.9 }),
        preset({ id: "b", name: "alpha", recommended: true, cutScore: 0.1 }),
      ],
      community: [
        community({ id: "few", name: "Few", downloads: 10, cutScore: 0.5 }),
        community({ id: "many", name: "Many", downloads: 900, cutScore: 0.4 }),
      ],
    }),
    {
      "user:1": userConfig({ id: "user:1", name: "Mine" }),
    },
    null,
  );

  test("Most downloaded keeps presets first, recommended on top", () => {
    expect(names(sortConfigs(items, "downloads"))).toEqual([
      "alpha",
      "Zeta",
      "Many",
      "Few",
      "Mine",
    ]);
  });

  test("Name ignores case", () => {
    expect(names(sortConfigs(items, "name"))).toEqual([
      "alpha",
      "Few",
      "Many",
      "Mine",
      "Zeta",
    ]);
  });

  test("Looks to Frames puts configs without a score last", () => {
    expect(names(sortConfigs(items, "looksToFrames"))).toEqual([
      "alpha",
      "Many",
      "Few",
      "Zeta",
      "Mine",
    ]);
  });
});

describe("config ids", () => {
  test("parses each namespace", () => {
    expect(parseConfigId("preset:clean")).toEqual({
      kind: "preset",
      id: "clean",
    });
    expect(parseConfigId("community:dyson")).toEqual({
      kind: "community",
      id: "dyson",
    });
    expect(parseConfigId("user:abc")).toEqual({ kind: "user", id: "user:abc" });
    expect(parseConfigId("other")).toBeNull();
  });

  test("analytics source follows the config's origin", () => {
    const configs = {
      "user:gb": userConfig({
        id: "user:gb",
        origin: {
          kind: "gamebanana",
          gamebananaId: 1,
          fileId: 1,
          variant: null,
        },
      }),
      "user:fork": userConfig({
        id: "user:fork",
        origin: { kind: "fork", fromConfigId: "preset:clean" },
      }),
      "user:paste": userConfig({ id: "user:paste" }),
    };
    expect(applySourceFor("preset:clean", configs)).toBe("preset");
    expect(applySourceFor("user:gb", configs)).toBe("community");
    expect(applySourceFor("user:fork", configs)).toBe("custom");
    expect(applySourceFor("user:paste", configs)).toBe("imported");
    expect(applySourceFor("user:deleted", configs)).toBe("custom");
  });
});

test("unused counts settings the game no longer reads", () => {
  expect(
    unusedCount(counts({ blocked: 3, removed: 20, notConvar: 2, denied: 4 })),
  ).toBe(25);
});
