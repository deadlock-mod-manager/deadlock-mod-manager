import { describe, expect, it } from "bun:test";
import {
  parseScenarioId,
  scenarioPhases,
  scenarioSpec,
  selectScenarios,
  scenarios,
} from "./scenarios";

// Native-input cases and filesystem-lock are registered on Windows only.
const windows = process.platform === "win32";

describe("scenario selection", () => {
  it("registers every case with explicit phases and capability requirements", () => {
    const ids = selectScenarios("all");
    expect(ids).toHaveLength(windows ? 45 : 41);
    for (const id of ids) {
      expect(parseScenarioId(id)).toBe(id);
      expect(scenarioSpec(id)).toContain("./specs/");
      expect(new Set(scenarioPhases(id)).size).toBe(scenarioPhases(id).length);
    }
    expect(selectScenarios("gamebanana")).toHaveLength(12);
    expect(selectScenarios("filesystem")).toHaveLength(windows ? 8 : 7);
    expect(selectScenarios("interchange")).toEqual(["grimoire-import"]);
    expect(selectScenarios("skins")).toEqual(["hero-skins-active"]);
    expect(selectScenarios("missing-vpks")).toEqual([
      "missing-vpks-offline",
      "missing-vpks-live",
    ]);
    expect(scenarios["profiles-pointer"].nativeInput).toBe(true);
    expect(scenarios["filesystem-manifest-repair"].nativeInput).toBe(false);
    expect(scenarios["conflicts-resolve"].nativeInput).toBe(false);
    expect(scenarios["filesystem-crash-placed"].exit("mutate")).toBe("crash");
    expect(scenarios["filesystem-manifest-repair"].exit("repair")).toBe(
      "normal",
    );
    expect(scenarios["downloads-restart"].exit("transfer")).toBe("interrupt");
    expect(() => selectScenarios("not-a-suite")).toThrow();
  });
  it("keeps the smoke as default and rejects arbitrary spec paths", () => {
    expect(parseScenarioId()).toBe("about-smoke");
    expect(() => parseScenarioId("../../outside.ts")).toThrow(
      "Unsupported E2E case",
    );
  });

  it("runs the lifecycle in two fresh processes against one world", () => {
    expect(scenarioPhases("local-mod-lifecycle")).toEqual([
      "import-toggle",
      "restart-delete",
    ]);
    expect(scenarioSpec("local-mod-lifecycle")).toBe(
      "./specs/local-mod-lifecycle.e2e.ts",
    );
    expect(scenarioPhases("about-smoke")).toEqual(["smoke"]);
  });

  it("only registers Windows-only cases on Windows", () => {
    const windowsOnly = [
      "local-mod-lifecycle",
      "profiles-pointer",
      "profiles-keyboard",
      "filesystem-lock",
    ] as const;
    for (const id of windowsOnly) {
      expect(scenarios[id].platforms).toEqual(["win32"]);
      expect(selectScenarios("all").includes(id)).toBe(windows);
      if (windows) expect(parseScenarioId(id)).toBe(id);
      else expect(() => parseScenarioId(id)).toThrow("supports win32");
    }
  });

  it("imports Grimoire, restarts, and re-imports changed source state", () => {
    expect(scenarioPhases("grimoire-import")).toEqual([
      "import",
      "restart-import",
      "reimport",
    ]);
    expect(scenarioSpec("grimoire-import")).toBe(
      "./specs/grimoire-import.e2e.ts",
    );
  });
});
