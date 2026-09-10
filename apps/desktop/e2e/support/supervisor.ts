import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DriverProvider } from "./contracts";
import { scenarioPhases, type ScenarioId } from "./scenarios";
import { writeSyntheticVpk } from "./vpk";
import { prepareProfileWorld } from "./profile-fixtures";
import {
  assertDownloadNetwork,
  downloadRoutes,
  prepareDownloadWorld,
} from "./download-fixtures";
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
  fixtureRoutes?: readonly FixtureRoute[];
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

const spawnWdio = async (
  environment: NodeJS.ProcessEnv,
  outputPath: string,
): Promise<{ exitCode: number; output: string }> => {
  const wdioEntry = path.join(
    desktopRoot,
    "node_modules",
    "@wdio",
    "cli",
    "bin",
    "wdio.js",
  );
  const child = spawn(
    process.execPath,
    [wdioEntry, "run", "e2e/wdio.conf.ts"],
    {
      cwd: desktopRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  let supervisorTerminated = false;
  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
    process.stderr.write(text);
  });
  const terminateForSignal = (signal: NodeJS.Signals): void => {
    supervisorTerminated = true;
    const message = `\nE2E supervisor received ${signal}; terminating WDIO process tree\n`;
    output += message;
    process.stderr.write(message);
    terminateProcessTree(child);
  };
  const onInterrupt = (): void => terminateForSignal("SIGINT");
  const onTermination = (): void => terminateForSignal("SIGTERM");
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTermination);

  let exitCode: number;
  try {
    exitCode = await new Promise<number>((resolve, reject) => {
      const deadline = setTimeout(() => {
        supervisorTerminated = true;
        const message = `\nE2E supervisor exceeded ${WDIO_PROCESS_TIMEOUT_MS}ms; terminating WDIO process tree\n`;
        output += message;
        process.stderr.write(message);
        terminateProcessTree(child);
      }, WDIO_PROCESS_TIMEOUT_MS);
      child.once("error", (error) => {
        clearTimeout(deadline);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(deadline);
        resolve(code ?? 1);
      });
    });
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTermination);
  }
  await writeFile(outputPath, output);
  return { exitCode: supervisorTerminated ? 1 : exitCode, output };
};

const terminateProcessTree = (child: ChildProcess): void => {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  if (child.exitCode === null) child.kill("SIGKILL");
};

export const runE2eWorld = async (options: RunOptions): Promise<RunResult> => {
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
    fixtureServer = await startFixtureServer([
      ...(options.fixtureRoutes ?? []),
      ...(options.caseId.startsWith("downloads-")
        ? downloadRoutes(options.caseId)
        : []),
      ...(options.caseId.startsWith("profiles-")
        ? [
            {
              method: "GET",
              path: "/api/v2/feature-flags",
              status: 200,
              body: '[{"name":"profile-management","enabled":true}]',
            },
          ]
        : []),
      ...startupFixtureRoutes,
    ]);
    world = await createWorld({
      runId: options.runId,
      caseId: options.caseId,
      attempt: options.attempt,
      fixtureOrigin: fixtureServer.origin,
    });
    const roots = world.configuration.roots;
    if (options.caseId.startsWith("downloads-"))
      await prepareDownloadWorld(world, fixtureServer.origin, options.caseId);
    if (options.caseId.startsWith("profiles-"))
      await prepareProfileWorld(world);
    if (options.caseId === "local-mod-lifecycle") {
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
        path.join(roots.game, "protected.txt"),
        "Never change this game file\n",
      );
    }
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
      const phaseResult = await spawnWdio(
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
          HTTP_PROXY: fixtureServer.origin,
          HTTPS_PROXY: fixtureServer.origin,
          ALL_PROXY: fixtureServer.origin,
          NO_PROXY: proxyBypass,
          no_proxy: proxyBypass,
        },
        path.join(world.artifactsDirectory, `wdio-${phase}.log`),
      );
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
    if (wdioResult.exitCode === 0 && options.caseId.startsWith("downloads-"))
      assertDownloadNetwork(options.caseId, fixtureServer.requests());
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
    if (passed && options.retainPassedWorld !== true) {
      await removeOwnedWorld(world.directory);
    }
    return result;
  } catch (runError) {
    try {
      await closeResources();
    } catch (cleanupError) {
      throw new AggregateError(
        [runError, cleanupError],
        "E2E run failed and resource cleanup also failed",
        { cause: cleanupError },
      );
    }
    throw runError;
  }
};
