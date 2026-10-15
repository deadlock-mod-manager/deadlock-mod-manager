import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fingerprint, inventorySchema } from "./observations";
import { readRepairState } from "./manifest-repair-oracle";
import { ALPHA } from "./profile-fixtures";
import {
  REPAIR_CORRUPT_MANIFEST,
  REPAIR_LOCAL,
  REPAIR_MODS,
  REPAIR_UNTRACKED,
} from "./mod-folder-repair-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const diskName = (file: string) =>
  file.startsWith("addons2/")
    ? `addons2/${ALPHA.folder}/${path.basename(file)}`
    : `addons/${ALPHA.folder}/${file}`;

const entrySchema = z.object({
  enabled: z.boolean(),
  shard: z.number(),
  currentVpks: z.array(z.string()),
  disabledVpks: z.array(z.string()),
});
export const assertModFolderRepairPreview = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const citadel = path.join(roots.game, "game", "citadel");
  const initial = inventorySchema.parse(
    JSON.parse(
      await readFile(
        path.join(world, "artifacts", "mod-folder-repair-initial.json"),
        "utf8",
      ),
    ),
  );
  const current = await collectFileInventory(citadel);
  for (const [file, hash] of Object.entries(initial)) {
    if (file.startsWith("addons"))
      assert.equal(current[file], hash, `Preview changed ${file}`);
  }
  assert.deepEqual(
    await collectFileInventory(path.join(roots.appData, "mod-folder-repair")),
    {},
  );
};

export const assertModFolderRepair = async (
  world: string,
  label: string,
  restored = false,
) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const citadel = path.join(roots.game, "game", "citadel");
  const base = path.join(citadel, "addons", ALPHA.folder);
  const initial = inventorySchema.parse(
    JSON.parse(
      await readFile(
        path.join(world, "artifacts", "mod-folder-repair-initial.json"),
        "utf8",
      ),
    ),
  );
  const disk = await collectFileInventory(citadel);
  const manifest = z
    .object({ version: z.literal(3), mods: z.record(z.string(), entrySchema) })
    .parse(JSON.parse(await readFile(path.join(base, ".dmm.json"), "utf8")));
  const state = await readRepairState(world);
  const backupRoot = path.join(roots.appData, "mod-folder-repair");
  const backups = (await readdir(backupRoot)).filter((name) =>
    name.startsWith("addons-backup-repair-"),
  );
  assert.equal(backups.length, 1, `${label}: one restorable repair backup`);
  const backup = await collectFileInventory(path.join(backupRoot, backups[0]));
  const index = z
    .object({
      profileFolder: z.literal(ALPHA.folder),
      files: z.array(z.string()),
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(backupRoot, backups[0], "repair.json"),
          "utf8",
        ),
      ),
    );
  assert.deepEqual(index.files.toSorted(), REPAIR_UNTRACKED.toSorted());
  for (const file of REPAIR_UNTRACKED) {
    assert.equal(
      backup[`files/${file}`],
      initial[diskName(file)],
      `${label}: recoverable ${file}`,
    );
    assert.equal(
      disk[diskName(file)],
      restored ? initial[diskName(file)] : undefined,
      `${label}: untracked ${file}`,
    );
  }
  const excluded = new Set([
    `addons/${ALPHA.folder}/.dmm.json`,
    ...REPAIR_UNTRACKED.map(diskName),
  ]);
  if (label !== "applied") {
    excluded.add("gameinfo.gi");
    assert.equal(disk["gameinfo.gi.bak"], initial["gameinfo.gi"]);
  }
  for (const [file, hash] of Object.entries(initial)) {
    if (excluded.has(file) || file.includes("/.dmm-reorder/")) continue;
    assert.equal(disk[file], hash, `${label}: untouched ${file}`);
  }
  assert.equal(disk[diskName(REPAIR_LOCAL)], initial[diskName(REPAIR_LOCAL)]);
  const folders = await readdir(base);
  const corrupt = folders.filter((name) =>
    name.startsWith(".dmm.json.corrupt-"),
  );
  assert.equal(corrupt.length, 1);
  assert.equal(
    await readFile(path.join(base, corrupt[0]), "utf8"),
    REPAIR_CORRUPT_MANIFEST,
  );
  assert(!folders.includes(".dmm-reorder"));
  const quarantined = folders.filter((name) =>
    name.startsWith(".dmm-recovered-"),
  );
  assert.equal(quarantined.length, 1);
  for (const file of [".transaction.jsonl", "s1__pak04_dir.vpk.pending"]) {
    assert.equal(
      disk[`addons/${ALPHA.folder}/${quarantined[0]}/${file}`],
      initial[`addons/${ALPHA.folder}/.dmm-reorder/${file}`],
    );
  }
  assert.deepEqual(Object.keys(manifest.mods).sort(), [...REPAIR_MODS].sort());
  for (const mods of [state.localMods, state.alphaMods]) {
    assert.deepEqual(
      mods.map((mod) => mod.remoteId).sort(),
      [...REPAIR_MODS].sort(),
    );
    for (const mod of mods) {
      const entry = manifest.mods[mod.remoteId];
      const enabled = mod.remoteId !== REPAIR_MODS[2];
      assert.equal(entry.enabled, enabled);
      assert.equal(mod.status, enabled ? "installed" : "downloaded");
      assert.deepEqual(
        mod.installedVpks ?? [],
        enabled ? entry.currentVpks : [],
      );
      assert.equal(state.enabledMods[mod.remoteId]?.enabled ?? false, enabled);
      const names = enabled ? entry.currentVpks : entry.disabledVpks;
      for (const name of names)
        assert.ok(disk[`addons/${ALPHA.folder}/${name}`]);
    }
  }
  const expectedVpks = [
    ...Object.values(manifest.mods).flatMap((entry) =>
      entry.enabled ? entry.currentVpks : entry.disabledVpks,
    ),
    ...(restored ? REPAIR_UNTRACKED.filter((name) => !name.includes("/")) : []),
  ].sort();
  assert.deepEqual(
    Object.keys(disk)
      .filter(
        (name) =>
          name.startsWith(`addons/${ALPHA.folder}/`) &&
          !name.slice(`addons/${ALPHA.folder}/`.length).includes("/") &&
          name.endsWith(".vpk"),
      )
      .map((name) => path.basename(name))
      .sort(),
    expectedVpks,
  );
  assert.equal(
    disk[`addons/${ALPHA.folder}/${corrupt[0]}`],
    fingerprint(Buffer.from(REPAIR_CORRUPT_MANIFEST)),
  );
  await writeFile(
    path.join(world, "artifacts", `mod-folder-repair-${label}.json`),
    JSON.stringify({ state, manifest, disk, backup }, null, 2),
  );
  return backups[0];
};
