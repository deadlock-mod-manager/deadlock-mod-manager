import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DriverProvider } from "./contracts";
import {
  scenarioPhases,
  scenarios,
  verifyPhase,
  type ScenarioId,
} from "./scenarios";
import { runProcess } from "./process-control";
import { captureEvidence } from "./evidence";
import { startFilesystemJournal } from "./filesystem-journal";
import { startFixtureServer, type FixtureRoute } from "./fixture-server";
import {
  collectFileInventory,
  createWorld,
  removeOwnedWorld,
  REPOSITORY_ROOT,
} from "./world";

const desktopRoot = path.join(REPOSITORY_ROOT, "apps", "desktop");
const WDIO_PROCESS_TIMEOUT_MS = 120_000;
export const defaultBinaryPath = path.join(
  desktopRoot,
  "target",
  "debug",
  process.platform === "win32"
    ? "deadlock-mod-manager.exe"
    : "deadlock-mod-manager",
);

type RunOptions = {
  provider: DriverProvider;
  runId: string;
  caseId: ScenarioId;
  attempt: number;
  binaryPath?: string;
  retainPassedWorld?: boolean;
  intentionalTimeout?: boolean;
  allowNativeInput?: boolean;
  fixtureRoutes?: readonly FixtureRoute[];
  runPhase?: (
    environment: NodeJS.ProcessEnv,
    outputPath: string,
  ) => Promise<{ exitCode: number; output: string }>;
};

export type RunResult = {
  passed: boolean;
  expectedFailureObserved: boolean;
  exitCode: number;
  worldDirectory: string;
  elapsedMs: number;
  unexpectedRequests: number;
};

const startupFixtureRoutes: readonly FixtureRoute[] = [
  {
    method: "GET",
    path: "/",
    status: 200,
    body: '{"status":"ok","db":{"alive":true},"redis":{"alive":true,"configured":false},"version":"e2e","spec":"e2e"}',
  },
  { method: "GET", path: "/api/v2/feature-flags", status: 200, body: "[]" },
  { method: "GET", path: "/api/v2/announcements", status: 200, body: "[]" },
  { method: "GET", path: "/custom-settings", status: 200, body: "[]" },
  {
    method: "GET",
    path: "/api/v2/relays/health",
    status: 200,
    body: '{"relays":[]}',
  },
  { method: "GET", path: "/health", status: 200, body: '{"status":"ok"}' },
  {
    method: "GET",
    path: "/api/v2/policy-manifest",
    status: 200,
    body: '{"version":1,"revision":0,"generatedAt":"1970-01-01T00:00:00Z","rules":[]}',
  },
  {
    method: "GET",
    path: "/apiv11/Mod/Index",
    status: 200,
    body: '{"_aMetadata":{"_nRecordCount":0,"_nPerpage":50,"_bIsComplete":true},"_aRecords":[]}',
  },
  {
    method: "GET",
    path: "/apiv11/Sound/Index",
    status: 200,
    body: '{"_aMetadata":{"_nRecordCount":0,"_nPerpage":50,"_bIsComplete":true},"_aRecords":[]}',
  },
];

const spawnWdio = (environment: NodeJS.ProcessEnv, outputPath: string) =>
  runProcess({
    executable: process.execPath,
    args: [
      path.join(desktopRoot, "node_modules", "@wdio", "cli", "bin", "wdio.js"),
      "run",
      "e2e/wdio.conf.ts",
    ],
    cwd: desktopRoot,
    environment,
    outputPath,
    timeoutMs: WDIO_PROCESS_TIMEOUT_MS,
  });

