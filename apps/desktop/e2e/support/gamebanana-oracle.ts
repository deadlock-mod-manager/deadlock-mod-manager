import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { assertOwnedWorld, collectFileInventory } from "./world";
import {
  catalogRecipe,
  catalogVpk,
  CATALOG_MOD_ID,
  CATALOG_MOD_NAME,
  installedCatalogFiles,
} from "./gamebanana-fixtures";

const fileSchema = z.object({
  name: z.string(),
  path: z.string(),
  archive_name: z.string(),
  is_selected: z.boolean(),
});
const modSchema = z.object({
  remoteId: z.string(),
  name: z.string(),
  status: z.string(),
  selectedDownloads: z.array(z.object({ name: z.string() })),
  installedVpks: z.array(z.string()).optional(),
  installedFileTree: z.object({ files: z.array(fileSchema) }).optional(),
});
export const readCatalogState = async (world: string) => {
  const { configuration } = await assertOwnedWorld(world);
  const store = z
    .object({ "local-config": z.string() })
    .parse(
      JSON.parse(
        await readFile(
          path.join(configuration.roots.appData, "state.json"),
          "utf8",
        ),
      ),
    );
  return z
    .object({
      state: z.object({
        localMods: z.array(modSchema).default([]),
        activeProfileId: z.string(),
        profiles: z.record(
          z.string(),
          z.object({
            folderName: z.string().nullable(),
            enabledMods: z.record(
              z.string(),
              z.object({ enabled: z.boolean() }),
            ),
          }),
        ),
      }),
    })
    .parse(JSON.parse(store["local-config"])).state;
};

export const assertCatalogDisk = async (
  world: string,
  scenario: string,
  phase: string,
): Promise<void> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readCatalogState(world);
  assert.equal(state.localMods.length, 1);
  const mod = state.localMods[0];
  assert.equal(mod.remoteId, CATALOG_MOD_ID);
  assert.equal(mod.name, CATALOG_MOD_NAME);
  assert.equal(mod.status, "installed");
  const profile = state.profiles[state.activeProfileId];
  assert.equal(profile.folderName, null);
  assert.equal(profile.enabledMods[CATALOG_MOD_ID]?.enabled, true);
  assert.deepEqual(
    mod.selectedDownloads.map((download) => download.name).sort(),
    catalogRecipe(scenario)
      .filter((archive) => archive.selected)
      .map((archive) => archive.name)
      .sort(),
  );
  const names = installedCatalogFiles(scenario);
  assert(mod.installedFileTree);
  assert.deepEqual(
    mod.installedFileTree.files
      .filter((file) => file.is_selected)
      .map((file) => file.name)
      .sort(),
    names,
  );
  for (const file of mod.installedFileTree.files.filter(
    (file) => file.is_selected,
  ))
    assert.equal(
      file.archive_name,
      catalogRecipe(scenario).find((archive) =>
        archive.files.includes(file.name),
      )?.name,
    );
  const addons = path.join(roots.game, "game", "citadel", "addons");
  const manifest = z
    .object({
      version: z.literal(3),
      mods: z.record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          currentVpks: z.array(z.string()),
          disabledVpks: z.array(z.string()),
          originalVpkNames: z.array(z.string()),
        }),
      ),
    })
    .parse(JSON.parse(await readFile(path.join(addons, ".dmm.json"), "utf8")));
  assert.deepEqual(Object.keys(manifest.mods), [CATALOG_MOD_ID]);
  const entry = manifest.mods[CATALOG_MOD_ID];
  assert.equal(entry.enabled, true);
  assert.deepEqual(entry.disabledVpks, []);
  assert.deepEqual(entry.originalVpkNames.toSorted(), names);
  assert.deepEqual(mod.installedVpks, entry.currentVpks);
  const inventory = await collectFileInventory(addons);
  assert.deepEqual(
    Object.keys(inventory).sort(),
    [".dmm.json", ...entry.currentVpks].sort(),
  );
  const hash = (name: string) => {
    const bytes = catalogVpk(name);
    return `${bytes.length}:${createHash("sha256").update(bytes).digest("hex")}`;
  };
  assert.deepEqual(
    entry.currentVpks.map((vpk) => inventory[vpk]).sort(),
    names.map(hash).sort(),
  );
  for (const [index, name] of entry.originalVpkNames.entries())
    assert.equal(
      inventory[entry.currentVpks[index]],
      hash(name),
      `Wrong bytes for ${name}`,
    );
  const before = z
    .object({
      game: z.record(z.string(), z.string()),
      steam: z.record(z.string(), z.string()),
      steamHttpCache: z.record(z.string(), z.string()),
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", "files-before.json"),
          "utf8",
        ),
      ),
    );
  const game = await collectFileInventory(roots.game);
  for (const [name, value] of Object.entries(before.game))
    if (!name.endsWith("gameinfo.gi"))
      assert.equal(game[name], value, `Protected game file changed: ${name}`);
  assert.deepEqual(await collectFileInventory(roots.steam), before.steam);
  assert.deepEqual(
    await collectFileInventory(roots.steamHttpCache),
    before.steamHttpCache,
  );
  await writeFile(
    path.join(world, "artifacts", `catalog-${phase}.json`),
    JSON.stringify({ state, manifest, inventory }, null, 2),
  );
};
