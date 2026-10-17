import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ALPHA,
  ALPHA_MODS,
  prepareProfileWorld,
  profilePayload,
} from "./profile-fixtures";
import { preparePresenceCache } from "./settings-fixtures";
import {
  assertOwnedWorld,
  collectFileInventory,
  type CreatedWorld,
} from "./world";

export const brokenProfileDirectory = (game: string) =>
  path.join(game, "game", "citadel", "addons", ALPHA.folder);

export const prepareBrokenStateWorld = async (world: CreatedWorld) => {
  await prepareProfileWorld(world);
  await preparePresenceCache(world);
  if (world.configuration.caseId !== "missing-vpks-launch") return;
  for (const modId of ALPHA_MODS) {
    const files = path.join(
      world.configuration.roots.appData,
      "mods",
      modId,
      "files",
    );
    await mkdir(files, { recursive: true });
    await writeFile(path.join(files, `${modId}.vpk`), profilePayload(modId));
  }
};

export const damageClosedWorld = async (
  world: string,
  kind: "folder" | "vpks" | "gameinfo",
) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const directory = brokenProfileDirectory(roots.game);
  // Validate the resolved deletion target even though the world is harness-owned.
  const relative = path.relative(roots.game, directory);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  if (kind === "folder") await rm(directory, { recursive: true });
  else if (kind === "vpks") {
    for (const file of Object.keys(await collectFileInventory(directory)))
      if (file.endsWith(".vpk")) await rm(path.join(directory, file));
  } else {
    const gameinfo = path.join(roots.game, "game", "citadel", "gameinfo.gi");
    const original = await readFile(gameinfo, "utf8");
    assert.match(original, /Game\s+citadel\/addons/);
    await writeFile(
      gameinfo,
      original.replace(/^.*Game\s+citadel\/addons[^\r\n]*\r?\n/gm, ""),
    );
  }
};
