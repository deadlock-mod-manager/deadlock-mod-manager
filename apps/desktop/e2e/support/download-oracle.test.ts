import { afterEach, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  DOWNLOAD_FILE,
  downloadPayload,
  prepareDownloadWorld,
} from "./download-fixtures";
import { assertDownloadDisk, downloadDirectory } from "./download-oracle";
import { createWorld, removeOwnedWorld } from "./world";

const worlds: string[] = [];
afterEach(async () => {
  for (const world of worlds.splice(0)) await removeOwnedWorld(world);
});

it("rejects the wrong variant and leftover partial files despite a completed store status", async () => {
  const world = await createWorld({
    runId: "unit-run",
    caseId: "download-oracle",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  worlds.push(world.directory);
  await prepareDownloadWorld(
    world,
    "http://127.0.0.1:43123",
    "downloads-variants",
  );
  const storePath = path.join(world.configuration.roots.appData, "state.json");
  const store = z
    .object({ "local-config": z.string() })
    .parse(JSON.parse(await readFile(storePath, "utf8")));
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(JSON.parse(store["local-config"]));
  const mods = z
    .array(z.record(z.string(), z.json()))
    .parse(persisted.state.localMods);
  persisted.state.localMods = mods.map((mod) => ({
    ...mod,
    status: "downloaded",
  }));
  await writeFile(
    storePath,
    JSON.stringify({ "local-config": JSON.stringify(persisted) }),
  );
  const directory = await downloadDirectory(world.directory);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, DOWNLOAD_FILE), downloadPayload());
  await assertDownloadDisk(world.directory, "baseline", "downloaded");
  await writeFile(
    path.join(directory, DOWNLOAD_FILE),
    downloadPayload("unselected"),
  );
  await expect(
    assertDownloadDisk(world.directory, "wrong-variant", "downloaded"),
  ).rejects.toThrow();
  await writeFile(path.join(directory, DOWNLOAD_FILE), downloadPayload());
  await writeFile(path.join(directory, `${DOWNLOAD_FILE}.partial`), "stale");
  await expect(
    assertDownloadDisk(world.directory, "stale-partial", "downloaded"),
  ).rejects.toThrow();
});
