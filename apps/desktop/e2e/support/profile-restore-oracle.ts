import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { catalogVpk } from "./gamebanana-fixtures";
import { fixtureGamePaths } from "./gameinfo-mounts";
import {
  fingerprint,
  inventorySchema,
  readPersistedDocument,
} from "./observations";
import { ALPHA, BETA } from "./profile-fixtures";
import {
  OLD_VARIANT_FILES,
  REPLACED_MOD_ID,
  RESTORE_BACKUP_ID,
} from "./profile-restore-fixtures";
import { SHARE_MODS, SHARED_LOAD_ORDER } from "./profile-share-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const modSchema = z.looseObject({
  remoteId: z.string(),
  status: z.string(),
  installedVpks: z.array(z.string()),
  selectedDownloads: z.array(z.looseObject({ name: z.string() })).optional(),
  installedFileTree: z
    .looseObject({
      files: z.array(
        z.looseObject({ name: z.string(), is_selected: z.boolean() }),
      ),
    })
    .optional(),
});
export const readRestoreState = async (world: string) =>
  z
    .object({
      state: z.looseObject({
        activeProfileId: z.string(),
        localMods: z.array(modSchema),
        profiles: z.record(
          z.string(),
          z.looseObject({
            mods: z.array(modSchema),
            enabledMods: z.record(
              z.string(),
              z.looseObject({ enabled: z.boolean() }),
            ),
          }),
        ),
        cloudBackupLinks: z.record(
          z.string(),
          z.object({ backupId: z.string(), revision: z.number() }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state;

export const assertPreviousVariant = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const inventory = await collectFileInventory(
    path.join(roots.game, "game/citadel/addons", ALPHA.folder),
  );
  assert.equal(
    inventory["pak01_dir.vpk"],
    fingerprint(catalogVpk(OLD_VARIANT_FILES[0])),
  );
  assert.equal(
    inventory["pak02_dir.vpk"],
    fingerprint(catalogVpk(OLD_VARIANT_FILES[1])),
  );
  assert.equal(
    inventory[`${REPLACED_MOD_ID}_charlie-alt.vpk`],
    fingerprint(catalogVpk("charlie-alt.vpk")),
  );
};

export const assertRestoredVariant = async (world: string, label: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readRestoreState(world);
  assert.equal(state.activeProfileId, ALPHA.id);
  assert.deepEqual(
    Object.keys(state.profiles).sort(),
    ["default", ALPHA.id, BETA.id].sort(),
    "Replace keeps the existing profiles",
  );
  assert.deepEqual(state.cloudBackupLinks[ALPHA.id], {
    backupId: RESTORE_BACKUP_ID,
    revision: 1,
  });
  const folder = path.join(roots.game, "game/citadel/addons", ALPHA.folder);
  const manifest = z
    .object({
      mods: z.record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          shard: z.number(),
          order: z.number(),
          currentVpks: z.array(z.string()),
          disabledVpks: z.array(z.string()),
          originalVpkNames: z.array(z.string()),
        }),
      ),
    })
    .parse(JSON.parse(await readFile(path.join(folder, ".dmm.json"), "utf8")));
  assert.deepEqual(
    Object.keys(manifest.mods).sort(),
    SHARE_MODS.map((mod) => mod.id).sort(),
  );
  const expectedVpks: Record<string, string> = {};
  for (const [index, id] of SHARED_LOAD_ORDER.entries()) {
    const mod = SHARE_MODS.find((entry) => entry.id === id);
    assert.ok(mod);
    const selected = mod.archives.filter((archive) => archive.shared);
    const names = [`pak${String(index + 1).padStart(2, "0")}_dir.vpk`];
    assert.deepEqual(manifest.mods[id], {
      enabled: true,
      shard: 1,
      order: index,
      currentVpks: names,
      disabledVpks: [],
      originalVpkNames: selected.map((archive) => archive.vpk),
    });
    for (const mods of [state.localMods, state.profiles[ALPHA.id].mods]) {
      const installed = mods.find((entry) => entry.remoteId === id);
      assert.ok(installed);
      assert.equal(installed.status, "installed");
      assert.deepEqual(
        installed.installedVpks,
        names,
        "Frontend filenames match the final reordered manifest",
      );
      assert.deepEqual(
        installed.selectedDownloads?.map((download) => download.name),
        selected.map((archive) => archive.name),
      );
      assert.deepEqual(
        installed.installedFileTree?.files
          .filter((file) => file.is_selected)
          .map((file) => file.name),
        selected.map((archive) => archive.vpk),
      );
    }
    assert.equal(state.profiles[ALPHA.id].enabledMods[id]?.enabled, true);
    expectedVpks[names[0]] = fingerprint(catalogVpk(selected[0].vpk));
  }
  const inventory = await collectFileInventory(folder);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(inventory).filter(([name]) => name.endsWith(".vpk")),
    ),
    expectedVpks,
    "Only the backup's VPK bytes remain; old and parked variants are gone",
  );
  assert.equal(
    inventory["protected.txt"],
    fingerprint(Buffer.from(`Protected ${ALPHA.name}\n`)),
  );
  const other = await collectFileInventory(
    path.join(roots.game, "game/citadel/addons", BETA.folder),
  );
  const originalOther = inventorySchema.parse(
    JSON.parse(
      await readFile(
        path.join(world, "artifacts/restore-beta-initial.json"),
        "utf8",
      ),
    ),
  );
  assert.deepEqual(
    other,
    originalOther,
    "The inactive profile remains byte-identical",
  );
  const mounts = fixtureGamePaths(
    await readFile(path.join(roots.game, "game/citadel/gameinfo.gi"), "utf8"),
  );
  assert.ok(mounts.includes(`citadel/addons/${ALPHA.folder}`));
  assert.ok(!mounts.includes(`citadel/addons/${BETA.folder}`));
  await writeFile(
    path.join(world, "artifacts", `restore-variant-${label}.json`),
    JSON.stringify({ state, manifest, inventory, other, mounts }, null, 2),
  );
};
