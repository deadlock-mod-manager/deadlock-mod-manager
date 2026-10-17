import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { brokenProfileDirectory } from "./broken-state-fixtures";
import { catalogVpk, CATALOG_MOD_ID } from "./gamebanana-fixtures";
import {
  fingerprint,
  inventorySchema,
  readPersistedDocument,
} from "./observations";
import { ALPHA, ALPHA_MODS, BETA, profilePayload } from "./profile-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const modSchema = z.object({
  remoteId: z.string(),
  status: z.string(),
  installedVpks: z.array(z.string()).default([]),
  missingVpks: z.array(z.string()).default([]),
});
const profileSchema = z.object({
  mods: z.array(modSchema),
  enabledMods: z.record(z.string(), z.object({ enabled: z.boolean() })),
});
const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      currentVpks: z.array(z.string()),
      disabledVpks: z.array(z.string()),
    }),
  ),
});
const optionalText = async (file: string) => {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
};
export const readBrokenLaunches = async (world: string) =>
  (
    (await optionalText(
      path.join(world, "artifacts", "game-launches.ndjson"),
    )) ?? ""
  )
    .split("\n")
    .filter(Boolean)
    .map((line) =>
      z
        .object({ program: z.string(), uri: z.string() })
        .parse(JSON.parse(line)),
    );

export const readBrokenState = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = z
    .object({
      state: z.object({
        activeProfileId: z.string(),
        localMods: z.array(modSchema),
        profiles: z.record(z.string(), profileSchema),
      }),
    })
    .parse(await readPersistedDocument(world)).state;
  assert.equal(state.activeProfileId, ALPHA.id);
  const text = await optionalText(
    path.join(brokenProfileDirectory(roots.game), ".dmm.json"),
  );
  return {
    state,
    manifest: text === null ? null : manifestSchema.parse(JSON.parse(text)),
    disk: await collectFileInventory(brokenProfileDirectory(roots.game)),
    beta: await collectFileInventory(
      path.join(roots.game, "game", "citadel", "addons", BETA.folder),
    ),
    modsStore: await collectFileInventory(path.join(roots.appData, "mods")),
    steam: await collectFileInventory(roots.steam),
    gameinfo: await readFile(
      path.join(roots.game, "game", "citadel", "gameinfo.gi"),
      "utf8",
    ),
    launches: await readBrokenLaunches(world),
  };
};
export type BrokenState = Awaited<ReturnType<typeof readBrokenState>>;

export const captureBrokenState = async (
  world: string,
  label: string,
  ui?: string,
) => {
  const observation = await readBrokenState(world);
  await writeFile(
    path.join(world, "artifacts", `broken-state-${label}.json`),
    JSON.stringify({ observation, ui }, null, 2),
  );
  return observation;
};

export const assertUntouchedBrokenNeighbours = async (
  world: string,
  observation: BrokenState,
) => {
  const initial = z
    .object({ beta: inventorySchema })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", "profiles-initial.json"),
          "utf8",
        ),
      ),
    );
  const before = z
    .object({ steam: inventorySchema })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", "files-before.json"),
          "utf8",
        ),
      ),
    );
  assert.deepEqual(
    observation.beta,
    initial.beta,
    "Inactive Beta profile changed",
  );
  assert.deepEqual(observation.steam, before.steam, "Steam files changed");
};

export const assertReinstalledBrokenState = (observation: BrokenState) => {
  const { state, manifest, disk } = observation;
  assert.deepEqual(
    state.localMods.map((mod) => mod.remoteId),
    [CATALOG_MOD_ID],
  );
  assert.deepEqual(state.profiles[ALPHA.id].mods, state.localMods);
  assert.deepEqual(Object.keys(manifest?.mods ?? {}), [CATALOG_MOD_ID]);
  const mod = state.localMods[0];
  const entry = manifest?.mods[CATALOG_MOD_ID];
  assert(entry?.enabled);
  assert.equal(
    state.profiles[ALPHA.id].enabledMods[CATALOG_MOD_ID]?.enabled,
    true,
  );
  for (const modId of ALPHA_MODS)
    assert.notEqual(state.profiles[ALPHA.id].enabledMods[modId]?.enabled, true);
  assert.equal(mod.status, "installed");
  assert.deepEqual(mod.missingVpks, []);
  assert.deepEqual(mod.installedVpks, entry.currentVpks);
  assert.equal(entry.currentVpks.length, 1);
  assert.deepEqual(entry.disabledVpks, []);
  assert.deepEqual(
    Object.keys(disk).toSorted(),
    [".dmm.json", ...entry.currentVpks].toSorted(),
  );
  assert.equal(disk[entry.currentVpks[0]], fingerprint(catalogVpk("base.vpk")));
};

