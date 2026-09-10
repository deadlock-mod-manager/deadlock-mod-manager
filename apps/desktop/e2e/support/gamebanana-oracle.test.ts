import { afterEach, expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertCatalogDisk } from "./gamebanana-oracle";
import {
  catalogVpk,
  CATALOG_MOD_ID,
  CATALOG_MOD_NAME,
} from "./gamebanana-fixtures";
import { collectFileInventory, createWorld, removeOwnedWorld } from "./world";

const worlds: string[] = [];
afterEach(async () => {
  for (const world of worlds.splice(0)) await removeOwnedWorld(world);
});

it("rejects wrong variant bytes and extra installed files even when UI state says installed", async () => {
  const world = await createWorld({
    runId: "catalog-oracle",
    caseId: "gamebanana-single",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  worlds.push(world.directory);
  const { roots } = world.configuration;
  await writeFile(
    path.join(world.artifactsDirectory, "files-before.json"),
    JSON.stringify({
      game: await collectFileInventory(roots.game),
      steam: await collectFileInventory(roots.steam),
      steamHttpCache: await collectFileInventory(roots.steamHttpCache),
    }),
  );
  await writeFile(
    path.join(roots.appData, "state.json"),
    JSON.stringify({
      "local-config": JSON.stringify({
        state: {
          activeProfileId: "default",
          profiles: {
            default: {
              folderName: null,
              enabledMods: { [CATALOG_MOD_ID]: { enabled: true } },
            },
          },
          localMods: [
            {
              remoteId: CATALOG_MOD_ID,
              name: CATALOG_MOD_NAME,
              status: "installed",
              selectedDownloads: [{ name: "base.zip" }],
              installedVpks: ["pak01_dir.vpk"],
              installedFileTree: {
                files: [
                  {
                    name: "base.vpk",
                    path: "base.vpk",
                    archive_name: "base.zip",
                    is_selected: true,
                  },
                ],
              },
            },
          ],
        },
      }),
    }),
  );
  const gameinfo = path.join(roots.game, "game", "citadel", "gameinfo.gi");
  await writeFile(
    gameinfo,
    (await readFile(gameinfo, "utf8")).replace(
      "Game citadel",
      "Game citadel/addons\n      Game citadel",
    ),
  );
  const addons = path.join(roots.game, "game", "citadel", "addons");
  await writeFile(
    path.join(addons, ".dmm.json"),
    JSON.stringify({
      version: 3,
      mods: {
        [CATALOG_MOD_ID]: {
          enabled: true,
          currentVpks: ["pak01_dir.vpk"],
          disabledVpks: [],
          originalVpkNames: ["base.vpk"],
        },
      },
    }),
  );
  const target = path.join(addons, "pak01_dir.vpk");
  await writeFile(target, catalogVpk("base.vpk"));
  await assertCatalogDisk(world.directory, "gamebanana-single", "valid");
  await writeFile(target, catalogVpk("red.vpk"));
  await expect(
    assertCatalogDisk(world.directory, "gamebanana-single", "wrong-variant"),
  ).rejects.toThrow();
  await writeFile(target, catalogVpk("base.vpk"));
  await writeFile(path.join(addons, "pak02_dir.vpk"), catalogVpk("red.vpk"));
  await expect(
    assertCatalogDisk(world.directory, "gamebanana-single", "extra-file"),
  ).rejects.toThrow();
});
