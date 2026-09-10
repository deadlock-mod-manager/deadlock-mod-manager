import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  DOWNLOAD_FILE,
  DOWNLOAD_MOD,
  downloadPayload,
} from "./download-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

export const readDownloadState = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const store = z
    .object({ "local-config": z.string() })
    .parse(
      JSON.parse(
        await readFile(path.join(roots.appData, "state.json"), "utf8"),
      ),
    );
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
    .parse(JSON.parse(store["local-config"])).state.localMods;
};
export const downloadDirectory = async (world: string): Promise<string> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return path.join(roots.appData, "mods", DOWNLOAD_MOD);
};
export const assertDownloadDisk = async (
  world: string,
  step: string,
  status: "downloaded" | "failedToDownload" | "paused",
  retainedPartial = false,
): Promise<void> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const mods = await readDownloadState(world);
  assert.equal(mods.length, 1);
  assert.equal(mods[0].remoteId, DOWNLOAD_MOD);
  assert.equal(mods[0].status, status);
  assert.deepEqual(mods[0].selectedDownloads, [{ name: DOWNLOAD_FILE }]);
  assert.deepEqual(mods[0].installedVpks ?? [], []);
  const directory = await downloadDirectory(world);
  const inventory = await collectFileInventory(directory);
  const payload = downloadPayload();
  if (status === "downloaded") {
    assert.deepEqual(inventory, {
      [DOWNLOAD_FILE]: `${payload.length}:${createHash("sha256").update(payload).digest("hex")}`,
    });
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
