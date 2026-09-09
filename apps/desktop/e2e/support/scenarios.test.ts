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
    expect(ids).toHaveLength(36);
    for (const id of ids) {
      expect(parseScenarioId(id)).toBe(id);
      expect(scenarioSpec(id)).toContain("./specs/");
      expect(new Set(scenarioPhases(id)).size).toBe(scenarioPhases(id).length);
    }
    expect(selectScenarios("gamebanana")).toHaveLength(10);
    expect(scenarios["profiles-pointer"].nativeInput).toBe(true);
    expect(scenarios["filesystem-crash-placed"].exit("mutate")).toBe("crash");
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
});
