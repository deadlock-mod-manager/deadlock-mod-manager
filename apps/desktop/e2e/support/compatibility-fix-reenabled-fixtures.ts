import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectedModRoutes } from "./detected-mod-fixtures";
import type { FixtureRoute } from "./fixture-server";
import { CATALOG_MOD_ID } from "./gamebanana-fixtures";
import { prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk, localizationText } from "./vpk";
import type { CreatedWorld } from "./world";

// The catalog mod `detectedModRoutes` identifies every analyzed file as, and
// the only mod in the profile, so no other enabled mod keeps the repair
// package mounted.

export const REENABLE = {
  id: "profile_440_reenable",
  folder: "profile_440_reenable_reenable",
  name: "E2E Reenable",
};

export const REENABLED_MOD = CATALOG_MOD_ID;

const TEXT_FILE = "resource/localization/e2e_reenable/e2e_reenable_english.txt";

/** Fixable: its copy of a game text file lacks a game token. */
const reenabledModVpk = () =>
  buildSyntheticVpk([
    { path: TEXT_FILE, contents: localizationText({ e2e_kept: "Kept" }) },
  ]);

export const prepareReenabledFixWorld = async (
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
    [{ profile: REENABLE, modIds: [REENABLED_MOD], payload: reenabledModVpk }],
    REENABLE.id,
  );
};

// Analyze's hash lookup, plus the report counts the mod's page asks for.
export const reenabledFixRoutes = async () => {
  const detected = await detectedModRoutes();
  return (origin: string): FixtureRoute[] => [
    ...detected(origin),
    {
      method: "GET",
      path: `/api/v2/reports/mod/${REENABLED_MOD}/counts`,
      status: 200,
      body: JSON.stringify({ total: 0, open: 0, resolved: 0, dismissed: 0 }),
    },
  ];
};
