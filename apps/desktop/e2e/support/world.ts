import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  type E2eConfiguration,
  type E2eRoots,
  SERVICE_NAMES,
  type WorldManifest,
  worldManifestSchema,
} from "./contracts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(HERE, "../../../..");
export const WORLDS_ROOT = path.join(REPOSITORY_ROOT, ".e2e", "worlds");

const safeId = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (normalized.length === 0) {
    throw new Error(`Cannot make a safe E2E identifier from '${value}'`);
  }
  return normalized;
};

const makeRoots = (world: string): E2eRoots => ({
  world,
  game: path.join(world, "game-install"),
  steam: path.join(world, "steam"),
  steamHttpCache: path.join(world, "steam-http-cache"),
  appData: path.join(world, "app-data"),
  appConfig: path.join(world, "app-config"),
  appCache: path.join(world, "app-cache"),
  appLogs: path.join(world, "app-logs"),
  webviewData: path.join(world, "webview-data"),
  temporary: path.join(world, "temporary"),
});

const initialPersistedState = (): string =>
  JSON.stringify({
    state: {
      hasCompletedOnboarding: true,
      autoUpdateEnabled: false,
      ingestToolEnabled: false,
      telemetrySettings: {
        analyticsEnabled: false,
        hasSeenTelemetryPrompt: true,
      },
    },
    version: 26,
  });

const writeInitialFilesystem = async (roots: E2eRoots): Promise<void> => {
  await Promise.all(
    Object.values(roots).map((directory) =>
      mkdir(directory, { recursive: true }),
    ),
  );
  const addons = path.join(roots.game, "game", "citadel", "addons");
  await mkdir(addons, { recursive: true });
  await writeFile(
    path.join(roots.game, "game", "citadel", "gameinfo.gi"),
    'GameInfo\n{\n  game "Deadlock"\n  FileSystem\n  {\n    SearchPaths\n    {\n      Game citadel\n      Game core\n      Mod citadel\n      Write citadel\n    }\n  }\n}\n',
  );
  await mkdir(path.join(roots.steam, "steamapps"), { recursive: true });
  await Promise.all([
    writeFile(path.join(roots.steam, "steam.exe"), "E2E launch sentinel"),
    writeFile(path.join(roots.steam, "steam.sh"), "#!/bin/sh\nexit 97\n"),
  ]);
  await writeFile(
    path.join(roots.steam, "steamapps", "libraryfolders.vdf"),
    `"libraryfolders"\n{\n  "0"\n  {\n    "path" "${roots.steam.replaceAll("\\", "\\\\")}"\n  }\n}\n`,
  );
  await writeFile(
    path.join(roots.appData, "state.json"),
    JSON.stringify({ "local-config": initialPersistedState() }, null, 2),
  );
};

export type CreatedWorld = {
  directory: string;
  configPath: string;
  manifestPath: string;
  artifactsDirectory: string;
  configuration: E2eConfiguration;
};

export const createWorld = async (options: {
  runId: string;
  caseId: string;
  attempt: number;
  fixtureOrigin: string;
}): Promise<CreatedWorld> => {
  const runId = safeId(options.runId);
  const caseId = safeId(options.caseId);
  const nonce = createHash("sha256")
    .update(`${process.pid}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 10);
  const directory = path.resolve(
    WORLDS_ROOT,
    `${runId}-${caseId}-${options.attempt}-${nonce}`,
  );
  const roots = makeRoots(directory);
  await writeInitialFilesystem(roots);

  const artifactsDirectory = path.join(directory, "artifacts");
  await mkdir(artifactsDirectory, { recursive: true });
  const tokenFile = path.join(directory, "control-token");
  await writeFile(
    tokenFile,
    createHash("sha256").update(`${nonce}:${Date.now()}`).digest("hex"),
  );

  const configuration: E2eConfiguration = {
    schemaVersion: 1,
    runId,
    caseId,
    attempt: options.attempt,
    applicationIdentity: `dev.stormix.deadlock-mod-manager.e2e.${nonce}`,
    roots,
    endpoints: SERVICE_NAMES.map((service) => ({
      service,
      origin: options.fixtureOrigin,
    })),
    networkMode: "fixture",
    integrations: {
      updater: "disabled",
      steamDiscovery: "fixture",
      gameLaunch: "record",
      presence: "disabled",
      ingestion: "disabled",
      matchSync: "disabled",
    },
    ui: { language: "en", width: 1280, height: 800 },
    control: { endpoint: `${options.fixtureOrigin}/__control`, tokenFile },
  };
  const configPath = path.join(directory, "e2e-config.json");
  await writeFile(configPath, JSON.stringify(configuration, null, 2));

  const manifestPath = path.join(directory, "world-manifest.json");
  const manifest: WorldManifest = {
    schemaVersion: 1,
    owner: "dmm-e2e-harness",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    processId: process.pid,
    configuration,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return {
    directory,
    configPath,
    manifestPath,
    artifactsDirectory,
    configuration,
  };
};

export const assertOwnedWorld = async (
  directory: string,
): Promise<WorldManifest> => {
  const resolved = path.resolve(directory);
  const relative = path.relative(path.resolve(WORLDS_ROOT), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to manage world outside ${WORLDS_ROOT}`);
  }
  const manifestText = await readFile(
    path.join(resolved, "world-manifest.json"),
    "utf8",
  );
  let manifest: WorldManifest;
  try {
    manifest = worldManifestSchema.parse(JSON.parse(manifestText));
  } catch {
    throw new Error(`Refusing to manage unowned E2E world ${resolved}`);
  }
  if (
    manifest.owner !== "dmm-e2e-harness" ||
    manifest.configuration.roots.world !== resolved
  ) {
    throw new Error(`Refusing to manage unowned E2E world ${resolved}`);
  }
  return manifest;
};

export const removeOwnedWorld = async (directory: string): Promise<void> => {
  await assertOwnedWorld(directory);
  await rm(path.resolve(directory), {
    recursive: true,
    force: false,
    maxRetries: 20,
    retryDelay: 250,
  });
};

export const collectFileInventory = async (
  root: string,
): Promise<Record<string, string>> => {
  const inventory: Record<string, string> = {};
  const isMissingEntry = (error: Error): boolean =>
    "code" in error && error.code === "ENOENT";
  const visit = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && isMissingEntry(error)) return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        try {
          const metadata = await stat(absolute);
          const hash = createHash("sha256");
          await pipeline(createReadStream(absolute), hash);
          const digest = hash.digest("hex");
          inventory[path.relative(root, absolute).replaceAll("\\", "/")] =
            `${metadata.size}:${digest}`;
        } catch (error) {
          if (error instanceof Error && isMissingEntry(error)) continue;
          throw error;
        }
      }
    }
  };
  await visit(root);
  return inventory;
};
