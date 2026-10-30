import { describe, expect, it } from "bun:test";
import {
  parseScenarioId,
  scenarioPhases,
  scenarioSpec,
  selectScenarios,
  scenarios,
} from "./scenarios";

// Legacy native-input cases and filesystem-lock are Windows-only.
const windows = process.platform === "win32";

describe("scenario selection", () => {
  it("registers every case with explicit phases and capability requirements", () => {
    const ids = selectScenarios("all");
    expect(ids).toHaveLength(windows ? 95 : 84);
    for (const id of ids) {
      expect(parseScenarioId(id)).toBe(id);
      expect(scenarioSpec(id)).toContain("./specs/");
      expect(new Set(scenarioPhases(id)).size).toBe(scenarioPhases(id).length);
    }
    expect(selectScenarios("onboarding")).toEqual([
      "onboarding-skip-analysis",
      "onboarding-telemetry-default",
    ]);
    expect(selectScenarios("gamebanana")).toHaveLength(19);
    expect(selectScenarios("library-groups")).toEqual([
      "library-groups-organize",
      "library-groups-identification",
      "library-groups-pagination",
      "library-groups-removal",
      "library-groups-drag",
      "library-groups-toggle",
    ]);
    expect(scenarios["library-groups-drag"].nativeInput).toBe(true);
    expect(scenarios["library-groups-drag"].platforms).toContain("linux");
    expect(selectScenarios("monkey")).toEqual(["monkey"]);
    expect(selectScenarios("updater")).toEqual([
      "app-update-download",
      "app-update-check-failure",
    ]);
    expect(scenarios.monkey.nativeInput).toBe(false);
    expect(selectScenarios("filesystem")).toHaveLength(windows ? 12 : 10);
    expect(selectScenarios("interchange")).toEqual(["grimoire-import"]);
    expect(selectScenarios("skins")).toEqual(["hero-skins-active"]);
    expect(selectScenarios("stats")).toEqual([
      "stats-default-layout",
      "stats-arrange-widgets",
      "stats-custom-tabs",
      "stats-custom-queries",
      "stats-broken-endpoints",
    ]);
    expect(selectScenarios("shards")).toEqual([
      "shards-library",
      "shards-conflicts",
    ]);
    expect(selectScenarios("missing-vpks")).toEqual([
      "missing-vpks-launch",
      "missing-vpks-offline",
      "missing-vpks-live",
    ]);
    expect(scenarios["profiles-pointer"].nativeInput).toBe(true);
    expect(scenarios["filesystem-manifest-repair"].nativeInput).toBe(false);
    expect(scenarioPhases("filesystem-mod-folder-repair")).toEqual([
      "repair-folder",
      "restart-folder",
      "restart-restored-folder",
    ]);
    expect(scenarios["filesystem-mod-folder-repair"].nativeInput).toBe(false);
    expect(scenarios["conflicts-resolve"].nativeInput).toBe(false);
    expect(scenarios["conflicts-switch"].nativeInput).toBe(false);
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
    expect(scenarioPhases("local-mod-name-recovery")).toEqual([
      "import",
      "restart-delete",
    ]);
    expect(scenarios["local-mod-name-recovery"].nativeInput).toBe(false);
    expect(scenarios["local-mod-name-recovery"].platforms).toContain("linux");
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
