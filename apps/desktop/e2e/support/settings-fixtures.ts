import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { CreatedWorld } from "./world";

export const preparePresenceCache = async (world: CreatedWorld) => {
  await writeFile(
    path.join(
      world.configuration.roots.game,
      "game",
      "citadel",
      "hero_presence_cache.json",
    ),
    JSON.stringify({
      inferno: {
        name: "Infernus",
        hideout_text: "In the Hideout",
        asset_key: "hero_inferno",
      },
    }),
  );
};
