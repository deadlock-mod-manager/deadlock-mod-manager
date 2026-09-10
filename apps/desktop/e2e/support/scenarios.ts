export type ScenarioId = "about-smoke" | "local-mod-lifecycle";

export const parseScenarioId = (value = "about-smoke"): ScenarioId => {
  if (value === "about-smoke" || value === "local-mod-lifecycle") return value;
  throw new Error(`Unsupported E2E case '${value}'`);
};

export const scenarioPhases = (scenario: ScenarioId): readonly string[] =>
  scenario === "local-mod-lifecycle"
    ? ["import-toggle", "restart-delete"]
    : ["smoke"];

export const scenarioSpec = (scenario: ScenarioId): string =>
  scenario === "local-mod-lifecycle"
    ? "./specs/local-mod-lifecycle.e2e.ts"
    : "./specs/about.e2e.ts";
