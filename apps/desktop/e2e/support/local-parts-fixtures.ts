import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readPersistedDocument } from "./observations";
import { writeSyntheticVpk } from "./vpk";
import { assertOwnedWorld, collectFileInventory } from "./world";
import type { CreatedWorld } from "./world";

export const PARTS_MOD_NAME = "e2e-parts";
export const PART_FILES = [
  "e2e-parts_base.vpk",
  "e2e-parts_hair.vpk",
  "e2e-parts_sounds.vpk",
] as const;
// Dropped with the parts and removed in the finalize dialog.
export const EXTRA_PART = "e2e-parts_extra.vpk";
// Unrelated files, which the finalize dialog offers to add as separate mods.
export const VOICE_PACK = "kill-lines.vpk";
export const LOOSE_FILE = "sparkles.vpk";
export const MAP_FILE = "street-map.vpk";

export const prepareLocalPartsWorld = async (world: CreatedWorld) => {
  const fixtures = path.join(world.directory, "fixtures");
  for (const name of [...PART_FILES, EXTRA_PART, LOOSE_FILE]) {
    await writeSyntheticVpk(path.join(fixtures, name), [
      { path: `scripts/${name}.txt`, contents: `DMM part fixture ${name}\n` },
    ]);
  }
  await writeSyntheticVpk(path.join(fixtures, VOICE_PACK), [
    { path: "sounds/vo/kill_01.vsnd_c", contents: "DMM voice line fixture\n" },
  ]);
  await writeSyntheticVpk(path.join(fixtures, MAP_FILE), [
    { path: "maps/street_test.vpk", contents: "DMM map fixture\n" },
  ]);
};

const stateSchema = z.object({
  state: z.object({
    localMods: z.array(
      z.object({
        remoteId: z.string(),
        name: z.string(),
        status: z.string(),
        category: z.string().optional(),
        metadata: z.object({ mapName: z.string().optional() }).nullish(),
        installedFileTree: z
          .object({
            files: z.array(
              z.object({
                name: z.string(),
                is_selected: z.boolean(),
                archive_name: z.string(),
              }),
            ),
          })
          .optional(),
      }),
    ),
  }),
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

export const readPartsState = async (world: string) =>
  stateSchema.parse(await readPersistedDocument(world)).state;

/**
 * Each unrelated file became a mod of its own, named after the file. The voice
 * pack and the map are filed under the category their files point to, and the
 * map keeps the name it launches by; the other file, which points to none,
 * takes the category picked in the dialog.
 */
export const assertSeparateMods = async (world: string): Promise<void> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readPartsState(world);
  const added = state.localMods.filter((mod) => mod.name !== PARTS_MOD_NAME);
  assert.deepEqual(
    added
      .map((mod) => [mod.name, mod.category, mod.metadata?.mapName ?? null])
      .sort(),
    [
      ["kill-lines", "VOs", null],
      ["sparkles", "Skins", null],
      ["street-map", "Maps", "street_test"],
    ],
  );
  assert.ok(added.every((mod) => mod.status === "downloaded"));
  const fixtures = await collectFileInventory(path.join(world, "fixtures"));
  for (const mod of added) {
    const file = `${mod.name}.vpk`;
    assert.deepEqual(
      await collectFileInventory(
        path.join(roots.appData, "mods", mod.remoteId, "files"),
      ),
      { [file]: fixtures[file] },
    );
  }
};

/**
 * One library mod owns every part. Enabled parts are installed with their own
 * bytes; the others sit in the addons folder under the mod's prefix, where the
 * game ignores them and Manage files can bring them back without the source.
 */
export const assertPartsDisk = async (
  world: string,
  step: string,
  status: "downloaded" | "installed",
  enabledParts: readonly string[],
): Promise<void> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readPartsState(world);
  assert.equal(state.localMods.length, 1);
  const [mod] = state.localMods;
  const modId = mod.remoteId;
  assert.equal(mod.name, PARTS_MOD_NAME);
  assert.equal(mod.status, status);
  assert.deepEqual(
    mod.installedFileTree?.files.map((file) => [
      file.name,
      file.archive_name,
      file.is_selected,
    ]),
    PART_FILES.map((name) => [
      name,
      "",
      status === "downloaded" || enabledParts.includes(name),
    ]),
  );

  const fixtures = await collectFileInventory(path.join(world, "fixtures"));
  const source = await collectFileInventory(
    path.join(roots.appData, "mods", modId, "files"),
  );
  assert.deepEqual(
    source,
    Object.fromEntries(PART_FILES.map((name) => [name, fixtures[name]])),
  );

  const addons = path.join(roots.game, "game", "citadel", "addons");
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(addons, ".dmm.json"), "utf8")),
  );
  assert.deepEqual(Object.keys(manifest.mods), [modId]);
  const entry = manifest.mods[modId];
  const inventory = await collectFileInventory(addons);
  const parked = PART_FILES.filter(
    (name) => status === "downloaded" || !enabledParts.includes(name),
  ).map((name) => [`${modId}_${name}`, fixtures[name]]);
  for (const [file, hash] of parked) {
    assert.equal(inventory[file], hash, `${file} must keep the part's bytes`);
  }
  assert.equal(entry.enabled, status === "installed");
  const installedHashes = entry.currentVpks
    .map((file) => inventory[file])
    .sort();
  assert.deepEqual(
    installedHashes,
    enabledParts.map((name) => fixtures[name]).sort(),
  );
  assert.deepEqual(
    Object.keys(inventory).sort(),
    [".dmm.json", ...entry.currentVpks, ...parked.map(([file]) => file)].sort(),
  );

  await writeFile(
    path.join(world, "artifacts", `parts-${step}.json`),
    JSON.stringify({ state, manifest, inventory }, null, 2),
  );
};
