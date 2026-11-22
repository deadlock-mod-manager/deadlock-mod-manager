import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { filePayload, MULTI, SOLO } from "./file-order-fixtures";
import { fingerprint, readPersistedDocument } from "./observations";
import { ALPHA } from "./profile-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const manifestSchema = z.object({
  version: z.literal(3),
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      order: z.number(),
      shard: z.number(),
      currentVpks: z.array(z.string()),
      disabledVpks: z.array(z.string()),
      originalVpkNames: z.array(z.string()),
    }),
  ),
});
const storedModSchema = z.object({
  remoteId: z.string(),
  status: z.string(),
  installOrder: z.number(),
  installedVpks: z.array(z.string()),
  installedFileTree: z
    .object({ files: z.array(z.object({ name: z.string() })) })
    .nullish(),
});
export const readFileOrderStore = async (world: string) =>
  z
    .object({
      state: z.object({
        localMods: z.array(storedModSchema),
        profiles: z.record(
          z.string(),
          z.object({
            mods: z.array(storedModSchema),
            enabledMods: z.record(
              z.string(),
              z.object({ enabled: z.boolean() }),
            ),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state;

const pakNumber = (filename: string) =>
  Number(/^pak(\d+)_dir\.vpk$/.exec(filename)?.[1] ?? Number.NaN);

/**
 * Checks that every enabled VPK holds the bytes of the file the manifest says
 * it is, that the engine sees the files in `engineOrder`, and that the
 * library records the same files and file order.
 */
export const assertFileOrderDisk = async (
  world: string,
  step: string,
  engineOrder: string[],
) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const directory = path.join(
    roots.game,
    "game",
    "citadel",
    "addons",
    ALPHA.folder,
  );
  const inventory = await collectFileInventory(directory);
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
  );
  assert.deepEqual(Object.keys(manifest.mods).sort(), [MULTI.id, SOLO.id]);

  const owners = new Map<string, string>();
  for (const [modId, entry] of Object.entries(manifest.mods)) {
    assert.equal(entry.enabled, true, `${modId} must be enabled`);
    assert.equal(entry.shard, 1);
    assert.deepEqual(entry.disabledVpks, []);
    assert.equal(entry.currentVpks.length, entry.originalVpkNames.length);
    for (const [index, vpk] of entry.currentVpks.entries()) {
      const name = entry.originalVpkNames[index];
      assert.equal(
        inventory[vpk],
        fingerprint(filePayload(name)),
        `${vpk} must hold ${name}`,
      );
      owners.set(vpk, name);
    }
  }
  assert.deepEqual(
    Object.keys(inventory).sort(),
    [".dmm.json", "protected.txt", ...owners.keys()].sort(),
  );
  assert.deepEqual(
    [...owners.keys()]
      .sort((a, b) => pakNumber(a) - pakNumber(b))
      .map((vpk) => owners.get(vpk)),
    engineOrder,
  );

  const state = await readFileOrderStore(world);
  const multiFiles = engineOrder.filter((name) => MULTI.files.includes(name));
  for (const mods of [state.localMods, state.profiles[ALPHA.id].mods]) {
    assert.deepEqual(mods.map((mod) => mod.remoteId).sort(), [
      MULTI.id,
      SOLO.id,
    ]);
    for (const mod of mods) {
      const entry = manifest.mods[mod.remoteId];
      assert.equal(mod.status, "installed");
      assert.equal(mod.installOrder, entry.order);
      assert.deepEqual(mod.installedVpks, entry.currentVpks);
    }
    assert.deepEqual(
      mods
        .find((mod) => mod.remoteId === MULTI.id)
        ?.installedFileTree?.files.map((file) => file.name),
      multiFiles,
    );
  }
  assert.deepEqual(
    Object.values(state.profiles[ALPHA.id].enabledMods).map(
      (mod) => mod.enabled,
    ),
    [true, true],
  );
  await writeFile(
    path.join(world, "artifacts", `file-order-${step}.json`),
    JSON.stringify({ state, manifest, inventory }, null, 2),
  );
  return inventory;
};
