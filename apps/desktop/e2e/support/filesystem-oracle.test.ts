import { afterEach, expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  prepareFilesystemWorld,
  filesystemModIds,
} from "./filesystem-fixtures";
import {
  assertFilesystemLayout,
  filesystemPaths,
  filesystemManifestSchema,
  assertCrashEvidence,
} from "./filesystem-oracle";
import { createWorld, removeOwnedWorld } from "./world";

const worlds: string[] = [];
afterEach(async () => {
  for (const world of worlds.splice(0)) await removeOwnedWorld(world);
});

it("verifies the exact gameinfo backup before and after reconciled application exit", async () => {
  const world = await createWorld({
    runId: "unit-run",
    caseId: "filesystem-lock",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  worlds.push(world.directory);
  await prepareFilesystemWorld(world);
  const { citadel } = await filesystemPaths(world.directory);
  const backup = path.join(citadel, "gameinfo.gi.bak");
  await writeFile(backup, await readFile(path.join(citadel, "gameinfo.gi")));
  const order = filesystemModIds("filesystem-lock");
  await expect(
    assertFilesystemLayout(world.directory, "initial", order),
  ).rejects.toThrow();
  for (const step of ["reconciled", "closed-reconciled"])
    await assertFilesystemLayout(world.directory, step, order);
  await writeFile(backup, "Unexpected backup bytes");
  for (const step of ["reconciled", "closed-reconciled"])
    await expect(
      assertFilesystemLayout(world.directory, step, order),
    ).rejects.toThrow();
});

it("rejects swapped shard payloads, false manifest ownership, and unexpected files", async () => {
  const world = await createWorld({
    runId: "unit-run",
    caseId: "filesystem-shards",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  worlds.push(world.directory);
  await prepareFilesystemWorld(world);
  const order = filesystemModIds("filesystem-shards");
  const check = () => assertFilesystemLayout(world.directory, "unit", order);
  await check();
  const { alpha, citadel } = await filesystemPaths(world.directory);
  const first = path.join(alpha, "pak01_dir.vpk");
  const original = await readFile(first);
  await writeFile(
    first,
    await readFile(
      path.join(citadel, "addons2", path.basename(alpha), "pak01_dir.vpk"),
    ),
  );
  await expect(check()).rejects.toThrow();
  await writeFile(first, original);
  const manifestPath = path.join(alpha, ".dmm.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = filesystemManifestSchema.parse(
    JSON.parse(manifestBytes.toString()),
  );
  manifest.mods[order[99]].shard = 1;
  await writeFile(manifestPath, JSON.stringify(manifest));
  await expect(check()).rejects.toThrow();
  await writeFile(manifestPath, manifestBytes);
  await writeFile(path.join(citadel, "unexpected.txt"), "unexpected");
  await expect(check()).rejects.toThrow();
});

it("cannot excuse a failed driver run with a marker from a foreign or live process", async () => {
  const world = await createWorld({
    runId: "unit-run",
    caseId: "filesystem-crash-placed",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  worlds.push(world.directory);
  await prepareFilesystemWorld(world);
  const { alpha, artifacts } = await filesystemPaths(world.directory);
  await writeFile(
    path.join(artifacts, "filesystem-process.json"),
    JSON.stringify({ processId: 123 }),
  );
  await writeFile(
    path.join(artifacts, "crash-observed.json"),
    JSON.stringify({
      processId: 124,
      checkpoint: "placed",
      profile: alpha,
      runId: "unit-run",
    }),
  );
  await expect(assertCrashEvidence(world.directory)).rejects.toThrow();
  await writeFile(
    path.join(artifacts, "filesystem-process.json"),
    JSON.stringify({ processId: process.pid }),
  );
  await writeFile(
    path.join(artifacts, "crash-observed.json"),
    JSON.stringify({
      processId: process.pid,
      checkpoint: "placed",
      profile: alpha,
      runId: "unit-run",
    }),
  );
  await expect(assertCrashEvidence(world.directory)).rejects.toThrow(
    "The checkpoint process must have exited",
  );
});