export const runE2eWorld = async (options: RunOptions): Promise<RunResult> => {
  if (scenarios[options.caseId].nativeInput && !options.allowNativeInput)
    throw new Error(
      `${options.caseId} controls the Windows desktop. Run with --allow-native-input only when the desktop is available for testing.`,
    );
  const startedAt = Date.now();
  let fixtureServer: Awaited<ReturnType<typeof startFixtureServer>> | undefined;
  let world: Awaited<ReturnType<typeof createWorld>> | undefined;
  let filesystemJournal: ReturnType<typeof startFilesystemJournal> | undefined;
  let resourcesClosed = false;
  const closeResources = async (): Promise<void> => {
    if (resourcesClosed) return;
    resourcesClosed = true;
    const results = await Promise.allSettled([
      ...(filesystemJournal === undefined ? [] : [filesystemJournal.close()]),
      ...(fixtureServer === undefined
        ? []
        : [fixtureServer.close(world?.artifactsDirectory)]),
    ]);
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        "Failed to close E2E resources",
      );
    }
  };

  try {
    const definition = scenarios[options.caseId];
    const routes = await definition.routes(options.caseId);
    fixtureServer = await startFixtureServer((origin) => [
      ...(options.fixtureRoutes ?? []),
      ...routes(origin),
      ...startupFixtureRoutes,
    ]);
    world = await createWorld({
      runId: options.runId,
      caseId: options.caseId,
      attempt: options.attempt,
      fixtureOrigin: fixtureServer.origin,
    });
    const roots = world.configuration.roots;
    await definition.prepare(world, fixtureServer.origin);
    const inventoryRoots = {
      game: roots.game,
      steam: roots.steam,
      steamHttpCache: roots.steamHttpCache,
      appData: roots.appData,
      appConfig: roots.appConfig,
      appCache: roots.appCache,
      appLogs: roots.appLogs,
      webviewData: roots.webviewData,
      temporary: roots.temporary,
    };
    const before = Object.fromEntries(
      await Promise.all(
        Object.entries(inventoryRoots).map(async ([name, root]) => [
          name,
          await collectFileInventory(root),
        ]),
      ),
    );
    await mkdir(world.artifactsDirectory, { recursive: true });
    await writeFile(
      path.join(world.artifactsDirectory, "files-before.json"),
      JSON.stringify(before, null, 2),
    );
    filesystemJournal = startFilesystemJournal(
      inventoryRoots,
      world.artifactsDirectory,
    );

    const proxyBypass = "127.0.0.1,localhost";
    let wdioResult = { exitCode: 0, output: "" };
    for (const phase of scenarioPhases(options.caseId)) {
      const phaseResult = await (options.runPhase ?? spawnWdio)(
        {
          ...process.env,
          DMM_E2E_CONFIG: world.configPath,
          DMM_E2E_BINARY: path.resolve(options.binaryPath ?? defaultBinaryPath),
          DMM_E2E_PROVIDER: options.provider,
          DMM_E2E_ARTIFACTS: world.artifactsDirectory,
          DMM_E2E_RUN_ID: world.configuration.runId,
          DMM_E2E_CASE_ID: world.configuration.caseId,
          DMM_E2E_PHASE: phase,
          DMM_E2E_INTENTIONAL_TIMEOUT: options.intentionalTimeout ? "1" : "0",
          DMM_E2E_ALLOW_NATIVE_INPUT: options.allowNativeInput ? "1" : "0",
          HTTP_PROXY: fixtureServer.origin,
          HTTPS_PROXY: fixtureServer.origin,
          ALL_PROXY: fixtureServer.origin,
          NO_PROXY: proxyBypass,
          no_proxy: proxyBypass,
        },
        path.join(world.artifactsDirectory, `wdio-${phase}.log`),
      );
      if (phaseResult.exitCode === 0)
        await verifyPhase(options.caseId, world.directory, phase);
      wdioResult = {
        exitCode: phaseResult.exitCode,
        output: wdioResult.output + phaseResult.output,
      };
      if (
        phaseResult.exitCode !== 0 ||
        fixtureServer.unmatchedRequests().length > 0
      )
        break;
    }
    if (wdioResult.exitCode === 0)
      definition.verifyNetwork(options.caseId, fixtureServer.requests());
    await closeResources();
    const after = Object.fromEntries(
      await Promise.all(
        Object.entries(inventoryRoots).map(async ([name, root]) => [
          name,
          await collectFileInventory(root),
        ]),
      ),
    );
    await writeFile(
      path.join(world.artifactsDirectory, "files-after.json"),
      JSON.stringify(after, null, 2),
    );

    const unexpectedRequests = fixtureServer.unmatchedRequests().length;
    const expectedFailureObserved =
      options.intentionalTimeout === true &&
      wdioResult.exitCode !== 0 &&
      wdioResult.output.includes("intentional harness timeout");
    const passed =
      unexpectedRequests === 0 &&
      (options.intentionalTimeout === true
        ? expectedFailureObserved
        : wdioResult.exitCode === 0);
    const result: RunResult = {
      passed,
      expectedFailureObserved,
      exitCode: wdioResult.exitCode,
      worldDirectory: world.directory,
      elapsedMs: Date.now() - startedAt,
      unexpectedRequests,
    };
    await writeFile(
      path.join(world.artifactsDirectory, "result.json"),
      JSON.stringify(result, null, 2),
    );
    if (
      passed &&
      !options.intentionalTimeout &&
      options.retainPassedWorld !== true
    ) {
      await removeOwnedWorld(world.directory);
    }
    return result;
  } catch (runError) {
    if (!world) {
      await closeResources();
      throw runError;
    }
    const retained = world;
    const failures = await captureEvidence(retained.artifactsDirectory, {
      resources: closeResources,
      inventory: async () => {
        const roots = Object.entries(retained.configuration.roots).filter(
          ([name]) => name !== "world",
        );
        const snapshots: Record<string, Record<string, string>> = {};
        const errors = await captureEvidence(
          retained.artifactsDirectory,
          Object.fromEntries(
            roots.map(([name, directory]) => [
              name,
              async () => {
                snapshots[name] = await collectFileInventory(directory);
              },
            ]),
          ),
        );
        await writeFile(
          path.join(retained.artifactsDirectory, "files-after.json"),
          JSON.stringify({ ...snapshots, captureErrors: errors }, null, 2),
        );
      },
    });
    const result = {
      passed: false,
      expectedFailureObserved: false,
      exitCode: 1,
      worldDirectory: retained.directory,
      elapsedMs: Date.now() - startedAt,
      unexpectedRequests: fixtureServer?.unmatchedRequests().length ?? 0,
      error: runError instanceof Error ? runError.stack : String(runError),
      captureErrors: failures,
    };
    await writeFile(
      path.join(retained.artifactsDirectory, "result.json"),
      JSON.stringify(result, null, 2),
    );
    return result;
  }
};
