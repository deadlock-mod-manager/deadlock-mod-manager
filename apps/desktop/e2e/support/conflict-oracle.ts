import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CONFLICTS, conflictPayload } from "./conflict-fixtures";
import { fingerprint } from "./observations";
import { readProfileState } from "./profile-oracle";
import { assertOwnedWorld, collectFileInventory } from "./world";

const IGNORES_FILE = ".dmm-conflicts.json";

const ignoresSchema = z.object({
  pairs: z.array(z.string()),
  pairFiles: z.record(z.string(), z.array(z.string())),
  mods: z.array(z.string()),
});

export const pairKey = (a: string, b: string): string =>
  a <= b ? `${a}::${b}` : `${b}::${a}`;

/**
 * Checks that the profile holds exactly `order` (first loads first) with each
 * mod's own bytes in its pak slot, and that the persisted ignores match.
 * `ignoredPairs: null` means no ignore file was ever written.
 */
export const assertConflictDisk = async (
  world: string,
  step: string,
  order: readonly string[],
  ignoredPairs: readonly string[] | null,
): Promise<void> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const directory = path.join(
    roots.game,
    "game",
    "citadel",
    "addons",
    CONFLICTS.folder,
  );
  const inventory = await collectFileInventory(directory);
  const slots = order.map(
    (_, index) => `pak${String(index + 1).padStart(2, "0")}_dir.vpk`,
  );
  assert.deepEqual(
    Object.keys(inventory).sort(),
    [
      ".dmm.json",
      "protected.txt",
      ...slots,
      ...(ignoredPairs === null ? [] : [IGNORES_FILE]),
    ].sort(),
  );

  const manifest = z
    .object({
      mods: z.record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          order: z.number(),
          currentVpks: z.array(z.string()),
        }),
      ),
    })
    .parse(
      JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
    );
  const state = await readProfileState(world);
  assert.equal(state.activeProfileId, CONFLICTS.id);
  assert.deepEqual(
    state.localMods
      .toSorted((a, b) => a.installOrder - b.installOrder)
      .map((mod) => [mod.remoteId, mod.installedVpks]),
    order.map((modId, index) => [modId, [slots[index]]]),
  );
  for (const [index, modId] of order.entries()) {
    assert.deepEqual(manifest.mods[modId], {
      enabled: true,
      order: index,
      currentVpks: [slots[index]],
    });
    assert.equal(
      inventory[slots[index]],
      fingerprint(conflictPayload(modId)),
      `Wrong bytes in ${slots[index]} for ${modId}`,
    );
  }

  let ignores: z.infer<typeof ignoresSchema> | null = null;
  if (ignoredPairs !== null) {
    ignores = ignoresSchema.parse(
      JSON.parse(await readFile(path.join(directory, IGNORES_FILE), "utf8")),
    );
    assert.deepEqual(ignores, {
      pairs: [...ignoredPairs].sort(),
      pairFiles: {},
      mods: [],
    });
  }

  await writeFile(
    path.join(world, "artifacts", `conflicts-${step}.json`),
    JSON.stringify({ state, manifest, inventory, ignores }, null, 2),
  );
};
