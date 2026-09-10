import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ALPHA, ALPHA_MODS, prepareProfileWorld } from "./profile-fixtures";
import { collectFileInventory, type CreatedWorld } from "./world";

export const filesystemModIds = (caseId: string): string[] =>
  caseId === "filesystem-shards"
    ? Array.from({ length: 100 }, (_, index) => `local-boundary-${index}`)
    : ALPHA_MODS;

export const prepareFilesystemWorld = async (
  world: CreatedWorld,
): Promise<void> => {
  const caseId = world.configuration.caseId;
  await prepareProfileWorld(
    world,
    filesystemModIds(caseId),
    caseId === "filesystem-collision" ? [1, 2, 4] : undefined,
  );
  const citadel = path.join(world.configuration.roots.game, "game", "citadel");
  if (caseId === "filesystem-collision") {
    const blocker = path.join(citadel, "addons", ALPHA.folder, "pak03_dir.vpk");
    await mkdir(blocker);
    await writeFile(
      path.join(blocker, "protected.txt"),
      "Destination collision sentinel\n",
    );
  }
  await writeFile(
    path.join(world.artifactsDirectory, "filesystem-baseline.json"),
    JSON.stringify(
      {
        citadel: await collectFileInventory(citadel),
        steam: await collectFileInventory(world.configuration.roots.steam),
        steamHttpCache: await collectFileInventory(
          world.configuration.roots.steamHttpCache,
        ),
      },
      null,
      2,
    ),
  );
};
