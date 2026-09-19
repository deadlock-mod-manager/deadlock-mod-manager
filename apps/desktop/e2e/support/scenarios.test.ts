import { describe, expect, it } from "bun:test";
import {
  parseScenarioId,
  scenarioPhases,
  scenarioSpec,
  selectScenarios,
  scenarios,
} from "./scenarios";

describe("scenario selection", () => {
  it("registers every case with explicit phases and capability requirements", () => {
    const ids = selectScenarios("all");
    expect(ids).toHaveLength(39);
    for (const id of ids) {
      expect(parseScenarioId(id)).toBe(id);
      expect(scenarioSpec(id)).toContain("./specs/");
      expect(new Set(scenarioPhases(id)).size).toBe(scenarioPhases(id).length);
    }
    expect(selectScenarios("gamebanana")).toHaveLength(10);
    expect(selectScenarios("filesystem")).toHaveLength(8);
    expect(selectScenarios("interchange")).toEqual(["grimoire-import"]);
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
    expect(scenarioPhases(parseScenarioId("local-mod-lifecycle"))).toEqual([
      "import-toggle",
      "restart-delete",
    ]);
    expect(scenarioSpec("local-mod-lifecycle")).toBe(
      "./specs/local-mod-lifecycle.e2e.ts",
    );
    expect(scenarioPhases("about-smoke")).toEqual(["smoke"]);
  });

  it("imports Grimoire in one process and verifies it in a fresh one", () => {
    expect(scenarioPhases("grimoire-import")).toEqual([
      "import",
      "restart-import",
    ]);
    expect(scenarioSpec("grimoire-import")).toBe(
      "./specs/grimoire-import.e2e.ts",
    );
  });
});
