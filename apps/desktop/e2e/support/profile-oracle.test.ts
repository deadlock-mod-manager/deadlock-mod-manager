import { afterEach, expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ALPHA,
  ALPHA_MODS,
  BETA,
  prepareProfileWorld,
} from "./profile-fixtures";
import { assertProfilesDisk } from "./profile-oracle";
import { createWorld, removeOwnedWorld } from "./world";

const worlds: string[] = [];
afterEach(async () => {
  for (const world of worlds.splice(0)) await removeOwnedWorld(world);
});

it("detects swapped payloads even when VPK names and manifest remain valid", async () => {
  const world = await createWorld({
    runId: "unit-run",
    caseId: "profile-bytes",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  worlds.push(world.directory);
  await prepareProfileWorld(world);
  await assertProfilesDisk(world.directory, "baseline", ALPHA.id, ALPHA_MODS);
  const directory = path.join(
    world.configuration.roots.game,
    "game",
    "citadel",
    "addons",
    ALPHA.folder,
  );
  const first = await readFile(path.join(directory, "pak01_dir.vpk"));
  const second = await readFile(path.join(directory, "pak02_dir.vpk"));
  await writeFile(path.join(directory, "pak01_dir.vpk"), second);
  await writeFile(path.join(directory, "pak02_dir.vpk"), first);
  await expect(
    assertProfilesDisk(world.directory, "corrupt", ALPHA.id, ALPHA_MODS),
  ).rejects.toThrow("Wrong bytes");
});

it("rejects writes to protected files in an inactive profile", async () => {
  const world = await createWorld({
    runId: "unit-run",
    caseId: "profile-isolation",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  worlds.push(world.directory);
  await prepareProfileWorld(world);
  await writeFile(
    path.join(
      world.configuration.roots.game,
      "game",
      "citadel",
      "addons",
      BETA.folder,
      "unexpected.txt",
    ),
    "unexpected write",
  );
  await expect(
    assertProfilesDisk(world.directory, "corrupt", ALPHA.id, ALPHA_MODS),
  ).rejects.toThrow();
});
