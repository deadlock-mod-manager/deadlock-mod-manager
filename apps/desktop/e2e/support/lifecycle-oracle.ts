import { readPersistedDocument } from "./observations";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { assertOwnedWorld, collectFileInventory } from "./world";

const localModSchema = z.object({
  remoteId: z.string(),
  name: z.string(),
  status: z.string(),
  installedVpks: z.array(z.string()).optional(),
});
const stateSchema = z.object({
  state: z.object({
    localMods: z.array(localModSchema),
    activeProfileId: z.string(),
    profiles: z.record(
      z.string(),
      z.object({
        folderName: z.string().nullable(),
        enabledMods: z.record(z.string(), z.object({ enabled: z.boolean() })),
      }),
    ),
  }),
});
const manifestSchema = z.object({
  version: z.literal(3),
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      shard: z.number(),
      order: z.number().nullable(),
      currentVpks: z.array(z.string()),
      disabledVpks: z.array(z.string()),
      originalVpkNames: z.array(z.string()),
    }),
  ),
});

export const readLifecycleState = async (world: string) => {
  return stateSchema.parse(await readPersistedDocument(world)).state;
};

export const assertLifecycleDisk = async (
  world: string,
  step: string,
  modId: string,
  status: "downloaded" | "installed" | "deleted",
): Promise<void> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readLifecycleState(world);
  const mods = state.localMods;
  const enabled = status === "installed";
  const profile = state.profiles[state.activeProfileId];
  assert.ok(profile, "Active profile must exist");
  assert.equal(profile.folderName, null, "Lifecycle uses the default profile");
  const addons = path.join(roots.game, "game", "citadel", "addons");
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(addons, ".dmm.json"), "utf8")),
  );
  const inventory = await collectFileInventory(addons);
  const fixtureInventory = await collectFileInventory(
    path.join(world, "fixtures"),
  );
  const fixtureHash = fixtureInventory["e2e-local-mod.vpk"];
  assert.ok(fixtureHash);
  if (status === "deleted") {
    assert.deepEqual(mods, []);
    assert.deepEqual(manifest.mods, {});
    assert.deepEqual(Object.keys(inventory), [".dmm.json"]);
    assert.deepEqual(
      await collectFileInventory(path.join(roots.appData, "mods", modId)),
      {},
    );
    assert.equal(profile.enabledMods[modId], undefined);
  } else {
    assert.equal(mods.length, 1);
    const mod = mods[0];
    assert.equal(mod.remoteId, modId);
    assert.equal(mod.name, "e2e-local-mod");
    assert.equal(mod.status, status);
    assert.deepEqual(Object.keys(manifest.mods), [modId]);
    const entry = manifest.mods[modId];
    assert.equal(entry.enabled, enabled);
    assert.equal(entry.shard, 1);
    assert.deepEqual(entry.originalVpkNames, ["e2e-local-mod.vpk"]);
    const files = enabled ? entry.currentVpks : entry.disabledVpks;
    assert.equal(files.length, 1);
    assert.deepEqual(enabled ? entry.disabledVpks : entry.currentVpks, []);
    assert.deepEqual(
      Object.keys(inventory).sort(),
      [".dmm.json", ...files].sort(),
    );
    assert.equal(
      inventory[files[0]],
      fixtureHash,
      "Installed bytes must match the generated fixture",
    );
    if (enabled) {
      assert.deepEqual(mod.installedVpks, files);
      assert.equal(profile.enabledMods[modId]?.enabled, true);
    } else {
      assert.notEqual(profile.enabledMods[modId]?.enabled, true);
      assert.ok(files[0].startsWith(`${modId}_`));
    }
    const source = await collectFileInventory(
      path.join(roots.appData, "mods", modId, "files"),
    );
    assert.deepEqual(source, { "e2e-local-mod.vpk": fixtureHash });
  }
  assert.equal(
    await readFile(path.join(roots.game, "protected.txt"), "utf8"),
    "Never change this game file\n",
  );
  const before = z
    .object({ steam: z.record(z.string(), z.string()) })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", "files-before.json"),
          "utf8",
        ),
      ),
    );
  assert.deepEqual(await collectFileInventory(roots.steam), before.steam);
  await writeFile(
    path.join(world, "artifacts", `lifecycle-${step}.json`),
    JSON.stringify({ state, manifest, inventory }, null, 2),
  );
};