export const assertRemovedBrokenState = (observation: BrokenState) => {
  assert.deepEqual(observation.state.localMods, []);
  assert.deepEqual(observation.state.profiles[ALPHA.id].mods, []);
  assert.deepEqual(observation.state.profiles[ALPHA.id].enabledMods, {});
  assert.deepEqual(Object.keys(observation.manifest?.mods ?? {}), []);
  assert.deepEqual(
    Object.keys(observation.disk),
    observation.manifest === null ? [] : [".dmm.json"],
  );
  assert.deepEqual(observation.modsStore, {});
};

export const hasMissingEnabledFiles = (observation: BrokenState) =>
  Object.values(observation.manifest?.mods ?? {}).some(
    (entry) =>
      entry.enabled &&
      entry.currentVpks.some((file) => !observation.disk[file]),
  );

const assertBrokenLaunchMembership = (observation: BrokenState) => {
  assert.deepEqual(
    observation.state.localMods.map((mod) => mod.remoteId).toSorted(),
    ALPHA_MODS.toSorted(),
  );
  assert.deepEqual(
    observation.state.profiles[ALPHA.id].mods,
    observation.state.localMods,
  );
  assert.deepEqual(
    Object.keys(observation.manifest?.mods ?? {}).toSorted(),
    ALPHA_MODS.toSorted(),
  );
};

export const assertDisabledBrokenLaunchState = (observation: BrokenState) => {
  assertBrokenLaunchMembership(observation);
  for (const mod of observation.state.localMods) {
    const entry = observation.manifest?.mods[mod.remoteId];
    assert(entry);
    assert.equal(entry.enabled, false);
    assert.deepEqual(entry.currentVpks, []);
    assert.deepEqual(entry.disabledVpks, []);
    assert.equal(
      observation.state.profiles[ALPHA.id].enabledMods[mod.remoteId]?.enabled ??
        false,
      false,
    );
    assert.equal(mod.status, "downloaded");
    assert.deepEqual(mod.installedVpks, []);
  }
  assert.equal(hasMissingEnabledFiles(observation), false);
  assert.deepEqual(Object.keys(observation.disk).toSorted(), [
    ".dmm.json",
    "protected.txt",
  ]);
  assert.equal(
    observation.disk["protected.txt"],
    fingerprint(Buffer.from(`Protected ${ALPHA.name}\n`)),
  );
  assert.match(
    observation.gameinfo,
    new RegExp(`Game\\s+citadel/addons/${ALPHA.folder}`),
  );
  assert.doesNotMatch(observation.gameinfo, /Game\s+citadel\/addons[2-9]/);
  assert.equal(observation.launches.length, 1);
  assert.match(observation.launches[0].uri, /^steam:\/\/run\/1422450\//);
};

export const assertEnabledBrokenPayloads = (observation: BrokenState) => {
  assertBrokenLaunchMembership(observation);
  for (const mod of observation.state.localMods) {
    const entry = observation.manifest?.mods[mod.remoteId];
    assert(entry?.enabled);
    assert.equal(
      observation.state.profiles[ALPHA.id].enabledMods[mod.remoteId]?.enabled,
      true,
    );
    assert.equal(mod.status, "installed");
    assert.deepEqual(mod.installedVpks, entry.currentVpks);
    assert.deepEqual(mod.missingVpks, []);
    assert.equal(entry.currentVpks.length, 1);
    assert.equal(
      observation.disk[entry.currentVpks[0]],
      fingerprint(profilePayload(mod.remoteId)),
    );
  }
};
