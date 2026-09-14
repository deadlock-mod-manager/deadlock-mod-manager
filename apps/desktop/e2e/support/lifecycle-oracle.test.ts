import { afterEach, expect, it } from "bun:test";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertLifecycleDisk } from "./lifecycle-oracle";
import { collectFileInventory, createWorld, removeOwnedWorld } from "./world";
import { writeSyntheticVpk } from "./vpk";

const worlds: string[] = [];
afterEach(async () => {
  for (const world of worlds.splice(0)) await removeOwnedWorld(world);
});

it("detects payload corruption and untracked files even when the store and manifest agree", async () => {
  const world = await createWorld({
    runId: "oracle",
    caseId: "local-mod-lifecycle",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  worlds.push(world.directory);
  const { roots } = world.configuration;
  const modId = "local-oracle";
  const filename = `${modId}_e2e-local-mod.vpk`;
  const addons = path.join(roots.game, "game", "citadel", "addons");
  const fixture = path.join(world.directory, "fixtures", "e2e-local-mod.vpk");
  const source = path.join(roots.appData, "mods", modId, "files");
  await writeSyntheticVpk(fixture, [
    { path: "scripts/test.txt", contents: "fixture" },
  ]);
  await mkdir(source, { recursive: true });
  await copyFile(fixture, path.join(source, "e2e-local-mod.vpk"));
  await copyFile(fixture, path.join(addons, filename));
  await writeFile(
    path.join(roots.game, "protected.txt"),
    "Never change this game file\n",
  );
  await writeFile(
    path.join(world.artifactsDirectory, "files-before.json"),
    JSON.stringify({ steam: await collectFileInventory(roots.steam) }),
  );
  await writeFile(
    path.join(roots.appData, "state.json"),
    JSON.stringify({
      "local-config": JSON.stringify({
        state: {
          localMods: [
            { remoteId: modId, name: "e2e-local-mod", status: "downloaded" },
          ],
          activeProfileId: "default",
          profiles: { default: { folderName: null, enabledMods: {} } },
        },
      }),
    }),
  );
  await writeFile(
    path.join(addons, ".dmm.json"),
    JSON.stringify({
      version: 3,
      mods: {
        [modId]: {
          enabled: false,
          shard: 1,
          order: null,
          currentVpks: [],
          disabledVpks: [filename],
          originalVpkNames: ["e2e-local-mod.vpk"],
        },
      },
    }),
  );
  await assertLifecycleDisk(world.directory, "valid", modId, "downloaded");
  await writeFile(path.join(addons, filename), "corrupt");
  await expect(
    assertLifecycleDisk(world.directory, "corrupt", modId, "downloaded"),
  ).rejects.toThrow("Installed bytes");
  await copyFile(fixture, path.join(addons, filename));
  await writeFile(path.join(addons, "untracked.vpk"), "unexpected");
  await expect(
    assertLifecycleDisk(world.directory, "untracked", modId, "downloaded"),
  ).rejects.toThrow();
});
