import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { CreatedWorld } from "./world";
import type { FixtureRoute, FixtureRequest } from "./fixture-server";
import {
  createCatalogRoutes,
  assertCatalogNetwork,
} from "./gamebanana-fixtures";
import {
  downloadRoutes,
  prepareDownloadWorld,
  assertDownloadNetwork,
} from "./download-fixtures";
import { prepareProfileWorld } from "./profile-fixtures";
import { prepareFilesystemWorld } from "./filesystem-fixtures";
import { assertCrashEvidence } from "./filesystem-oracle";
import { assertNormalExit, assertInterruptedExit } from "./phase-evidence";
import { writeSyntheticVpk } from "./vpk";

type Definition = {
  family: string;
  spec: string;
  phases: readonly string[];
  nativeInput: boolean;
  coverage: "ui" | "ipc-recovery";
  routes: (id: string) => Promise<(origin: string) => readonly FixtureRoute[]>;
  prepare: (world: CreatedWorld, origin: string) => Promise<void>;
  exit: (phase: string) => "normal" | "crash" | "interrupt";
  verifyNetwork: (id: string, requests: readonly FixtureRequest[]) => void;
};
const defaults = {
  nativeInput: false,
  coverage: "ui",
  routes: async () => () => [],
  prepare: async () => {},
  exit: () => "normal",
  verifyNetwork: () => {},
} satisfies Partial<Definition>;
const smoke: Definition = {
  ...defaults,
  family: "smoke",
  spec: "about",
  phases: ["smoke"],
};
const local: Definition = {
  ...defaults,
  family: "local",
  spec: "local-mod-lifecycle",
  phases: ["import-toggle", "restart-delete"],
  nativeInput: true,
  prepare: async (world) => {
    await writeSyntheticVpk(
      path.join(world.directory, "fixtures", "e2e-local-mod.vpk"),
      [
        {
          path: "scripts/e2e-lifecycle.txt",
          contents: "DMM synthetic lifecycle fixture v1\n",
        },
      ],
    );
    await writeFile(
      path.join(world.configuration.roots.game, "protected.txt"),
      "Never change this game file\n",
    );
  },
};
const profileRoutes = async () => () => [
  {
    method: "GET",
    path: "/api/v2/feature-flags",
    status: 200,
    body: '[{"name":"profile-management","enabled":true}]',
  },
];
const profiles: Definition = {
  ...defaults,
  family: "profiles",
  spec: "profiles-ordering",
  phases: ["reorder-switch", "restart-profiles"],
  nativeInput: true,
  routes: profileRoutes,
  prepare: async (world) => prepareProfileWorld(world),
};
const downloads: Definition = {
  ...defaults,
  family: "downloads",
  spec: "downloads",
  phases: ["transfer", "restart-download"],
  routes: async (id) => () => downloadRoutes(id),
  prepare: async (world, origin) =>
    prepareDownloadWorld(world, origin, world.configuration.caseId),
  verifyNetwork: assertDownloadNetwork,
};
const filesystem: Definition = {
  ...defaults,
  family: "filesystem",
  spec: "filesystem",
  phases: ["mutate", "restart-filesystem"],
  coverage: "ipc-recovery",
  routes: profileRoutes,
  prepare: async (world) => prepareFilesystemWorld(world),
};
const crash: Definition = {
  ...filesystem,
  exit: (phase) => (phase === "mutate" ? "crash" : "normal"),
};
const catalog: Definition = {
  ...defaults,
  family: "gamebanana",
  spec: "gamebanana",
  phases: ["catalog-install", "restart-catalog"],
  routes: createCatalogRoutes,
  verifyNetwork: assertCatalogNetwork,
  prepare: async (world) => {
    await writeFile(
      path.join(world.configuration.roots.game, "protected.txt"),
      "Keep the synthetic game intact\n",
    );
  },
};
export const scenarios = {
  "about-smoke": smoke,
  "local-mod-lifecycle": local,
  "profiles-pointer": profiles,
  "profiles-keyboard": profiles,
  "downloads-pause": downloads,
  "downloads-range": downloads,
  "downloads-cancel": { ...downloads, coverage: "ipc-recovery" },
  "downloads-restart": {
    ...downloads,
    exit: (phase: string) => (phase === "transfer" ? "interrupt" : "normal"),
  },
  "downloads-redirect": downloads,
  "downloads-auth": downloads,
  "downloads-corrupt": downloads,
  "downloads-variants": downloads,
  "filesystem-backup-replace": filesystem,
  "filesystem-backup-merge": filesystem,
  "filesystem-lock": filesystem,
  "filesystem-collision": filesystem,
  "filesystem-shards": filesystem,
  "filesystem-crash-placed": crash,
  "filesystem-crash-committed": crash,
  "gamebanana-single": catalog,
  "gamebanana-multifile": catalog,
  "gamebanana-variants": catalog,
} satisfies Record<string, Definition>;
export type ScenarioId = keyof typeof scenarios;
const isScenario = (value: string): value is ScenarioId =>
  Object.hasOwn(scenarios, value);
export const parseScenarioId = (value = "about-smoke"): ScenarioId => {
  if (isScenario(value)) return value;
  throw new Error(`Unsupported E2E case '${value}'`);
};
export const scenarioPhases = (id: ScenarioId) => scenarios[id].phases;
export const scenarioSpec = (id: ScenarioId) =>
  `./specs/${scenarios[id].spec}.e2e.ts`;
export const selectScenarios = (suite: string): ScenarioId[] => {
  if (suite === "ci-pr")
    return [
      "about-smoke",
      "local-mod-lifecycle",
      "downloads-range",
      "downloads-restart",
      "gamebanana-variants",
      "filesystem-crash-committed",
    ];
  const ids = Object.keys(scenarios)
    .filter(isScenario)
    .filter(
      (id) =>
        suite === "all" ||
        scenarios[id].family === suite ||
        scenarios[id].coverage === suite,
    );
  if (!ids.length) throw new Error(`Unknown or empty E2E suite '${suite}'`);
  return ids;
};
export const verifyPhase = async (
  id: ScenarioId,
  world: string,
  phase: string,
): Promise<void> => {
  const mode = scenarios[id].exit(phase);
  if (mode === "crash") await assertCrashEvidence(world);
  else if (mode === "normal") await assertNormalExit(world, phase);
  else await assertInterruptedExit(world, phase);
};
