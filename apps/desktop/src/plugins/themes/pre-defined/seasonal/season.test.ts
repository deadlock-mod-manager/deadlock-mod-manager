import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { hideoutsOnPath, matchesHideoutRoute } from "./season";

const PAGES = [
  "/",
  "/my-mods",
  "/mods",
  "/downloads",
  "/servers",
  "/settings",
  "/crosshairs",
  "/skins",
];

const seasonRoutes = (file: string) => {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const hideouts = source.slice(source.indexOf("hideouts:"));
  return [...hideouts.matchAll(/route:\s*"([^"]+)"/g)].map((match) => match[1]);
};

const SEASON_FILES = [
  "./seasons/halloween.tsx",
  "./seasons/christmas.tsx",
  "./seasons/new-year.tsx",
  "./seasons/lunar-new-year.tsx",
  "./seasons/easter.tsx",
];

describe("hideout routes", () => {
  it("keeps the dashboard exact and includes sub-pages everywhere else", () => {
    expect(matchesHideoutRoute("/", "/")).toBe(true);
    expect(matchesHideoutRoute("/", "/downloads")).toBe(false);
    expect(matchesHideoutRoute("/settings", "/settings")).toBe(true);
    expect(matchesHideoutRoute("/settings", "/settings/autoexec")).toBe(true);
    expect(matchesHideoutRoute("/settings", "/settings/experimental")).toBe(
      true,
    );
    expect(matchesHideoutRoute("/mods", "/mods/123")).toBe(true);
    expect(matchesHideoutRoute("/mods", "/my-mods")).toBe(false);
    expect(matchesHideoutRoute("/settings", "/settings-extra")).toBe(false);
  });

  it("prefers the longer route when a sub-page has its own hideout", () => {
    const hideouts = [
      { id: "parent", route: "/settings" },
      { id: "child", route: "/settings/autoexec" },
    ];
    expect(
      hideoutsOnPath(hideouts, "/settings").map((item) => item.id),
    ).toEqual(["parent"]);
    expect(
      hideoutsOnPath(hideouts, "/settings/autoexec").map((item) => item.id),
    ).toEqual(["child"]);
    expect(
      hideoutsOnPath(hideouts, "/settings/experimental").map((item) => item.id),
    ).toEqual(["parent"]);
  });

  it("gives each season a different set of real pages", () => {
    const sets = SEASON_FILES.map((file) => seasonRoutes(file).sort());
    for (const routes of sets) {
      expect(routes).toHaveLength(5);
      expect(new Set(routes).size).toBe(routes.length);
      for (const route of routes) {
        expect(PAGES).toContain(route);
      }
    }
    expect(new Set(sets.map((routes) => routes.join("|"))).size).toBe(
      sets.length,
    );
  });
});
