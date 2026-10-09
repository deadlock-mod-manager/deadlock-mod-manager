import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fingerprint, readPersistedDocument } from "./observations";
import { SHARDS, shardPayload } from "./shard-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const SHARD_CAPACITY = 99;
const MAX_SHARDS = 10;

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
  installOrder: z.number().nullish(),
  installedVpks: z.array(z.string()).nullish(),
});

const shardRoot = (shard: number) =>
  shard === 1 ? "addons" : `addons${shard}`;
const pakNumber = (filename: string) =>
  Number(/^pak(\d+)_dir\.vpk$/.exec(filename)?.[1] ?? Number.NaN);

export const shardPaths = async (world: string) => {
  const { configuration } = await assertOwnedWorld(world);
  const citadel = path.join(configuration.roots.game, "game", "citadel");
  return {
    caseId: configuration.caseId,
    citadel,
    base: path.join(citadel, "addons", SHARDS.folder),
    shardDirectory: (shard: number) =>
      path.join(citadel, shardRoot(shard), SHARDS.folder),
  };
};

export const readShardStore = async (world: string) =>
  z
    .object({
      state: z.object({
        activeProfileId: z.string(),
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

export const readGameinfoSearchPaths = async (world: string) => {
  const { citadel } = await shardPaths(world);
  const gameinfo = await readFile(path.join(citadel, "gameinfo.gi"), "utf8");
  return [...gameinfo.matchAll(/^\s*Game\s+(citadel\/addons\S*)\s*$/gm)].map(
    (match) => match[1],
  );
};

/** The search paths the engine needs: one per shard that holds enabled VPKs. */
export const searchPathsFor = (shards: number) =>
  Array.from(
    { length: shards },
    (_, index) => `citadel/${shardRoot(index + 1)}/${SHARDS.folder}`,
  );

export type ShardExpectation = {
  /** Enabled mods in the order the game loads them. */
  loadOrder: readonly string[];
  disabled?: readonly string[];
  /** Shards specific mods must occupy. */
  shards?: Readonly<Record<string, number>>;
  /** Profile files no mod owns, keyed by path below `citadel`. */
  unowned?: Readonly<Record<string, string>>;
  searchPaths?: readonly string[];
};

/**
 * Checks the disk, manifest and persisted store against each other:
 * - enabled mods load in `loadOrder`, sorted by (shard, pak number) like the
 *   engine does, with each mod's own bytes in its slot;
 * - no shard exceeds the engine's per-folder limit and no shard is skipped;
 * - disabled mods keep their prefixed copies in the base folder only;
 * - overflow shard folders exist exactly while they hold files;
 * - the library shows enabled mods as installed with the VPKs the manifest records.
 */
export const assertShardLayout = async (
  world: string,
  step: string,
  expected: ShardExpectation,
) => {
  const { caseId, citadel, base, shardDirectory } = await shardPaths(world);
  const payload = shardPayload(caseId);
  const disabled = expected.disabled ?? [];
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(base, ".dmm.json"), "utf8")),
  );
  assert.deepEqual(
    Object.keys(manifest.mods).sort(),
    [...expected.loadOrder, ...disabled].sort(),
    "Manifest tracks exactly the library's mods",
  );

  const enabled = Object.entries(manifest.mods).filter(
    ([, entry]) => entry.enabled,
  );
  const loadOrder = enabled
    .map(([id, entry]) => {
      assert.equal(entry.currentVpks.length, 1, `${id} owns one enabled VPK`);
      return { id, shard: entry.shard, pak: pakNumber(entry.currentVpks[0]) };
    })
    .toSorted((a, b) => a.shard - b.shard || a.pak - b.pak);
  assert.deepEqual(
    loadOrder.map(({ id }) => id),
    expected.loadOrder,
    "Engine load order",
  );
  for (const [id, shard] of Object.entries(expected.shards ?? {}))
    assert.equal(manifest.mods[id]?.shard, shard, `${id} shard`);

  const perShard = new Map<number, number>();
  for (const { shard } of loadOrder)
    perShard.set(shard, (perShard.get(shard) ?? 0) + 1);
  const shardsInUse = Math.max(0, ...perShard.keys());
  for (let shard = 1; shard <= shardsInUse; shard++) {
    const count = perShard.get(shard) ?? 0;
    assert(count > 0, `Shard ${shard} is skipped`);
    assert(count <= SHARD_CAPACITY, `Shard ${shard} holds ${count} VPKs`);
  }

  // Empty bytes mark files checked for presence only.
  const files = new Map([
    [`addons/${SHARDS.folder}/.dmm.json`, ""],
    [`addons/${SHARDS.folder}/protected.txt`, ""],
    ...Object.entries(expected.unowned ?? {}),
  ]);
  for (const [id, entry] of Object.entries(manifest.mods)) {
    const bytes = fingerprint(payload(id));
    if (entry.enabled) {
      assert.deepEqual(entry.disabledVpks, [], `${id} has no disabled copy`);
      files.set(
        `${shardRoot(entry.shard)}/${SHARDS.folder}/${entry.currentVpks[0]}`,
        bytes,
      );
    } else {
      assert(disabled.includes(id), `${id} should be enabled`);
      assert.deepEqual(entry.currentVpks, [], `${id} has no enabled VPK`);
      assert.equal(entry.disabledVpks.length, 1, `${id} keeps one copy`);
      files.set(`addons/${SHARDS.folder}/${entry.disabledVpks[0]}`, bytes);
    }
  }
  const inventory = Object.fromEntries(
    Object.entries(await collectFileInventory(citadel)).filter(([name]) => {
      const [root, folder] = name.split("/");
      return /^addons\d*$/.test(root) && folder === SHARDS.folder;
    }),
  );
  assert.deepEqual(
    Object.keys(inventory).sort(),
    [...files.keys()].sort(),
    "Exact profile files across every shard",
  );
  for (const [name, bytes] of files)
    if (bytes) assert.equal(inventory[name], bytes, `Wrong bytes in ${name}`);
  assert.equal(
    await readFile(path.join(base, "protected.txt"), "utf8"),
    `Protected ${SHARDS.name}\n`,
  );
  for (let shard = 2; shard <= MAX_SHARDS; shard++) {
    const exists = await stat(shardDirectory(shard)).then(
      () => true,
      () => false,
    );
    const holdsFiles = [...files.keys()].some((name) =>
      name.startsWith(`${shardRoot(shard)}/`),
    );
    assert.equal(exists, holdsFiles, `addons${shard} folder presence`);
  }

  const store = await readShardStore(world);
  assert.equal(store.activeProfileId, SHARDS.id);
  const profile = store.profiles[SHARDS.id];
  for (const mods of [store.localMods, profile.mods])
    assert.deepEqual(
      mods.map((mod) => mod.remoteId).sort(),
      Object.keys(manifest.mods).sort(),
      "Library lists every managed mod",
    );
  for (const mod of store.localMods) {
    const entry = manifest.mods[mod.remoteId];
    assert.equal(
      mod.status,
      entry.enabled ? "installed" : "downloaded",
      `${mod.remoteId} status`,
    );
    assert.equal(
      profile.enabledMods[mod.remoteId]?.enabled ?? false,
      entry.enabled,
      `${mod.remoteId} profile flag`,
    );
    if (entry.enabled)
      assert.deepEqual(
        mod.installedVpks,
        entry.currentVpks,
        `${mod.remoteId} installed VPKs`,
      );
  }

  const searchPaths = await readGameinfoSearchPaths(world);
  if (expected.searchPaths)
    assert.deepEqual(searchPaths, expected.searchPaths, "gameinfo.gi paths");

  await writeFile(
    path.join(world, "artifacts", `shards-${step}.json`),
    JSON.stringify({ manifest, store, inventory, searchPaths }, null, 2),
  );
  return { manifest, store };
};
