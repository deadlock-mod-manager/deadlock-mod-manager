export type ScenarioId =
  | "about-smoke"
  | "local-mod-lifecycle"
  | "profiles-pointer"
  | "profiles-keyboard";

export const parseScenarioId = (value = "about-smoke"): ScenarioId => {
  if (
    value === "about-smoke" ||
    value === "local-mod-lifecycle" ||
    value === "profiles-pointer" ||
    value === "profiles-keyboard"
  )
    return value;
  throw new Error(`Unsupported E2E case '${value}'`);
};

export const scenarioPhases = (scenario: ScenarioId): readonly string[] =>
  scenario === "local-mod-lifecycle"
    ? ["import-toggle", "restart-delete"]
    : scenario === "about-smoke"
      ? ["smoke"]
      : ["reorder-switch", "restart-profiles"];

export const scenarioSpec = (scenario: ScenarioId): string =>
  scenario === "local-mod-lifecycle"
    ? "./specs/local-mod-lifecycle.e2e.ts"
    : scenario === "about-smoke"
      ? "./specs/about.e2e.ts"
      : "./specs/profiles-ordering.e2e.ts";
