import { writeFile } from "node:fs/promises";
import path from "node:path";
import { CATALOG_MOD_ID, catalogVpk } from "./gamebanana-fixtures";
import { ALPHA } from "./profile-fixtures";
import { prepareRescanAfterResetWorld } from "./rescan-after-reset-fixtures";
import type { CreatedWorld } from "./world";

/**
 * Variants Mod Options parked for the enabled catalog mod. An enabled mod's
 * manifest entry doesn't list them, so only their name ties them to the mod.
 */
export const LEFTOVERS: readonly [string, string] = [
  `${CATALOG_MOD_ID}_green.vpk`,
  `${CATALOG_MOD_ID}_red.vpk`,
];
export const leftoverBytes = (name: string) =>
  catalogVpk(name.replace(`${CATALOG_MOD_ID}_`, ""));

/**
 * Profile Alpha from the re-scan fixture (catalog mod on `pak01` + `pak02`, a
 * local import on `pak03`, a recorded disabled mod and a hand-placed `pak04`),
 * plus the catalog mod's parked variants.
 */
export const prepareAnalyzeOrphansWorld = async (world: CreatedWorld) => {
  await prepareRescanAfterResetWorld(world);
  const directory = path.join(
    world.configuration.roots.game,
    "game",
    "citadel",
    "addons",
    ALPHA.folder,
  );
  for (const name of LEFTOVERS)
    await writeFile(path.join(directory, name), leftoverBytes(name));
};
