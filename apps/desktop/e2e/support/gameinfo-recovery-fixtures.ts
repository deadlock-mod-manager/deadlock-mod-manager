import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ALPHA,
  prepareInstalledProfiles,
  profilePayload,
} from "./profile-fixtures";
import { preparePresenceCache } from "./settings-fixtures";
import type { CreatedWorld } from "./world";

export const RECOVERY_MOD = "local-alpha-one";
export const VANILLA_GAMEINFO =
  "GameInfo\n{\n  FileSystem\n  {\n    SearchPaths\n    {\n      Game citadel\n      Game core\n    }\n  }\n}\n";

export const prepareGameinfoRecoveryWorld = async (world: CreatedWorld) => {
  await prepareInstalledProfiles(
    world,
    [{ profile: ALPHA, modIds: [RECOVERY_MOD] }],
    ALPHA.id,
  );
  await preparePresenceCache(world);
  const source = path.join(
    world.configuration.roots.appData,
    "mods",
    RECOVERY_MOD,
    "files",
  );
  await mkdir(source, { recursive: true });
  await writeFile(
    path.join(source, `${RECOVERY_MOD}.vpk`),
    profilePayload(RECOVERY_MOD),
  );
  await writeFile(
    path.join(
      world.configuration.roots.game,
      "game",
      "citadel",
      "protected.txt",
    ),
    "Keep this file unchanged\n",
  );
};
