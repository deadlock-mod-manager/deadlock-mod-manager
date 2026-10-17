import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { CreatedWorld } from "./world";

export const preparePresenceCache = async (world: CreatedWorld) => {
  await writeFile(
    path.join(
      world.configuration.roots.game,
      "game",
      "citadel",
      "hero_presence_cache_v2.json",
    ),
    JSON.stringify({
      inferno: {
        name: "Infernus",
        hideout_text: "In the Hideout",
        asset_key: "hero_inferno",
        image_url:
          "https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/inferno_sm.png",
      },
    }),
  );
};
