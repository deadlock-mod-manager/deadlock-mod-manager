import { afterEach, expect, it } from "bun:test";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { catalogVpk } from "./gamebanana-fixtures";
import { readPersistedDocument } from "./observations";
import { ALPHA } from "./profile-fixtures";
import {
  OLD_VARIANT_FILES,
  REPLACED_MOD_ID,
  RESTORE_BACKUP_ID,
  prepareProfileRestoreWorld,
} from "./profile-restore-fixtures";
import {
  assertPreviousVariant,
  assertRestoredVariant,
} from "./profile-restore-oracle";
import { SHARE_MODS, SHARED_LOAD_ORDER } from "./profile-share-fixtures";
import { createWorld, removeOwnedWorld } from "./world";

const worlds: string[] = [];
afterEach(async () => {
  for (const world of worlds.splice(0)) await removeOwnedWorld(world);
});

it("rejects old variant bytes even when the restored store and manifest agree", async () => {
  const world = await createWorld({
    runId: "unit-run",
    caseId: "restore-variant-oracle",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  worlds.push(world.directory);
  await prepareProfileRestoreWorld(world);
  await assertPreviousVariant(world.directory);
  const folder = path.join(
    world.configuration.roots.game,
    "game/citadel/addons",
    ALPHA.folder,
  );
  await unlink(path.join(folder, "pak04_dir.vpk"));
  await unlink(path.join(folder, `${REPLACED_MOD_ID}_charlie-alt.vpk`));
  const mods = SHARED_LOAD_ORDER.map((id, index) => {
    const mod = SHARE_MODS.find((entry) => entry.id === id);
    if (!mod) throw new Error(`Missing fixture mod ${id}`);
    const selected = mod.archives.filter((archive) => archive.shared);
    return {
      remoteId: id,
      status: "installed",
      installedVpks: [`pak${String(index + 1).padStart(2, "0")}_dir.vpk`],
      selectedDownloads: selected.map((archive) => ({ name: archive.name })),
      installedFileTree: {
        files: selected.map((archive) => ({
          name: archive.vpk,
          is_selected: true,
        })),
      },
    };
  });
  for (const mod of mods)
    await writeFile(
      path.join(folder, mod.installedVpks[0]),
      catalogVpk(mod.installedFileTree.files[0].name),
    );
  await writeFile(
    path.join(folder, ".dmm.json"),
    JSON.stringify({
      version: 3,
      mods: Object.fromEntries(
        mods.map((mod, order) => [
          mod.remoteId,
          {
            enabled: true,
            shard: 1,
            order,
            currentVpks: mod.installedVpks,
            disabledVpks: [],
            originalVpkNames: mod.installedFileTree.files.map(
              (file) => file.name,
            ),
          },
        ]),
      ),
    }),
  );
  const document = z
    .object({
      version: z.number(),
      state: z.looseObject({
        profiles: z.record(z.string(), z.looseObject({})),
      }),
    })
    .parse(await readPersistedDocument(world.directory));
  const stored = z
    .record(z.string(), z.json())
    .parse(
      JSON.parse(
        await readFile(
          path.join(world.configuration.roots.appData, "state.json"),
          "utf8",
        ),
      ),
    );
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({
      ...stored,
      "local-config": JSON.stringify({
        ...document,
        state: {
          ...document.state,
          localMods: mods,
          cloudBackupLinks: {
            [ALPHA.id]: { backupId: RESTORE_BACKUP_ID, revision: 1 },
          },
          profiles: {
            ...document.state.profiles,
            [ALPHA.id]: { ...document.state.profiles[ALPHA.id], mods },
          },
        },
      }),
    }),
  );
  await assertRestoredVariant(world.directory, "baseline");
  const orphan = path.join(folder, "pak04_dir.vpk");
  await writeFile(orphan, catalogVpk(OLD_VARIANT_FILES[0]));
  await expect(
    assertRestoredVariant(world.directory, "orphaned-old-variant"),
  ).rejects.toThrow("Only the backup's VPK bytes remain");
  await unlink(orphan);
  await writeFile(
    path.join(folder, "pak01_dir.vpk"),
    catalogVpk(OLD_VARIANT_FILES[0]),
  );
  await expect(
    assertRestoredVariant(world.directory, "wrong-variant"),
  ).rejects.toThrow("Only the backup's VPK bytes remain");
});
