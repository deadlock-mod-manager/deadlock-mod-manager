import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ModStatus, type LocalMod } from "../../src/types/mods";
import type { FixtureRequest } from "./fixture-server";
import { fixtureMod } from "./mod-fixtures";
import { readPersistedDocument } from "./observations";
import { CHOICES } from "./reinstall-choices-fixtures";
import { buildSyntheticVpk } from "./vpk";
import {
  assertOwnedWorld,
  collectFileInventory,
  type CreatedWorld,
} from "./world";

export const PREPARATION_MOD = "local-00000000-0000-4000-8000-000000000006";
export const PREPARATION_NAME = "E2E Preparation Failure";
const SOURCES = ["base.vpk", "effects.vpk"];

export const prepareInstallPreparationFailureWorld = async (
  world: CreatedWorld,
): Promise<void> => {
  const { roots } = world.configuration;
  const storedFiles = path.join(
    roots.appData,
    "mods",
    PREPARATION_MOD,
    "files",
  );
  await mkdir(storedFiles, { recursive: true });
  const files = [];
  for (const name of SOURCES) {
    const payload = buildSyntheticVpk([
      { path: `scripts/${name}.txt`, contents: `Retained source ${name}\n` },
    ]);
    await writeFile(path.join(storedFiles, name), payload);
    files.push({
      name,
      path: name,
      size: payload.length,
      is_selected: true,
      archive_name: `${name}.zip`,
    });
  }
  // Retained import sources make install_mod capable of installing if the
  // frontend ignores preparation's missing archive. They are not archives or
  // extracted files, and there are no prefixed VPKs for preparation to reuse.
  const mod: LocalMod = {
    ...fixtureMod(PREPARATION_MOD, 0),
    name: PREPARATION_NAME,
    status: ModStatus.Downloaded,
    installedVpks: [],
    installedFileTree: {
      files,
      total_files: files.length,
      has_multiple_files: true,
    },
  };
  const persisted = z
    .object({
      state: z.record(z.string(), z.json()),
      version: z.number(),
    })
    .parse(await readPersistedDocument(world.directory));
  await writeFile(
    path.join(roots.appData, "state.json"),
    JSON.stringify({
      "local-config": JSON.stringify({
        ...persisted,
        state: {
          ...persisted.state,
          autoUpdateEnabled: false,
          autoFixMods: false,
          activeProfileId: "default",
          localMods: [mod],
          profiles: {
            default: {
              id: "default",
              name: "Default Profile",
              folderName: null,
              isDefault: true,
              createdAt: new Date(0),
              mods: [mod],
              enabledMods: {
                [PREPARATION_MOD]: {
                  remoteId: PREPARATION_MOD,
                  enabled: false,
                  lastModified: new Date(0),
                },
              },
            },
          },
        },
      }),
    }),
  );
  await writeFile(
    path.join(roots.game, "game", "citadel", "addons", ".dmm.json"),
    JSON.stringify({ version: 3, mods: {} }, null, 2),
  );
};

export const assertNoInstallFailureDownloads = (
  _id: string,
  requests: readonly FixtureRequest[],
): void => {
  assert.deepEqual(
    requests.filter((request) =>
      /^\/(?:dl|downloads|mirror)\//.test(
        new URL(request.url, "http://fixture").pathname,
      ),
    ),
    [],
    "A failed preparation or purge must not start a download",
  );
};

export const readNukePurgeFailureSnapshot = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const { state } = z
    .object({
      state: z.object({
        activeProfileId: z.string(),
        localMods: z.array(
          z.looseObject({
            remoteId: z.string(),
            detectedContent: z.string().optional(),
            detectedHero: z.string().nullable().optional(),
          }),
        ),
        profiles: z.record(z.string(), z.json()),
      }),
    })
    .parse(await readPersistedDocument(world));
  return {
    state,
    addons: await collectFileInventory(
      path.join(roots.game, "game", "citadel", "addons", CHOICES.folder),
    ),
    cache: await collectFileInventory(path.join(roots.appData, "mods")),
  };
};

export const readInstallPreparationFailureSnapshot = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const { state } = z
    .object({
      state: z.object({
        localMods: z.array(
          z.object({
            remoteId: z.string(),
            status: z.string(),
            installedVpks: z.array(z.string()).optional(),
            installedFileTree: z.json().optional(),
          }),
        ),
        profiles: z.record(
          z.string(),
          z.object({
            mods: z.array(
              z.object({ remoteId: z.string(), status: z.string() }),
            ),
            enabledMods: z.record(
              z.string(),
              z.object({ enabled: z.boolean() }),
            ),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world));
  const addons = path.join(roots.game, "game", "citadel", "addons");
  return {
    state,
    addons: await collectFileInventory(addons),
    manifest: await readFile(path.join(addons, ".dmm.json"), "utf8"),
    cache: await collectFileInventory(path.join(roots.appData, "mods")),
  };
};

export const assertInstallPreparationFailed = (
  before: Awaited<ReturnType<typeof readInstallPreparationFailureSnapshot>>,
  after: Awaited<ReturnType<typeof readInstallPreparationFailureSnapshot>>,
): void => {
  assert.deepEqual(
    after,
    before,
    "Failed preparation changed state or mod files",
  );
  assert.deepEqual(Object.keys(after.addons), [".dmm.json"]);
  assert.equal(after.state.localMods[0]?.status, "downloaded");
  assert.deepEqual(after.state.localMods[0]?.installedVpks, []);
  assert.equal(
    after.state.profiles.default.enabledMods[PREPARATION_MOD]?.enabled ?? false,
    false,
  );
};
