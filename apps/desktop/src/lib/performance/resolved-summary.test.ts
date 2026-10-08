import { describe, expect, test } from "bun:test";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import {
  authorViewEntries,
  compareCategories,
  devtoolEntries,
  engineSectionEdits,
} from "./resolved-summary";

const entry = (overrides: Partial<ResolvedEntry>): ResolvedEntry => ({
  path: ["ConVars", "r_ssao"],
  value: "0",
  configValue: "0",
  liveValue: "1",
  status: "applies",
  notes: [],
  overridden: false,
  inConfig: true,
  category: "shadows",
  gameplay: null,
  meta: null,
  ...overrides,
});

describe("compareCategories", () => {
  const categories = [
    { id: "shadows", label: "Shadows", weight: 1 },
    { id: "audio", label: "Audio", weight: 1 },
    { id: "world", label: "World", weight: 1 },
  ];

  test("counts only written settings and orders by the viewed config", () => {
    const config = [
      entry({ category: "world" }),
      entry({ category: "world" }),
      entry({ category: "shadows" }),
      entry({ category: "shadows", status: "blocked" }),
    ];
    const current = [
      entry({ category: "audio" }),
      entry({ category: "shadows" }),
    ];
    expect(compareCategories(categories, config, current)).toEqual([
      { id: "world", label: "World", config: 2, current: 0 },
      { id: "shadows", label: "Shadows", config: 1, current: 1 },
      { id: "audio", label: "Audio", config: 0, current: 1 },
    ]);
  });

  test("leaves current empty without a config to compare with", () => {
    expect(
      compareCategories(categories, [entry({ category: "custom" })], null),
    ).toEqual([{ id: "custom", label: "custom", config: 1, current: null }]);
  });
});

describe("engineSectionEdits", () => {
  test("counts edits outside ConVars whether or not they are included", () => {
    const summary = engineSectionEdits([
      entry({ path: ["SceneSystem", "a"], status: "engineSection" }),
      entry({ path: ["scenesystem", "b"], status: "applies" }),
      entry({ path: ["RenderSystem", "c"], status: "engineSection" }),
      entry({ path: ["SearchPaths", "Game"], status: "excluded" }),
      entry({ path: ["ConVars", "r_ssao"] }),
    ]);
    expect(summary.count).toBe(3);
    expect(summary.sections).toEqual(["SceneSystem", "RenderSystem"]);
    expect(summary.edits.map((edit) => edit.path.at(-1))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("gameplay entries", () => {
  const entries = [
    entry({ path: ["ConVars", "fov"], gameplay: "camera" }),
    entry({
      path: ["ConVars", "glow"],
      gameplay: "visibility",
      status: "omitted",
    }),
    entry({
      path: ["ConVars", "fog"],
      gameplay: "visibility",
      status: "blocked",
    }),
    entry({
      path: ["ConVars", "cam_idealdist"],
      gameplay: "camera",
      status: "unchanged",
    }),
    entry({
      path: ["ConVars", "noclip"],
      gameplay: "devtools",
      status: "omitted",
    }),
  ];

  test("lists the author's camera changes, including ones turned off", () => {
    expect(authorViewEntries(entries).map((item) => item.path[1])).toEqual([
      "fov",
      "glow",
    ]);
  });

  test("lists developer tools that are off by default", () => {
    expect(devtoolEntries(entries).map((item) => item.path[1])).toEqual([
      "noclip",
    ]);
  });
});
