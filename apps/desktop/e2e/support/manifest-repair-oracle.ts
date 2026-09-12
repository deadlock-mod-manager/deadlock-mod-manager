import { readPersistedDocument } from "./observations";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ALPHA, ALPHA_MODS, BETA, BETA_MODS } from "./profile-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const modSchema = z.object({
  remoteId: z.string(),
  status: z.string(),
  installOrder: z.number().optional(),
  installedVpks: z.array(z.string()).optional(),
});
const inventorySchema = z.record(z.string(), z.string());
const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({ enabled: z.boolean(), currentVpks: z.array(z.string()) }),
  ),
});

export type RepairState = {
  localMods: z.infer<typeof modSchema>[];
  alphaMods: z.infer<typeof modSchema>[];
  enabledMods: Record<string, { enabled: boolean }>;
};

export const readRepairState = async (world: string): Promise<RepairState> => {
  const state = z
    .object({
      state: z.object({
        activeProfileId: z.string(),
        localMods: z.array(modSchema),
        profiles: z.record(
          z.string(),
          z.object({
            mods: z.array(modSchema),
            enabledMods: z.record(
              z.string(),
              z.object({ enabled: z.boolean() }),
            ),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state;
  assert.equal(state.activeProfileId, ALPHA.id);
  return {
    localMods: state.localMods,
    alphaMods: state.profiles[ALPHA.id].mods,
    enabledMods: state.profiles[ALPHA.id].enabledMods,
  };
};

/** Every Alpha mod mirrors the manifest again, in both copies of the library. */
export const isRepaired = (state: RepairState): boolean =>
  [state.localMods, state.alphaMods].every(
    (mods) =>
      mods.length === ALPHA_MODS.length &&
      mods.every(
        (mod) =>
          mod.status === "installed" && (mod.installedVpks?.length ?? 0) > 0,
      ),
  );

const addonsDirectory = (root: string, folder: string) =>
  path.join(root, "game", "citadel", "addons", folder);

/**
 * The repair may only rewrite the store: the manifest owns the files, so every
 * installed byte - and the untouched second profile - has to stay as seeded.
 */
export const assertRepairDisk = async (
  world: string,
  step: string,
): Promise<void> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readRepairState(world);
  const alpha = addonsDirectory(roots.game, ALPHA.folder);
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(alpha, ".dmm.json"), "utf8")),
  );
  const inventories = {
    alpha: await collectFileInventory(alpha),
    beta: await collectFileInventory(addonsDirectory(roots.game, BETA.folder)),
  };
  await writeFile(
    path.join(world, "artifacts", `manifest-repair-${step}.json`),
    JSON.stringify({ step, state, manifest, inventories }, null, 2),
  );

  const initial = z
    .object({ alpha: inventorySchema, beta: inventorySchema })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", "profiles-initial.json"),
          "utf8",
        ),
      ),
    );
  assert.deepEqual(inventories.alpha, initial.alpha, `${step}: Alpha files`);
  assert.deepEqual(inventories.beta, initial.beta, `${step}: Beta files`);

  for (const mods of [state.localMods, state.alphaMods]) {
    assert.deepEqual(
      mods.map((mod) => mod.remoteId),
      ALPHA_MODS,
      `${step}: library membership`,
    );
    for (const mod of mods) {
      const entry = manifest.mods[mod.remoteId];
      assert.ok(entry?.enabled, `${step}: ${mod.remoteId} enabled in manifest`);
      assert.equal(mod.status, "installed", `${step}: ${mod.remoteId} status`);
      assert.deepEqual(
        mod.installedVpks,
        entry.currentVpks,
        `${step}: ${mod.remoteId} installed VPKs`,
      );
    }
  }
  assert.deepEqual(
    Object.entries(state.enabledMods)
      .filter(([, entry]) => entry.enabled)
      .map(([remoteId]) => remoteId)
      .sort(),
    [...ALPHA_MODS].sort(),
    `${step}: enabled mods`,
  );
  assert.deepEqual(
    Object.keys(manifest.mods).sort(),
    [...ALPHA_MODS].sort(),
    `${step}: manifest membership`,
  );
  assert.ok(
    BETA_MODS.every((modId) => !(modId in manifest.mods)),
    `${step}: Beta stays out of Alpha's manifest`,
  );
};
