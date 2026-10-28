import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readCatalogState } from "./gamebanana-oracle";
import { fingerprint } from "./observations";
import {
  RENAMED_MODS,
  renamedVpk,
  type RenamedVersion,
} from "./renamed-packs-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      currentVpks: z.array(z.string()),
      originalVpkNames: z.array(z.string()),
    }),
  ),
});

/** VPK names each mod should have enabled, and the version they come from. */
export type RenamedExpectation = Record<
  string,
  { version: RenamedVersion; vpks: readonly string[] }
>;

export const assertRenamedPacksDisk = async (
  world: string,
  checkpoint: string,
  expected: RenamedExpectation,
) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const addons = path.join(roots.game, "game", "citadel", "addons");
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(addons, ".dmm.json"), "utf8")),
  );
  const inventory = await collectFileInventory(addons);
  const state = await readCatalogState(world);
  const failures: string[] = [];
  for (const mod of RENAMED_MODS) {
    const { version, vpks } = expected[mod.id];
    const entry = manifest.mods[mod.id];
    const local = state.localMods.find((item) => item.remoteId === mod.id);
    try {
      assert(entry, "missing manifest entry");
      assert.equal(entry.enabled, true);
      assert.deepEqual(
        Object.fromEntries(
          entry.originalVpkNames.map((name, index) => [
            name,
            inventory[entry.currentVpks[index]] ?? null,
          ]),
        ),
        Object.fromEntries(
          vpks.map((name) => [
            name,
            fingerprint(renamedVpk(mod.id, version, name)),
          ]),
        ),
      );
      assert(local, "missing library entry");
      assert.equal(local.status, "installed");
      assert.deepEqual(local.installedVpks, entry.currentVpks);
      const files = local.installedFileTree?.files ?? [];
      assert.deepEqual(
        files
          .filter((file) => file.is_selected)
          .map((file) => file.name)
          .sort(),
        vpks.toSorted(),
      );
      // The stored tree names the archives just installed, so the next update
      // matches them directly.
      assert.deepEqual(
        [...new Set(files.map((file) => file.archive_name))].sort(),
        mod.files.map((file) => file.archive[version]).sort(),
      );
    } catch (error) {
      failures.push(
        `${mod.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  await writeFile(
    path.join(world, "artifacts", `renamed-packs-${checkpoint}.json`),
    JSON.stringify({ expected, state, manifest, inventory, failures }, null, 2),
  );
  assert.equal(
    failures.length,
    0,
    `Renamed packs failed at ${checkpoint}\n${failures.join("\n")}`,
  );
};
