export type ScenarioId =
  | "gamebanana-single"
  | "gamebanana-multifile"
  | "gamebanana-variants"
  | "filesystem-backup-replace"
  | "filesystem-backup-merge"
  | "filesystem-lock"
  | "filesystem-collision"
  | "filesystem-shards"
  | "filesystem-crash-placed"
  | "filesystem-crash-committed"
  | "about-smoke"
  | "local-mod-lifecycle"
  | "profiles-pointer"
  | "profiles-keyboard"
  | "downloads-pause"
  | "downloads-range"
  | "downloads-cancel"
  | "downloads-restart"
  | "downloads-redirect"
  | "downloads-auth"
  | "downloads-corrupt"
  | "downloads-variants";

export const parseScenarioId = (value = "about-smoke"): ScenarioId => {
  if (
    value === "gamebanana-single" ||
    value === "gamebanana-multifile" ||
    value === "gamebanana-variants" ||
    value === "filesystem-backup-replace" ||
    value === "filesystem-backup-merge" ||
    value === "filesystem-lock" ||
    value === "filesystem-collision" ||
    value === "filesystem-shards" ||
    value === "filesystem-crash-placed" ||
    value === "filesystem-crash-committed" ||
    value === "about-smoke" ||
    value === "local-mod-lifecycle" ||
    value === "profiles-pointer" ||
    value === "profiles-keyboard" ||
    value === "downloads-pause" ||
    value === "downloads-range" ||
    value === "downloads-cancel" ||
    value === "downloads-auth" ||
    value === "downloads-corrupt" ||
    value === "downloads-variants" ||
    value === "downloads-restart" ||
    value === "downloads-redirect"
  )
    return value;
  throw new Error(`Unsupported E2E case '${value}'`);
};

export const scenarioPhases = (scenario: ScenarioId): readonly string[] =>
  scenario.startsWith("gamebanana-")
    ? ["catalog-install", "restart-catalog"]
    : scenario.startsWith("filesystem-")
      ? ["mutate", "restart-filesystem"]
      : scenario.startsWith("downloads-")
        ? ["transfer", "restart-download"]
        : scenario === "local-mod-lifecycle"
          ? ["import-toggle", "restart-delete"]
          : scenario === "about-smoke"
            ? ["smoke"]
            : ["reorder-switch", "restart-profiles"];

export const scenarioSpec = (scenario: ScenarioId): string =>
  scenario.startsWith("gamebanana-")
    ? "./specs/gamebanana.e2e.ts"
    : scenario.startsWith("filesystem-")
      ? "./specs/filesystem.e2e.ts"
      : scenario.startsWith("downloads-")
        ? "./specs/downloads.e2e.ts"
        : scenario === "local-mod-lifecycle"
          ? "./specs/local-mod-lifecycle.e2e.ts"
          : scenario === "about-smoke"
            ? "./specs/about.e2e.ts"
            : "./specs/profiles-ordering.e2e.ts";
