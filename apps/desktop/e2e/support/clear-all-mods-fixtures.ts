import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ALPHA,
  ALPHA_MODS,
  BETA,
  BETA_MODS,
  prepareInstalledProfiles,
  profilePayload,
} from "./profile-fixtures";
import type { CreatedWorld } from "./world";

/** Also in Beta, so its downloaded files must survive clearing Alpha. */
export const SHARED_MOD = ALPHA_MODS[0];
/** Its download folder can't be deleted in the leftover case. */
export const LOCKED_MOD = ALPHA_MODS[1];
/** In Alpha's addons folder, but no mod in the manifest owns it. */
const UNTRACKED_VPK = "pak50_dir.vpk";
/** A variant Mod Options parked: a disabled copy the mod's entry omits. */
const PARKED_VPK = `${ALPHA_MODS[2]}_blue.vpk`;

export const modStorePath = (appData: string, modId: string) =>
  path.join(appData, "mods", modId);

export const prepareClearAllModsWorld = async (
  world: CreatedWorld,
  { lockedStore = false } = {},
): Promise<void> => {
  await prepareInstalledProfiles(
    world,
    [
      { profile: ALPHA, modIds: ALPHA_MODS },
      { profile: BETA, modIds: [...BETA_MODS, SHARED_MOD] },
    ],
    ALPHA.id,
  );
  const { roots } = world.configuration;
  const alpha = path.join(
    roots.game,
    "game",
    "citadel",
    "addons",
    ALPHA.folder,
  );
  await writeFile(path.join(alpha, UNTRACKED_VPK), profilePayload("untracked"));
  await writeFile(path.join(alpha, PARKED_VPK), profilePayload("parked"));
  for (const modId of ALPHA_MODS) {
    const store = modStorePath(roots.appData, modId);
    await mkdir(store, { recursive: true });
    await writeFile(path.join(store, "archive.zip"), `Download of ${modId}\n`);
  }
  // Entries can't be unlinked from a folder without write permission.
  if (lockedStore) await chmod(modStorePath(roots.appData, LOCKED_MOD), 0o555);
};
