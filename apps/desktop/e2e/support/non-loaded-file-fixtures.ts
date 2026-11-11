import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectedModRoutes } from "./detected-mod-fixtures";
import { CATALOG_MOD_ID, createCatalogRoutes } from "./gamebanana-fixtures";
import { prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk, localizationText } from "./vpk";
import type { CreatedWorld } from "./world";

// A profile with one fixable catalog mod, and a file the player puts in the
// profile folder by hand under a name the game doesn't load.

export const NON_LOADED = {
  id: "profile_450_nonloaded",
  folder: "profile_450_nonloaded_nonloaded",
  name: "E2E Non-loaded",
};

export const FIXED_MOD = CATALOG_MOD_ID;

/** The game loads only `pak##_dir.vpk`, so it never loads this file. */
export const HAND_PLACED = "coolskin.vpk";

const TEXT_FILE =
  "resource/localization/e2e_nonloaded/e2e_nonloaded_english.txt";

export const handPlacedBytes = () =>
  buildSyntheticVpk([
    { path: "scripts/e2e-coolskin.txt", contents: "A hand-placed skin\n" },
  ]);

export const prepareNonLoadedFileWorld = async (
  world: CreatedWorld,
): Promise<void> => {
  const citadel = path.join(world.configuration.roots.game, "game", "citadel");
  await writeFile(
    path.join(citadel, "steam.inf"),
    "ClientVersion=7000\nServerVersion=7000\n",
  );
  const text = path.join(citadel, TEXT_FILE);
  await mkdir(path.dirname(text), { recursive: true });
  await writeFile(
    text,
    localizationText({ e2e_kept: "Kept", e2e_new: "New game text" }),
  );
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: NON_LOADED,
        modIds: [FIXED_MOD],
        // Fixable: its copy of a game text file lacks a game token.
        payload: () =>
          buildSyntheticVpk([
            {
              path: TEXT_FILE,
              contents: localizationText({ e2e_kept: "Kept" }),
            },
          ]),
      },
    ],
    NON_LOADED.id,
  );
};

/** The hash service knows no file, so the hand-placed one is unknown. */
export const unknownFileRoutes = async () => {
  const catalogRoutes = await createCatalogRoutes("gamebanana-switch-detected");
  return (origin: string) => [
    ...catalogRoutes(origin),
    {
      method: "POST",
      path: "/api/v2/vpk-analyse-hashes",
      status: 200,
      body: "[]",
    },
  ];
};

/** The hash service identifies every file as the fixable mod. */
export const matchedFileRoutes = detectedModRoutes;
