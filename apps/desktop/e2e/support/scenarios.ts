import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
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
import { prepareModFolderRepairWorld } from "./mod-folder-repair-fixtures";
import {
  prepareGameinfoRecoveryWorld,
  VANILLA_GAMEINFO,
} from "./gameinfo-recovery-fixtures";
import { prepareMissingVpkWorld } from "./missing-vpk-fixtures";
import { prepareBrokenStateWorld } from "./broken-state-fixtures";
import { prepareShardWorld } from "./shard-fixtures";
import { assertCrashEvidence } from "./filesystem-oracle";
import { assertNormalExit, assertInterruptedExit } from "./phase-evidence";
import { buildSyntheticVpk, writeSyntheticVpk } from "./vpk";
import { createArchive } from "./archive-fixtures";
import { randomBytes } from "node:crypto";
import { contentRoutes, prepareContentWorld } from "./content-fixtures";
import { preparePresenceCache } from "./settings-fixtures";
import { grimoireRoutes, prepareGrimoireWorld } from "./interchange-fixtures";
import { prepareHeroSkinsWorld } from "./hero-skins-fixtures";
import {
  catalogRefreshRoutes,
  assertCatalogRefreshNetwork,
} from "./catalog-refresh-fixtures";
import { prepareLegacyCatalog } from "./catalog-upgrade-fixtures";
import { prepareOnboardingWorld } from "./onboarding-fixtures";
import {
  legacyLibraryAuthorRoutes,
  prepareLegacyLibraryAuthorWorld,
} from "./library-author-fixtures";
import {
  detectedModRoutes,
  prepareDetectedModWorld,
} from "./detected-mod-fixtures";
import {
  multipakUpdateRoutes,
  assertMultipakUpdateNetwork,
} from "./multipak-update-fixtures";
import {
  variantNamesRoutes,
  assertVariantNamesNetwork,
} from "./variant-names-fixtures";
import { monkeyRoutes, prepareMonkeyWorld } from "./monkey-fixtures";
import {
  assertStatsDashboardNetwork,
  prepareStatsDashboardWorld,
  statsDashboardRoutes,
} from "./stats-dashboard-fixtures";

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
// Mods close to a gigabyte exist; importing one used to crash from 100 MB.
const LARGE_MOD_BYTES = 1024 * 1024 * 1024;
// Picked and path-only dropped files come from the world's fixtures. A dropped
// File is read by the page, which may only read app data.
const localLarge = (
  fixtureDirectory: (world: CreatedWorld) => string,
): Definition => ({
  ...defaults,
  family: "local-large",
  spec: "local-mod-large",
  phases: ["import"],
  platforms: ["win32"],
  prepare: async (world) => {
    const directory = fixtureDirectory(world);
    await mkdir(directory, { recursive: true });
    const vpk = buildSyntheticVpk([
      {
        path: "materials/e2e-large.vtex_c",
        contents: randomBytes(LARGE_MOD_BYTES),
      },
    ]);
    await writeFile(path.join(directory, "large-mod.vpk"), vpk);
    await writeFile(
      path.join(directory, "large-mod.zip"),
      await createArchive({ "large-mod.vpk": vpk }),
    );
  },
});
const localLargeOnDisk = localLarge((world) =>
  path.join(world.directory, "fixtures"),
);
const localLargeInPage = localLarge((world) =>
  path.join(world.configuration.roots.appData, "e2e-drop"),
);
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
const shards: Definition = {
  ...defaults,
  family: "shards",
  spec: "shards-library",
  phases: ["overflow", "restart-overflow"],
  routes: profileRoutes,
  prepare: prepareShardWorld,
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
  phases: ["import", "restart-import", "reimport"],
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
const stats: Definition = {
  ...defaults,
  family: "stats",
  spec: "stats-default-layout",
  phases: ["default-layout"],
  routes: statsDashboardRoutes,
  prepare: prepareStatsDashboardWorld,
  verifyNetwork: assertStatsDashboardNetwork,
};
export const scenarios = {
  monkey: {
    ...defaults,
    family: "monkey",
    spec: "monkey",
    phases: ["sequence", "restart-monkey"],
    routes: monkeyRoutes,
    prepare: prepareMonkeyWorld,
  },
  "gameinfo-readonly-launch": {
    ...defaults,
    family: "filesystem",
    spec: "gameinfo-recovery",
    phases: ["recover"],
    platforms: ["win32"],
    routes: profileRoutes,
    prepare: prepareGameinfoRecoveryWorld,
  },
  "addons-missing-enable": {
    ...defaults,
    family: "filesystem",
    spec: "gameinfo-recovery",
    phases: ["recover"],
    routes: profileRoutes,
    prepare: prepareGameinfoRecoveryWorld,
  },
  "gameinfo-reset-live": {
    ...defaults,
    family: "settings",
    spec: "gameinfo-recovery",
    phases: ["recover"],
    routes: async () => () => [
      { method: "GET", path: "/api/v2/feature-flags", status: 200, body: "[]" },
      {
        method: "GET",
        path: "/artifacts/deadlock/gameinfo.gi",
        status: 200,
        body: VANILLA_GAMEINFO,
      },
    ],
    prepare: prepareGameinfoRecoveryWorld,
  },
  "filesystem-mod-folder-repair": {
    ...filesystem,
    spec: "mod-folder-repair",
    phases: ["repair-folder", "restart-folder", "restart-restored-folder"],
    prepare: prepareModFolderRepairWorld,
  },
  "addons-folder-wiped": {
    ...defaults,
    family: "filesystem",
    spec: "addons-wipe",
    phases: ["seed-wipe", "recover-wipe", "restart-wipe"],
    prepare: prepareBrokenStateWorld,
    routes: () => createCatalogRoutes("gamebanana-single"),
  },
  "missing-vpks-launch": {
    ...defaults,
    family: "missing-vpks",
    spec: "launch-broken-state",
    phases: ["seed-launch", "launch-damaged", "restart-launch-damaged"],
    prepare: prepareBrokenStateWorld,
  },
  "gameinfo-reverted-launch": {
    ...defaults,
    family: "settings",
    spec: "launch-broken-state",
    phases: ["seed-launch", "launch-damaged", "restart-launch-damaged"],
    prepare: prepareBrokenStateWorld,
  },
  "catalog-refresh": {
    ...defaults,
    family: "catalog",
    spec: "catalog-refresh",
    phases: ["refresh"],
    routes: catalogRefreshRoutes,
    verifyNetwork: assertCatalogRefreshNetwork,
  },
  "library-author-legacy": {
    ...defaults,
    family: "navigation",
    spec: "library-author-navigation",
    phases: ["legacy-author-navigation"],
    routes: legacyLibraryAuthorRoutes,
    prepare: prepareLegacyLibraryAuthorWorld,
    verifyNetwork: (_id: string, requests: readonly FixtureRequest[]) => {
      const profiles = requests.filter((request) =>
        request.url.includes("/apiv11/Mod/920001/ProfilePage"),
      );
      const detail = requests.findIndex((request) =>
        request.url.includes("/apiv11/Mod/920001/ProfilePage"),
      );
      const author = requests.findIndex((request) =>
        request.url.includes("/api/v2/mod-authors/"),
      );
      if (profiles.length !== 1 || detail < 0 || author <= detail)
        throw new Error(
          "Legacy author navigation must resolve the mod once before opening its author",
        );
    },
  },
  "library-author-navigation": {
    ...defaults,
    family: "navigation",
    spec: "library-author-navigation",
    phases: ["author-navigation"],
    routes: contentRoutes,
  },
  "gamebanana-detected-files": {
    ...defaults,
    family: "gamebanana",
    spec: "detected-mod",
    phases: ["detect-files", "restart-detected"],
    routes: detectedModRoutes,
    prepare: prepareDetectedModWorld,
    verifyNetwork: (_id: string, requests: readonly FixtureRequest[]) => {
      if (
        !requests.some(
          (request) =>
            request.method === "POST" &&
            request.url.includes("/api/v2/vpk-analyse-hashes") &&
            request.responseStatus === 200,
        )
      )
        throw new Error("Existing mod was never identified through analysis");
      const archiveRequests = requests.filter((request) =>
        request.url.includes("/dl/"),
      );
      if (
        archiveRequests.length !== 1 ||
        !archiveRequests[0].url.includes("/dl/910002")
      )
        throw new Error(
          "File management must download only the newly added optional archive once",
        );
    },
  },
  "onboarding-skip-analysis": {
    ...defaults,
    family: "onboarding",
    spec: "onboarding",
    phases: ["skip-analysis"],
    prepare: prepareOnboardingWorld,
    routes: async () => () => [
      {
        method: "POST",
        path: "/api/v2/vpk-analyse-hashes",
        status: 200,
        body: "[]",
      },
      {
        method: "GET",
        path: "/apiv11/Util/Fileservers",
        status: 200,
        body: '{"_aRecords":[]}',
      },
    ],
    verifyNetwork: (_id: string, requests: readonly FixtureRequest[]) => {
      if (
        !requests.some(
          (request) =>
            request.method === "POST" &&
            request.url.includes("/api/v2/vpk-analyse-hashes") &&
            request.responseStatus === 200,
        )
      )
        throw new Error("Onboarding never analyzed the existing VPK");
    },
  },
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
  "local-mod-large-picker-vpk": { ...localLargeOnDisk, nativeInput: true },
  "local-mod-large-picker-zip": { ...localLargeOnDisk, nativeInput: true },
  "local-mod-large-drop-vpk": localLargeInPage,
  "local-mod-large-drop-zip": localLargeInPage,
  "local-mod-large-drop-path-vpk": localLargeOnDisk,
  "local-mod-large-drop-path-zip": localLargeOnDisk,
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
  "shards-library": shards,
  "shards-conflicts": {
    ...shards,
    spec: "shards-conflicts",
    phases: ["cross-shard", "restart-cross-shard"],
  },
  "filesystem-crash-committed": crash,
  "filesystem-manifest-repair": manifestRepair,
  "missing-vpks-offline": missingVpks,
  "missing-vpks-live": {
    ...missingVpks,
    phases: ["detect-live", "restart-live"],
  },
  "gamebanana-single": catalog,
  "gamebanana-legacy-catalog": {
    ...defaults,
    family: "gamebanana",
    spec: "catalog-upgrade",
    phases: ["upgrade-catalog", "restart-upgrade"],
    routes: contentRoutes,
    prepare: prepareLegacyCatalog,
    verifyNetwork: (_id: string, requests: readonly FixtureRequest[]) => {
      if (
        !requests.some(
          (request) =>
            request.url.includes("/apiv11/Mod/Index") &&
            request.responseStatus === 200,
        )
      )
        throw new Error("The upgraded catalog never synced from GameBanana");
    },
  },
  "gamebanana-multifile": catalog,
  "gamebanana-variants": catalog,
  "gamebanana-remembered": catalogLifecycle,
  "gamebanana-unremembered": catalogLifecycle,
  "gamebanana-switch": catalogLifecycle,
  "gamebanana-switch-failure": catalogLifecycle,
  "gamebanana-reselect": catalogLifecycle,
  "gamebanana-file-toggle": catalogLifecycle,
  "gamebanana-reinstall": catalogLifecycle,
  "gamebanana-reinstall-disabled": catalogLifecycle,
  "gamebanana-force-update": catalogLifecycle,
  "gamebanana-multipak-update": {
    ...catalog,
    spec: "gamebanana-multipak-update",
    phases: ["update-toggle", "restart-uninstall"],
    routes: multipakUpdateRoutes,
    verifyNetwork: assertMultipakUpdateNetwork,
  },
  "gamebanana-variant-names": {
    ...catalog,
    spec: "gamebanana-variant-names",
    phases: ["variants", "restart"],
    routes: variantNamesRoutes,
    verifyNetwork: assertVariantNamesNetwork,
  },
  "gamebanana-update-skip": {
    ...catalog,
    spec: "gamebanana-updates",
    phases: ["optional-file", "skip-update", "restart-skipped", "newer-update"],
  },
  "grimoire-import": interchange,
  "hero-skins-active": heroSkins,
  "stats-default-layout": stats,
  "stats-arrange-widgets": {
    ...stats,
    spec: "stats-arrange-widgets",
    phases: ["arrange", "restart-arrange"],
  },
  "stats-custom-tabs": {
    ...stats,
    spec: "stats-custom-tabs",
    phases: ["tabs", "restart-tabs"],
  },
  "stats-custom-queries": {
    ...stats,
    spec: "stats-custom-queries",
    phases: ["queries"],
  },
  "stats-broken-endpoints": {
    ...stats,
    spec: "stats-broken-endpoints",
    phases: ["broken"],
  },
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
