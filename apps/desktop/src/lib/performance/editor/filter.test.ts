import { describe, expect, test } from "bun:test";
import type { CategoryInfo } from "@/types/generated/CategoryInfo";
import type { ConvarMeta } from "@/types/generated/ConvarMeta";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import {
  type EntryQuery,
  filterCounts,
  groupEntries,
  isEngineSectionEntry,
  isInert,
  matchesSearch,
  needsAttention,
} from "./filter";

const CATEGORIES: CategoryInfo[] = [
  { id: "shadows", label: "Shadows & lighting", weight: 3 },
  { id: "world", label: "World & LOD", weight: 2.5 },
  { id: "camera", label: "Camera & visibility", weight: 0 },
];

const meta = (overrides: Partial<ConvarMeta> = {}): ConvarMeta => ({
  name: "r_test",
  kind: "bool",
  default: "1",
  min: null,
  max: null,
  step: null,
  enumValues: [],
  flags: [],
  help: null,
  label: null,
  description: null,
  category: "shadows",
  gameplay: null,
  sideEffects: null,
  status: "active",
  statusSinceBuild: null,
  ...overrides,
});

const entry = (
  key: string,
  overrides: Partial<ResolvedEntry> = {},
): ResolvedEntry => ({
  path: ["ConVars", key],
  value: "0",
  configValue: "0",
  liveValue: "1",
  status: "applies",
  notes: [],
  overridden: false,
  inConfig: true,
  category: "shadows",
  gameplay: null,
  meta: meta({ name: key }),
  ...overrides,
});

const query = (overrides: Partial<EntryQuery> = {}): EntryQuery => ({
  search: "",
  filter: "all",
  changedKeys: new Set(),
  ...overrides,
});

describe("needsAttention", () => {
  test("flags entries the game won't take as written", () => {
    expect(needsAttention(entry("a", { status: "blocked" }))).toBe(true);
    expect(needsAttention(entry("a", { status: "removed" }))).toBe(true);
    expect(needsAttention(entry("a", { status: "denied" }))).toBe(true);
    expect(
      needsAttention(
        entry("a", { notes: [{ kind: "clamped", effective: "128" }] }),
      ),
    ).toBe(true);
    expect(
      needsAttention(
        entry("a", { notes: [{ kind: "typeMismatch", expected: "int" }] }),
      ),
    ).toBe(true);
  });

  test("leaves choices and normal entries alone", () => {
    expect(needsAttention(entry("a"))).toBe(false);
    expect(needsAttention(entry("a", { status: "unchanged" }))).toBe(false);
    expect(needsAttention(entry("a", { status: "omitted" }))).toBe(false);
    expect(needsAttention(entry("a", { status: "engineSection" }))).toBe(false);
    expect(needsAttention(entry("a", { status: "excluded" }))).toBe(false);
  });
});

describe("isInert", () => {
  test("covers entries that are never written", () => {
    expect(isInert({ status: "blocked" })).toBe(true);
    expect(isInert({ status: "excluded" })).toBe(true);
    expect(isInert({ status: "omitted" })).toBe(false);
    expect(isInert({ status: "engineSection" })).toBe(false);
  });
});

describe("isEngineSectionEntry", () => {
  test("is any edit outside ConVars the toggle can include", () => {
    expect(
      isEngineSectionEntry({
        path: ["SceneSystem", "CSMCascadeResolution"],
        status: "engineSection",
      }),
    ).toBe(true);
    expect(
      isEngineSectionEntry({ path: ["RenderSystem", "X"], status: "applies" }),
    ).toBe(true);
    expect(
      isEngineSectionEntry({ path: ["FileSystem", "X"], status: "excluded" }),
    ).toBe(false);
    expect(
      isEngineSectionEntry({ path: ["ConVars", "r_ssao"], status: "applies" }),
    ).toBe(false);
  });
});

describe("matchesSearch", () => {
  const sun = entry("r_rendersun", {
    meta: meta({
      name: "r_rendersun",
      label: "Sun lighting",
      description: "Renders direct sunlight.",
    }),
  });

  test("searches label, key and help, every term must match", () => {
    expect(matchesSearch(sun, "sun")).toBe(true);
    expect(matchesSearch(sun, "RENDERSUN")).toBe(true);
    expect(matchesSearch(sun, "direct sunlight")).toBe(true);
    expect(matchesSearch(sun, "sun shadow")).toBe(false);
    expect(matchesSearch(sun, "   ")).toBe(true);
  });

  test("works for engine-section entries without metadata", () => {
    const engine = entry("x", {
      path: ["SceneSystem", "CSMCascadeResolution"],
      meta: null,
    });
    expect(matchesSearch(engine, "cascade")).toBe(true);
  });
});

describe("groupEntries", () => {
  const entries = [
    entry("r_shadows", { status: "blocked" }),
    entry("r_ssao"),
    entry("r_rendersun"),
    entry("lb_enable_stationary_lights", {
      notes: [{ kind: "clamped", effective: "1" }],
    }),
    entry("citadel_camera_hero_fov", { category: "camera" }),
    entry("odd", { category: "mystery" }),
  ];

  test("follows catalog order, keeps empty categories, appends unknown ones", () => {
    const groups = groupEntries(entries, CATEGORIES, query());
    expect(groups.map((group) => group.id)).toEqual([
      "shadows",
      "world",
      "camera",
      "mystery",
    ]);
    expect(groups[1].entries).toEqual([]);
    expect(groups[3].label).toBe("mystery");
  });

  test("puts inert entries last within a category", () => {
    const [shadows] = groupEntries(entries, CATEGORIES, query());
    expect(shadows.entries.map((e) => e.path[1])).toEqual([
      "r_ssao",
      "r_rendersun",
      "lb_enable_stationary_lights",
      "r_shadows",
    ]);
  });

  test("filters by changed paths and attention, counting the whole category", () => {
    const changedKeys = new Set(["convars/r_ssao"]);
    const changed = groupEntries(
      entries,
      CATEGORIES,
      query({ filter: "changed", changedKeys }),
    );
    expect(changed[0].entries.map((e) => e.path[1])).toEqual(["r_ssao"]);
    expect(changed[0].total).toBe(4);
    expect(changed[0].changed).toBe(1);
    expect(changed[0].attention).toBe(2);

    const attention = groupEntries(
      entries,
      CATEGORIES,
      query({ filter: "attention" }),
    );
    expect(attention[0].entries.map((e) => e.path[1])).toEqual([
      "lb_enable_stationary_lights",
      "r_shadows",
    ]);
    expect(filterCounts(attention)).toEqual({
      all: 6,
      changed: 0,
      attention: 2,
    });
  });

  test("combines search with the filter", () => {
    const groups = groupEntries(entries, CATEGORIES, query({ search: "fov" }));
    expect(
      groups.flatMap((group) => group.entries).map((e) => e.path[1]),
    ).toEqual(["citadel_camera_hero_fov"]);
  });
});
