import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ALPHA, ALPHA_MODS, profilePayload } from "./profile-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";
import { readProfileState } from "./profile-oracle";

export const shardSlot = (index: number) => ({
  shard: Math.floor(index / 99) + 1,
  filename: `pak${String((index % 99) + 1).padStart(2, "0")}_dir.vpk`,
});

export const processExists = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ESRCH"
    )
      throw error;
    return false;
  }
};

export const assertNormalExit = async (
  world: string,
  phase: string,
): Promise<void> => {
  const { configuration, artifacts } = await filesystemPaths(world);
  const completed = z
    .object({
      processId: z.number().int().positive(),
      runId: z.string(),
      caseId: z.string(),
      phase: z.string(),
      state: z.json(),
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(artifacts, `phase-completed-${phase}.json`),
          "utf8",
        ),
      ),
    );
  assert.equal(completed.runId, configuration.runId);
  assert.equal(completed.caseId, configuration.caseId);
  assert.equal(completed.phase, phase);
  assert.equal(
    processExists(completed.processId),
    false,
    "Normal close must finish before restart",
  );
  assert.deepEqual(
    await readProfileState(world),
    completed.state,
    "Store remains intact after normal exit",
  );
};

const inventorySchema = z.record(z.string(), z.string());
const backupEvidenceSchema = z.object({
  fileName: z.string().regex(/^addons-backup-[\d_-]+$/),
  inventory: inventorySchema,
});
export const filesystemManifestSchema = z.object({
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
export const fingerprint = (bytes: Buffer): string =>
  `${bytes.length}:${createHash("sha256").update(bytes).digest("hex")}`;

const protectedFiles = (files: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(files).filter(
      ([name]) => name.split("/")[1] !== ALPHA.folder && name !== "gameinfo.gi",
    ),
  );

export const filesystemPaths = async (world: string) => {
  const { configuration } = await assertOwnedWorld(world);
  const citadel = path.join(configuration.roots.game, "game", "citadel");
  return {
    configuration,
    citadel,
    alpha: path.join(citadel, "addons", ALPHA.folder),
    artifacts: path.join(world, "artifacts"),
  };
};

export const assertFilesystemLayout = async (
  world: string,
  step: string,
  order: string[],
  extras: Record<string, string> = {},
): Promise<Record<string, string>> => {
  const { configuration, citadel, alpha, artifacts } =
    await filesystemPaths(world);
  const manifest = filesystemManifestSchema.parse(
    JSON.parse(await readFile(path.join(alpha, ".dmm.json"), "utf8")),
  );
  assert.deepEqual(Object.keys(manifest.mods).sort(), order.toSorted());
  const inventory = await collectFileInventory(citadel);
  const expected: Record<string, string> = {
    [`addons/${ALPHA.folder}/protected.txt`]: fingerprint(
      Buffer.from(`Protected ${ALPHA.name}\n`),
    ),
    ...extras,
  };
  for (const [index, id] of order.entries()) {
    const { shard, filename } = shardSlot(index);
    assert.deepEqual(manifest.mods[id], {
      enabled: true,
      order: index,
      shard,
      currentVpks: [filename],
      disabledVpks: [],
      originalVpkNames: [`${id}.vpk`],
    });
    expected[
      `${shard === 1 ? "addons" : `addons${shard}`}/${ALPHA.folder}/${filename}`
    ] = fingerprint(profilePayload(id));
  }
  const alphaFiles = Object.fromEntries(
    Object.entries(inventory).filter(
      ([name]) =>
        name.split("/")[1] === ALPHA.folder &&
        name !== `addons/${ALPHA.folder}/.dmm.json`,
    ),
  );
  assert.deepEqual(
    alphaFiles,
    expected,
    "Exact active profile files and hashes",
  );
  const initial = z
    .object({
      citadel: inventorySchema,
      steam: inventorySchema,
      steamHttpCache: inventorySchema,
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(artifacts, "filesystem-baseline.json"),
          "utf8",
        ),
      ),
    );
  const expectedProtected = protectedFiles(initial.citadel);
  if (step === "reconciled")
    expectedProtected["gameinfo.gi.bak"] = initial.citadel["gameinfo.gi"];
  if (
    configuration.caseId.startsWith("filesystem-backup-") &&
    step !== "initial"
  ) {
    const backup = backupEvidenceSchema.parse(
      JSON.parse(
        await readFile(path.join(artifacts, "filesystem-backup.json"), "utf8"),
      ),
    );
    const expectedBackup = Object.fromEntries(
      Object.entries(initial.citadel).filter(([name]) =>
        /^addons\d*\//.test(name),
      ),
    );
    assert.deepEqual(
      backup.inventory,
      expectedBackup,
      "Backup is an exact snapshot of all addon profiles",
    );
    assert.deepEqual(
      await collectFileInventory(
        path.join(citadel, "addons-backups", backup.fileName),
      ),
      expectedBackup,
      "Backup source remains unchanged",
    );
    for (const [name, hash] of Object.entries(expectedBackup))
      expectedProtected[`addons-backups/${backup.fileName}/${name}`] = hash;
    // Opening Settings initializes the real autoexec manager with an empty file.
    expectedProtected["cfg/autoexec.cfg"] = fingerprint(Buffer.alloc(0));
  }
  assert.deepEqual(protectedFiles(inventory), expectedProtected);
  assert.deepEqual(
    await collectFileInventory(configuration.roots.steam),
    initial.steam,
  );
  assert.deepEqual(
    await collectFileInventory(configuration.roots.steamHttpCache),
    initial.steamHttpCache,
  );
  const gameinfo = await readFile(path.join(citadel, "gameinfo.gi"), "utf8");
  assert.deepEqual(
    [...gameinfo.matchAll(/^\s*Game\s+(citadel\/addons\S*)\s*$/gm)].map(
      (match) => match[1],
    ),
    Array.from(
      { length: Math.ceil(order.length / 99) },
      (_, index) =>
        `citadel/${index === 0 ? "addons" : `addons${index + 1}`}/${ALPHA.folder}`,
    ),
  );
  assert(
    !Object.keys(inventory).some((name) =>
      /\.dmm-(reorder|restore-staging)|\.pending$|\.dmm\.json\.tmp$/.test(name),
    ),
    "No transaction debris",
  );
  await writeFile(
    path.join(artifacts, `filesystem-${step}.json`),
    JSON.stringify({ manifest, inventory }, null, 2),
  );
  return inventory;
};

export const assertCrashEvidence = async (world: string): Promise<void> => {
  const { configuration, alpha, artifacts } = await filesystemPaths(world);
  const checkpoint =
    configuration.caseId === "filesystem-crash-placed" ? "placed" : "committed";
  const expected = z
    .object({ processId: z.number().int().positive() })
    .parse(
      JSON.parse(
        await readFile(path.join(artifacts, "filesystem-process.json"), "utf8"),
      ),
    );
  const marker = z
    .object({
      processId: z.number(),
      checkpoint: z.string(),
      profile: z.string(),
      runId: z.string(),
    })
    .parse(
      JSON.parse(
        await readFile(path.join(artifacts, "crash-observed.json"), "utf8"),
      ),
    );
  assert.deepEqual(marker, {
    ...expected,
    checkpoint,
    profile: alpha,
    runId: configuration.runId,
  });
  assert.equal(
    processExists(marker.processId),
    false,
    "The checkpoint process must have exited",
  );
  const journal = (
    await readFile(
      path.join(alpha, ".dmm-reorder", ".transaction.jsonl"),
      "utf8",
    )
  )
    .trimEnd()
    .split("\n")
    .map((line) => z.record(z.string(), z.json()).parse(JSON.parse(line)));
  const expectedEvents = [
    ...[2, 3, 1].map((slot) => ({
      event: "stage",
      original: `pak0${slot}_dir.vpk`,
    })),
    ...[2, 3, 1]
      .slice(0, checkpoint === "placed" ? 1 : 3)
      .map((slot, index) => ({
        event: "place",
        original: `pak0${slot}_dir.vpk`,
        destination: `pak0${index + 1}_dir.vpk`,
      })),
  ];
  assert.deepEqual(journal.slice(0, expectedEvents.length), expectedEvents);
  assert.equal(
    journal.length,
    expectedEvents.length + (checkpoint === "committed" ? 1 : 0),
  );
  const manifest = filesystemManifestSchema.parse(
    JSON.parse(await readFile(path.join(alpha, ".dmm.json"), "utf8")),
  );
  if (checkpoint === "committed") {
    const event = z
      .object({
        event: z.literal("manifest"),
        manifest: filesystemManifestSchema,
      })
      .parse(journal.at(-1));
    assert.deepEqual(event.manifest, manifest);
  }
  const order =
    checkpoint === "placed"
      ? ALPHA_MODS
      : [ALPHA_MODS[1], ALPHA_MODS[2], ALPHA_MODS[0]];
  for (const [index, id] of order.entries()) {
    assert.equal(manifest.mods[id].order, index);
    assert.deepEqual(manifest.mods[id].currentVpks, [
      `pak0${index + 1}_dir.vpk`,
    ]);
  }
  const inventory = await collectFileInventory(alpha);
  const payloads = Object.fromEntries(
    Object.entries(inventory).filter(
      ([name]) => name.endsWith(".vpk") || name.endsWith(".pending"),
    ),
  );
  assert.deepEqual(
    payloads,
    checkpoint === "placed"
      ? {
          "pak01_dir.vpk": fingerprint(profilePayload(ALPHA_MODS[1])),
          ".dmm-reorder/s1__pak01_dir.vpk.pending": fingerprint(
            profilePayload(ALPHA_MODS[0]),
          ),
          ".dmm-reorder/s1__pak03_dir.vpk.pending": fingerprint(
            profilePayload(ALPHA_MODS[2]),
          ),
        }
      : Object.fromEntries(
          order.map((id, index) => [
            `pak0${index + 1}_dir.vpk`,
            fingerprint(profilePayload(id)),
          ]),
        ),
  );
  await writeFile(
    path.join(artifacts, "filesystem-crash-disk.json"),
    JSON.stringify({ marker, journal, inventory }, null, 2),
  );
};
