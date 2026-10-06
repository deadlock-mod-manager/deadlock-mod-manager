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
import { prepareConflictWorld } from "./conflict-fixtures";
import { prepareFilesystemWorld } from "./filesystem-fixtures";
import { prepareManifestRepairWorld } from "./manifest-repair-fixtures";
import { prepareMissingVpkWorld } from "./missing-vpk-fixtures";
import { assertCrashEvidence } from "./filesystem-oracle";
import { assertNormalExit, assertInterruptedExit } from "./phase-evidence";
import { writeSyntheticVpk } from "./vpk";
import { contentRoutes, prepareContentWorld } from "./content-fixtures";
import { preparePresenceCache } from "./settings-fixtures";
import { grimoireRoutes, prepareGrimoireWorld } from "./interchange-fixtures";
import { prepareHeroSkinsWorld } from "./hero-skins-fixtures";

type Definition = {
  family: string;
  spec: string;
  phases: readonly string[];
  nativeInput: boolean;
  // Native input drives the FlaUI helper, and some faults rely on Windows file
  // sharing semantics; those cases are not registered on other platforms.
  platforms: readonly NodeJS.Platform[];
  coverage: "ui" | "ipc-recovery";
  routes: (id: string) => Promise<(origin: string) => readonly FixtureRoute[]>;
  prepare: (world: CreatedWorld, origin: string) => Promise<void>;
  exit: (phase: string) => "normal" | "crash" | "interrupt";
  verifyNetwork: (id: string, requests: readonly FixtureRequest[]) => void;
};
const defaults = {
  nativeInput: false,
  platforms: ["win32", "linux"],
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
  platforms: ["win32"],
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
    body: "[]",
  },
];
const profiles: Definition = {
  ...defaults,
  family: "profiles",
  spec: "profiles-ordering",
  phases: ["reorder-switch", "restart-profiles"],
  nativeInput: true,
  platforms: ["win32"],
  routes: profileRoutes,
  prepare: async (world) => prepareProfileWorld(world),
};
const conflicts: Definition = {
  ...defaults,
  family: "conflicts",
  spec: "conflicts",
  phases: ["resolve", "restart-conflicts"],
  routes: profileRoutes,
  prepare: async (world) => prepareConflictWorld(world),
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
const manifestRepair: Definition = {
  ...filesystem,
  spec: "manifest-repair",
  phases: ["repair", "restart-repair"],
  prepare: async (world) => prepareManifestRepairWorld(world),
};
const missingVpks: Definition = {
  ...defaults,
  family: "missing-vpks",
  spec: "missing-vpks",
  phases: ["detect-offline", "restart-offline"],
  routes: profileRoutes,
  prepare: async (world) => prepareMissingVpkWorld(world),
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
const catalogLifecycle: Definition = {
  ...catalog,
  spec: "gamebanana-lifecycle",
  phases: ["catalog-change", "restart-changed"],
};
const interchange: Definition = {
  ...defaults,
  family: "interchange",
  spec: "grimoire-import",
  phases: ["import", "restart-import"],
  routes: grimoireRoutes,
  prepare: async (world) => prepareGrimoireWorld(world),
};
const settings: Definition = {
  ...defaults,
  family: "settings",
  spec: "settings",
  phases: ["configure", "restart-settings"],
  prepare: preparePresenceCache,
};
const heroSkins: Definition = {
  ...defaults,
  family: "skins",
  spec: "hero-skins",
  phases: ["active-skins"],
  routes: profileRoutes,
  prepare: async (world) => prepareHeroSkinsWorld(world),
};
export const scenarios = {
  "content-blur": {
    ...settings,
    spec: "content-blur",
    phases: ["reveal-content", "restart-blur"],
    routes: contentRoutes,
    prepare: prepareContentWorld,
  },
  "content-visibility": {
    ...settings,
    spec: "content-visibility",
    phases: ["content-preferences", "restart-content"],
    routes: contentRoutes,
    prepare: prepareContentWorld,
  },
  "content-author-visibility": {
    ...settings,
    spec: "content-author-visibility",
    phases: ["author-preferences", "restart-author"],
    routes: contentRoutes,
    prepare: prepareContentWorld,
  },
  "game-launch-modes": {
    ...settings,
    spec: "game-launch",
    phases: ["launch-modes", "restart-launch"],
    routes: profileRoutes,
    prepare: async (world: CreatedWorld) => {
      await prepareProfileWorld(world);
      await preparePresenceCache(world);
    },
  },
  "settings-application": settings,
  "settings-privacy": settings,
  "settings-backups-presence": settings,
  "settings-language": settings,
  "about-smoke": smoke,
  "local-mod-lifecycle": local,
  "profiles-pointer": profiles,
  "profiles-keyboard": profiles,
  "conflicts-resolve": conflicts,
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
  "filesystem-lock": { ...filesystem, platforms: ["win32"] },
  "filesystem-collision": filesystem,
  "filesystem-shards": filesystem,
  "filesystem-crash-placed": crash,
  "filesystem-crash-committed": crash,
  "filesystem-manifest-repair": manifestRepair,
  "missing-vpks-offline": missingVpks,
  "missing-vpks-live": {
    ...missingVpks,
    phases: ["detect-live", "restart-live"],
  },
  "gamebanana-single": catalog,
  "gamebanana-multifile": catalog,
  "gamebanana-variants": catalog,
  "gamebanana-remembered": catalogLifecycle,
  "gamebanana-unremembered": catalogLifecycle,
  "gamebanana-switch": catalogLifecycle,
  "gamebanana-switch-failure": catalogLifecycle,
  "gamebanana-reselect": catalogLifecycle,
  "gamebanana-reinstall": catalogLifecycle,
  "gamebanana-reinstall-disabled": catalogLifecycle,
  "gamebanana-force-update": catalogLifecycle,
  "gamebanana-update-skip": {
    ...catalog,
    spec: "gamebanana-updates",
    phases: ["optional-file", "skip-update", "restart-skipped", "newer-update"],
  },
  "grimoire-import": interchange,
  "hero-skins-active": heroSkins,
} satisfies Record<string, Definition>;
export type ScenarioId = keyof typeof scenarios;
const isScenario = (value: string): value is ScenarioId =>
  Object.hasOwn(scenarios, value);
const supportsPlatform = (id: ScenarioId): boolean => {
  const platforms: readonly NodeJS.Platform[] = scenarios[id].platforms;
  return platforms.includes(process.platform);
};
export const parseScenarioId = (value = "about-smoke"): ScenarioId => {
  if (!isScenario(value)) throw new Error(`Unsupported E2E case '${value}'`);
  if (!supportsPlatform(value))
    throw new Error(
      `E2E case '${value}' supports ${scenarios[value].platforms.join(", ")}, not ${process.platform}`,
    );
  return value;
};
export const scenarioPhases = (id: ScenarioId) => scenarios[id].phases;
export const scenarioSpec = (id: ScenarioId) =>
  `./specs/${scenarios[id].spec}.e2e.ts`;
export const selectScenarios = (suite: string): ScenarioId[] => {
  const ids = Object.keys(scenarios)
    .filter(isScenario)
    .filter(supportsPlatform)
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
