import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CATALOG_MOD_ID } from "./gamebanana-fixtures";
import { prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk, localizationText } from "./vpk";
import type { CreatedWorld } from "./world";

// One fixable catalog mod, the one `detectedModRoutes` identifies every
// analyzed file as.

export const PARKED = {
  id: "profile_440_parked",
  folder: "profile_440_parked_parked",
  name: "E2E Parked",
};

export const PARKED_MOD = CATALOG_MOD_ID;

const TEXT_FILE = "resource/localization/e2e_parked/e2e_parked_english.txt";

export const prepareParkedCopyWorld = async (
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
        profile: PARKED,
        modIds: [PARKED_MOD],
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
    PARKED.id,
  );
};
