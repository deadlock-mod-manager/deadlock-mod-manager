import { readPersistedDocument, fingerprint } from "./observations";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  DOWNLOAD_FILE,
  DOWNLOAD_MOD,
  QUEUED_CASES,
  QUEUED_MOD,
  downloadFiles,
  isSegmentedCase,
  payloadFor,
  segmentRanges,
  queuesBehindRunning,
} from "./download-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

export const readDownloadState = async (world: string) => {
  return z
    .object({
      state: z.object({
        localMods: z.array(
          z.object({
            remoteId: z.string(),
            status: z.string(),
            selectedDownloads: z.array(z.object({ name: z.string() })),
            installedVpks: z.array(z.string()).optional(),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state.localMods;
};
export const downloadDirectory = async (world: string): Promise<string> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return path.join(roots.appData, "mods", DOWNLOAD_MOD);
};
/** Bytes already on disk for the download, in either staging format. */
export const stagedBytes = async (world: string): Promise<number> => {
  const directory = await downloadDirectory(world);
  const sizes = await Promise.all(
    [
      `${DOWNLOAD_FILE}.partial`,
      ...[0, 1, 2, 3].map((index) => `${DOWNLOAD_FILE}.segments/${index}.part`),
    ].map(
      async (name) =>
        (await stat(path.join(directory, name)).catch(() => ({ size: 0 })))
          .size,
    ),
  );
  return sizes.reduce((total, size) => total + size, 0);
};

// Each part must be the start of its own span of the file: anything else is a
// byte written at the wrong offset.
const assertSegmentStaging = async (
  directory: string,
  inventory: Record<string, string>,
  payload: Buffer,
): Promise<void> => {
  const staging = `${DOWNLOAD_FILE}.segments`;
  const manifest = z
    .object({
      version: z.literal(1),
      size: z.number(),
      md5: z.string(),
      segments: z.array(
        z.object({ start: z.number(), end: z.number(), complete: z.boolean() }),
      ),
    })
    .parse(
      JSON.parse(
        await readFile(path.join(directory, staging, "manifest.json"), "utf8"),
      ),
    );
  assert.equal(manifest.size, payload.length);
  assert.equal(manifest.md5, createHash("md5").update(payload).digest("hex"));
  assert.deepEqual(
    manifest.segments.map(({ start, end }) => `bytes=${start}-${end - 1}`),
    segmentRanges(payload.length),
  );
  let stored = 0;
  for (const [index, segment] of manifest.segments.entries()) {
    const part = await readFile(
      path.join(directory, staging, `${index}.part`),
    ).catch(() => Buffer.alloc(0));
    assert.ok(part.length <= segment.end - segment.start);
    assert.deepEqual(
      part,
      payload.subarray(segment.start, segment.start + part.length),
      `Segment ${index} holds bytes from somewhere else in the file`,
    );
    stored += part.length;
  }
  assert.ok(stored > 0 && stored < payload.length);
  assert.ok(
    Object.keys(inventory).every((name) => name.startsWith(`${staging}/`)),
    "A segmented download must leave nothing outside its staging folder",
  );
};

export const assertDownloadDisk = async (
  world: string,
  step: string,
  status: "downloaded" | "failedToDownload" | "paused",
  retainedPartial = false,
): Promise<void> => {
  const {
    configuration: { roots, caseId },
  } = await assertOwnedWorld(world);
  const mods = await readDownloadState(world);
  const queued =
    queuesBehindRunning(caseId) ||
    (caseId === "downloads-delete-queued" && status === "paused");
  assert.deepEqual(
    mods.map(({ remoteId }) => remoteId),
    queued ? [DOWNLOAD_MOD, QUEUED_MOD] : [DOWNLOAD_MOD],
  );
  // Cancelled or deleted while it waited for the first download, so it never started.
  if (queued) assert.equal(mods[1].status, "failedToDownload");
  if (QUEUED_CASES.includes(caseId))
    assert.deepEqual(
      await collectFileInventory(path.join(roots.appData, "mods", QUEUED_MOD)),
      {},
    );
  assert.equal(mods[0].status, status);
  const files = downloadFiles(caseId);
  assert.deepEqual(
    mods[0].selectedDownloads,
    files.map((name) => ({ name })),
  );
  assert.deepEqual(mods[0].installedVpks ?? [], []);
  const directory = await downloadDirectory(world);
  const inventory = await collectFileInventory(directory);
  const payload = payloadFor(caseId);
  if (status === "downloaded") {
    assert.deepEqual(
      inventory,
      Object.fromEntries(files.map((name) => [name, fingerprint(payload)])),
    );
  } else if (
    (status === "paused" || retainedPartial) &&
    isSegmentedCase(caseId)
  ) {
    await assertSegmentStaging(directory, inventory, payload);
  } else if (status === "paused" || retainedPartial) {
    const partial = await readFile(
      path.join(directory, `${DOWNLOAD_FILE}.partial`),
    );
    assert.ok(partial.length > 0 && partial.length < payload.length);
    assert.deepEqual(partial, payload.subarray(0, partial.length));
    assert.deepEqual(Object.keys(inventory).sort(), [
      `${DOWNLOAD_FILE}.partial`,
      `${DOWNLOAD_FILE}.partial.meta`,
    ]);
    assert.equal(
      z
        .object({ etag: z.string() })
        .parse(
          JSON.parse(
            await readFile(
              path.join(directory, `${DOWNLOAD_FILE}.partial.meta`),
              "utf8",
            ),
          ),
        ).etag,
      '"e2e-download-v1"',
    );
  } else
    assert.deepEqual(
      inventory,
      {},
      "Failed or cancelled transfers must not publish a file or leave partial data",
    );
  const addons = path.join(roots.game, "game", "citadel", "addons");
  const addonInventory = await collectFileInventory(addons);
  assert.ok(
    Object.keys(addonInventory).every((name) => name === ".dmm.json"),
    "Download alone must not install VPKs",
  );
  if (addonInventory[".dmm.json"])
    assert.deepEqual(
      z
        .object({ version: z.literal(3), mods: z.record(z.string(), z.json()) })
        .parse(
          JSON.parse(await readFile(path.join(addons, ".dmm.json"), "utf8")),
        ).mods,
      {},
    );
  assert.equal(
    await readFile(path.join(roots.game, "protected.txt"), "utf8"),
    "Protected download world\n",
  );
  const initial = z
    .object({ steam: z.record(z.string(), z.string()) })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", "downloads-initial.json"),
          "utf8",
        ),
      ),
    );
  assert.deepEqual(await collectFileInventory(roots.steam), initial.steam);
  await writeFile(
    path.join(world, "artifacts", `download-${step}.json`),
    JSON.stringify({ mods, inventory, addonInventory }, null, 2),
  );
};
