import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BETA, BETA_MODS, prepareInstalledProfiles } from "./profile-fixtures";
import type { CreatedWorld } from "./world";

export const brokenProfileDirectory = (game: string) =>
  path.join(game, "game", "citadel", "addons", BETA.folder);

// Seen in user installs: an inactive profile whose manifest has two mods
// claiming the same VPK. Nothing the active profile does should depend on it.
export const prepareBrokenProfileWorld = async (world: CreatedWorld) => {
  await prepareInstalledProfiles(
    world,
    [{ profile: BETA, modIds: BETA_MODS }],
    "default",
  );
  const directory = brokenProfileDirectory(world.configuration.roots.game);
  const manifestPath = path.join(directory, ".dmm.json");
  const manifest = z
    .looseObject({
      mods: z.record(
        z.string(),
        z.looseObject({ currentVpks: z.array(z.string()) }),
      ),
    })
    .parse(JSON.parse(await readFile(manifestPath, "utf8")));
  manifest.mods[BETA_MODS[1]].currentVpks = ["pak01_dir.vpk"];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await unlink(path.join(directory, "pak02_dir.vpk"));
};
