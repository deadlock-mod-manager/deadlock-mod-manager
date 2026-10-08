import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CATALOG_MOD_ID,
  catalogVpk,
  createCatalogRoutes,
} from "./gamebanana-fixtures";
import type { CreatedWorld } from "./world";

export const detectedModRoutes = async () => {
  const catalogRoutes = await createCatalogRoutes("gamebanana-switch-detected");
  return (origin: string) => [
    ...catalogRoutes(origin),
    {
      method: "POST",
      path: "/api/v2/vpk-analyse-hashes",
      status: 200,
      body: JSON.stringify([
        {
          matchedVpk: {
            id: "vpk_detected",
            provider: "gamebanana",
            submissionType: "mod",
            submissionId: CATALOG_MOD_ID,
            fileId: "910001",
            sourcePath: "common.vpk",
          },
          match: { certainty: 100, matchType: "sha256" },
        },
      ]),
    },
  ];
};

export const prepareDetectedModWorld = async (world: CreatedWorld) => {
  await writeFile(
    path.join(
      world.configuration.roots.game,
      "game",
      "citadel",
      "addons",
      "pak01_dir.vpk",
    ),
    catalogVpk("common.vpk"),
  );
};
