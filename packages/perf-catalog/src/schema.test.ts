import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOW_IN_BODY, GAMEPLAY_PATTERNS } from "../curated/gameplay";
import { VIDEO_MENU } from "../curated/video";
import { loadCatalog } from "./index";

const CATALOG_PATH = join(import.meta.dirname, "..", "data", "catalog.json");
const SIZE_BUDGET = 2.5 * 1024 * 1024;

const catalog = loadCatalog();
const convars = new Map(
  catalog.convars.map((meta) => [meta.name.toLowerCase(), meta]),
);
const presets = catalog.presets ?? [];
const deniedPatterns = (catalog.rules.denied ?? []).flatMap((rule) =>
  rule.pattern ? [new RegExp(rule.pattern, "i")] : [],
);

const isDenied = (name: string) =>
  deniedPatterns.some((pattern) => pattern.test(name)) ||
  (catalog.rules.denied ?? []).some(
    (rule) =>
      rule.path?.length === 2 &&
      rule.path[1].toLowerCase() === name.toLowerCase(),
  );

const duplicates = (values: string[]) =>
  values.filter((value, index) => values.indexOf(value) !== index);

describe("bundled performance catalog", () => {
  it("stays under the size budget the app bundles", () => {
    expect(readFileSync(CATALOG_PATH).byteLength).toBeLessThan(SIZE_BUDGET);
  });

  it("has a sortable version", () => {
    expect(catalog.version).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d+$/);
    expect(Number.isNaN(Date.parse(catalog.generatedAt))).toBe(false);
  });

  it("uses unique ids", () => {
    expect(
      duplicates(catalog.categories.map((category) => category.id)),
    ).toEqual([]);
    expect(duplicates(presets.map((preset) => preset.id))).toEqual([]);
    expect(
      duplicates((catalog.community ?? []).map((config) => config.id)),
    ).toEqual([]);
    expect(
      duplicates(catalog.convars.map((meta) => meta.name.toLowerCase())),
    ).toEqual([]);
  });

  it("only uses null for commented-out entry values", () => {
    // Rust reads most fields as plain values with a default; null fails there.
    const nulls: string[] = [];
    JSON.parse(readFileSync(CATALOG_PATH, "utf8"), (key, value) => {
      if (value === null && key !== "value") nulls.push(key);
      return value;
    });
    expect(nulls).toEqual([]);
  });

  it("assigns every convar and section to a known category", () => {
    const ids = new Set(catalog.categories.map((category) => category.id));
    expect(
      catalog.convars
        .filter((meta) => !ids.has(meta.category))
        .map((meta) => meta.name),
    ).toEqual([]);
    expect(
      Object.values(catalog.sectionCategories ?? {}).filter(
        (id) => !ids.has(id),
      ),
    ).toEqual([]);
  });

  it("lists stock builds newest first", () => {
    const stock = catalog.stock ?? [];
    expect(stock.length).toBeGreaterThan(0);
    expect(catalog.latestBuild).toBe(stock[0].build);
    const builds = stock.map((version) => version.build);
    expect(builds).toEqual([...builds].sort((a, b) => b - a));
    expect(stock.every((version) => version.entries.length > 0)).toBe(true);
  });

  it("gives every preset entries and keeps excluded sections out of them", () => {
    expect(presets.length).toBeGreaterThan(0);
    for (const preset of presets) {
      expect(preset.entries.length).toBeGreaterThan(0);
      for (const entry of preset.entries) {
        expect(entry.path.length).toBeGreaterThan(1);
        const excluded = catalog.rules.excludedSections.find((section) =>
          section
            .split("/")
            .every(
              (part, index) =>
                entry.path[index]?.toLowerCase() === part.toLowerCase(),
            ),
        );
        expect(excluded).toBeUndefined();
      }
    }
  });

  it("classifies every gameplay-pattern convar a preset sets", () => {
    const unclassified: string[] = [];
    for (const preset of presets) {
      for (const entry of preset.entries) {
        if (entry.path[0].toLowerCase() !== "convars") continue;
        const name = entry.path[1].toLowerCase();
        if (!GAMEPLAY_PATTERNS.some((pattern) => pattern.test(name))) continue;
        if (
          convars.get(name)?.gameplay ||
          ALLOW_IN_BODY.has(name) ||
          isDenied(name)
        )
          continue;
        unclassified.push(`${preset.id}: ${name}`);
      }
    }
    expect(unclassified).toEqual([]);
  });

  it("builds DMM Clean from active, non-gameplay convars only", () => {
    const clean = presets.find((preset) => preset.id === "dmm-clean");
    expect(clean?.source.kind).toBe("bundled");
    for (const entry of clean?.entries ?? []) {
      const meta = convars.get(entry.path[1].toLowerCase());
      expect(entry.path[0]).toBe("ConVars");
      expect(meta?.status ?? "active").toBe("active");
      expect(meta?.gameplay ?? null).toBeNull();
      expect(meta?.category).not.toBe("camera");
      expect(VIDEO_MENU.has(entry.path[1].toLowerCase())).toBe(false);
    }
  });

  it("only takes in-game menu keys from video.txt", () => {
    for (const preset of presets) {
      for (const setting of preset.videoSettings ?? []) {
        expect(setting.label).toBe(VIDEO_MENU.get(setting.key)?.label);
      }
    }
  });

  it("pins GitHub presets to a commit", () => {
    for (const preset of presets) {
      if (preset.source.kind !== "github") continue;
      expect(preset.source.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(preset.source.url).toContain(preset.source.commit);
    }
  });

  it("compiles every deny pattern", () => {
    for (const rule of catalog.rules.denied ?? []) {
      expect(Boolean(rule.path) !== Boolean(rule.pattern)).toBe(true);
      if (rule.pattern)
        expect(() => new RegExp(rule.pattern ?? "")).not.toThrow();
    }
  });
});
